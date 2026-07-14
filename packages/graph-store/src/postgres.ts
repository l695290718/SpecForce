import type { ArchitectureScopeRef, AssetNodeIdentity, GraphProjectionBatch, GraphRelationship, GraphStore, ProjectionReceipt } from "@specforge/core";
import { snapshotStore, type GraphProjectionSnapshot, type TraversalOptions } from "./traversal";

export interface PostgresQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface PostgresGraphStoreOptions extends TraversalOptions {
  enterpriseId: string;
}

interface TraversalRow {
  node_id: string;
  node_application_service_id: string;
  node_scope_path: string;
  node_type: AssetNodeIdentity["nodeType"];
  logical_id: string;
  root_asset_type: AssetNodeIdentity["rootAssetType"];
  root_asset_id: string;
  parent_logical_id: string | null;
  edge_id: string | null;
  edge_code: GraphRelationship["code"] | null;
  edge_source_id: string | null;
  edge_target_id: string | null;
  edge_strength: GraphRelationship["strength"] | null;
  edge_confidence: number | null;
  edge_version: bigint | string | number | null;
}

export class PostgresGraphStore implements GraphStore {
  constructor(private readonly client: PostgresQueryClient, private readonly options: PostgresGraphStoreOptions) {}

  async traverse(plan: Parameters<GraphStore["traverse"]>[0]) {
    const graphVersion = plan.graphVersion ?? await this.checkpoint(plan.authorizedScope);
    const rows = await this.client.$queryRawUnsafe<TraversalRow[]>(TRAVERSAL_SQL, this.options.enterpriseId, plan.authorizedScope.applicationServiceId, plan.authorizedScope.scopePath, JSON.stringify(plan.startNodes.map((node) => ({ nodeType: node.nodeType, logicalId: node.logicalId }))), JSON.stringify(plan.relationRules), plan.maxDepth, plan.timeoutMs);
    const nodesById = new Map<string, AssetNodeIdentity>();
    for (const row of rows) nodesById.set(row.node_id, nodeFromRow(row));
    const edges = rows.flatMap((row) => {
      if (!row.edge_id || !row.edge_code || !row.edge_source_id || !row.edge_target_id || !row.edge_strength || row.edge_confidence === null || row.edge_version === null) return [];
      const source = nodesById.get(row.edge_source_id);
      const target = nodesById.get(row.edge_target_id);
      return source && target ? [{ id: row.edge_id, code: row.edge_code, source, target, strength: row.edge_strength, confidence: row.edge_confidence, version: asBigInt(row.edge_version) }] : [];
    });
    return snapshotStore({ nodes: [...nodesById.values()], edges, graphVersion }, this.options).traverse(plan);
  }

  async upsertProjection(batch: GraphProjectionBatch): Promise<ProjectionReceipt> {
    const rows = await this.client.$queryRawUnsafe<Array<{ node_count: bigint | string | number; edge_count: bigint | string | number }>>(UPSERT_PROJECTION_SQL, this.options.enterpriseId, batch.scope.applicationServiceId, batch.scope.scopePath, batch.graphVersion, JSON.stringify(batch.nodes), JSON.stringify(batch.edges));
    const row = rows[0] ?? { node_count: 0, edge_count: 0 };
    return { graphVersion: batch.graphVersion, projectedNodeCount: Number(row.node_count), projectedEdgeCount: Number(row.edge_count) };
  }

  async checkpoint(scope: ArchitectureScopeRef): Promise<bigint> {
    const rows = await this.client.$queryRawUnsafe<Array<{ graph_version: bigint | string | number }>>(CHECKPOINT_SQL, this.options.enterpriseId, scope.applicationServiceId, scope.scopePath);
    return asBigInt(rows[0]?.graph_version ?? 0);
  }
}

function nodeFromRow(row: TraversalRow): AssetNodeIdentity {
  return {
    applicationServiceId: row.node_application_service_id,
    scopePath: row.node_scope_path,
    nodeType: row.node_type,
    logicalId: row.logical_id,
    rootAssetType: row.root_asset_type,
    rootAssetId: row.root_asset_id,
    ...(row.parent_logical_id ? { parentLogicalId: row.parent_logical_id } : {})
  };
}

function asBigInt(value: bigint | string | number): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

const CHECKPOINT_SQL = `
  SELECT COALESCE(MAX("graphVersion"), 0)::bigint AS graph_version
  FROM "RelationshipEvent"
  WHERE ("enterpriseId", "applicationServiceId", "scopePath") = ($1, $2, $3)
`;

// The scope tuple appears exactly once in the anchor and once in the recursive term.
const TRAVERSAL_SQL = `
  WITH RECURSIVE authorized_scope AS (
    SELECT $1::text AS enterprise_id, $2::text AS application_service_id, $3::text AS scope_path
  ), query_budget AS MATERIALIZED (
    SELECT set_config('statement_timeout', $7::text, true) AS configured
  ), roots AS (
    SELECT * FROM jsonb_to_recordset($4::jsonb) AS root("nodeType" text, "logicalId" text)
  ), rules AS (
    SELECT * FROM jsonb_to_recordset($5::jsonb) AS rule(code text, "forwardPropagation" boolean, "reversePropagation" boolean, "minConfidence" double precision)
  ), traversal AS (
    SELECT node."dbId" AS node_id, node."applicationServiceId" AS node_application_service_id, node."scopePath" AS node_scope_path, node."nodeType" AS node_type, node."logicalId" AS logical_id,
      node."rootAssetType" AS root_asset_type, node."rootAssetId" AS root_asset_id,
      NULL::text AS parent_logical_id, ARRAY[node."dbId"]::uuid[] AS visited, 0 AS depth,
      NULL::uuid AS edge_id, NULL::text AS edge_code, NULL::uuid AS edge_source_id, NULL::uuid AS edge_target_id,
      NULL::text AS edge_strength, NULL::double precision AS edge_confidence, NULL::bigint AS edge_version
    FROM "AssetNode" node
    JOIN roots ON roots."nodeType" = node."nodeType" AND roots."logicalId" = node."logicalId"
    CROSS JOIN authorized_scope scope
    CROSS JOIN query_budget
    WHERE (node."enterpriseId", node."applicationServiceId", node."scopePath") = (scope.enterprise_id, scope.application_service_id, scope.scope_path)

    UNION ALL

    SELECT next_node."dbId", next_node."applicationServiceId", next_node."scopePath", next_node."nodeType", next_node."logicalId", next_node."rootAssetType", next_node."rootAssetId",
      NULL::text, traversal.visited || next_node."dbId", traversal.depth + 1,
      relationship."dbId", relationship."relationType", relationship."sourceNodeId", relationship."targetNodeId",
      relationship.strength, relationship.confidence, relationship.version
    FROM traversal
    CROSS JOIN authorized_scope scope
    JOIN "RelationshipCurrent" relationship ON (relationship."enterpriseId", relationship."applicationServiceId", relationship."scopePath") = (scope.enterprise_id, scope.application_service_id, scope.scope_path)
      AND relationship."lifecycleStatus" = 'ACTIVE'
    JOIN rules ON rules.code = relationship."relationType"
      AND ((rules."forwardPropagation" IS TRUE AND relationship."sourceNodeId" = traversal.node_id)
        OR (rules."reversePropagation" IS TRUE AND relationship."targetNodeId" = traversal.node_id))
      AND relationship.confidence >= COALESCE(rules."minConfidence", 0)
    JOIN "AssetNode" next_node ON next_node."dbId" = CASE WHEN relationship."sourceNodeId" = traversal.node_id THEN relationship."targetNodeId" ELSE relationship."sourceNodeId" END
    WHERE traversal.depth < $6
      AND NOT next_node."dbId" = ANY(traversal.visited)
  ), depth_frontier AS (
    SELECT next_node."dbId" AS node_id, next_node."applicationServiceId" AS node_application_service_id, next_node."scopePath" AS node_scope_path, next_node."nodeType" AS node_type, next_node."logicalId" AS logical_id,
      next_node."rootAssetType" AS root_asset_type, next_node."rootAssetId" AS root_asset_id,
      NULL::text AS parent_logical_id, traversal.visited || next_node."dbId" AS visited, traversal.depth + 1 AS depth,
      relationship."dbId" AS edge_id, relationship."relationType" AS edge_code, relationship."sourceNodeId" AS edge_source_id, relationship."targetNodeId" AS edge_target_id,
      relationship.strength AS edge_strength, relationship.confidence AS edge_confidence, relationship.version AS edge_version
    FROM traversal
    CROSS JOIN authorized_scope scope
    JOIN "RelationshipCurrent" relationship ON (relationship."enterpriseId", relationship."applicationServiceId", relationship."scopePath") = (scope.enterprise_id, scope.application_service_id, scope.scope_path)
      AND relationship."lifecycleStatus" = 'ACTIVE'
    JOIN rules ON rules.code = relationship."relationType"
      AND ((rules."forwardPropagation" IS TRUE AND relationship."sourceNodeId" = traversal.node_id)
        OR (rules."reversePropagation" IS TRUE AND relationship."targetNodeId" = traversal.node_id))
      AND relationship.confidence >= COALESCE(rules."minConfidence", 0)
    JOIN "AssetNode" next_node ON next_node."dbId" = CASE WHEN relationship."sourceNodeId" = traversal.node_id THEN relationship."targetNodeId" ELSE relationship."sourceNodeId" END
    WHERE traversal.depth = $6
      AND NOT next_node."dbId" = ANY(traversal.visited)
  ), combined AS (
    SELECT * FROM traversal
    UNION ALL
    SELECT * FROM depth_frontier
  )
  SELECT node_id::text, node_application_service_id, node_scope_path, node_type, logical_id, root_asset_type, root_asset_id, parent_logical_id,
    edge_id::text, edge_code, edge_source_id::text, edge_target_id::text, edge_strength, edge_confidence, edge_version
  FROM combined
  ORDER BY depth, logical_id, edge_id
`;

const UPSERT_PROJECTION_SQL = `
  WITH scope AS (SELECT $1::text AS enterprise_id, $2::text AS application_service_id, $3::text AS scope_path),
  nodes AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS node("nodeType" text, "logicalId" text, "rootAssetType" text, "rootAssetId" text, "parentLogicalId" text)),
  inserted_nodes AS (
    INSERT INTO "AssetNode" ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId", "rootAssetType", "rootAssetId", "nodePath", "displayName", version, "lifecycleStatus")
    SELECT scope.enterprise_id, scope.application_service_id, scope.scope_path, nodes."nodeType", nodes."logicalId", nodes."rootAssetType", nodes."rootAssetId", nodes."logicalId", nodes."logicalId", $4::bigint, 'ACTIVE'
    FROM nodes CROSS JOIN scope
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId") DO UPDATE SET version = EXCLUDED.version, "lifecycleStatus" = 'ACTIVE', "updatedAt" = NOW()
    RETURNING "dbId"
  ), edges AS (SELECT * FROM jsonb_to_recordset($6::jsonb) AS edge(id text, code text, strength text, confidence double precision, "source" jsonb, "target" jsonb)),
  inserted_edges AS (
    INSERT INTO "RelationshipCurrent" ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", strength, confidence, source, "sourceReference", version)
    SELECT scope.enterprise_id, scope.application_service_id, scope.scope_path, source_node."dbId", target_node."dbId", edges.code, edges.strength, edges.confidence, 'graph-store-projection', edges.id, $4::bigint
    FROM edges CROSS JOIN scope
    JOIN "AssetNode" source_node ON source_node."enterpriseId" = scope.enterprise_id AND source_node."applicationServiceId" = scope.application_service_id AND source_node."scopePath" = scope.scope_path AND source_node."nodeType" = edges.source->>'nodeType' AND source_node."logicalId" = edges.source->>'logicalId'
    JOIN "AssetNode" target_node ON target_node."enterpriseId" = scope.enterprise_id AND target_node."applicationServiceId" = scope.application_service_id AND target_node."scopePath" = scope.scope_path AND target_node."nodeType" = edges.target->>'nodeType' AND target_node."logicalId" = edges.target->>'logicalId'
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", source, "sourceReference") DO UPDATE SET version = EXCLUDED.version, strength = EXCLUDED.strength, confidence = EXCLUDED.confidence, "lifecycleStatus" = 'ACTIVE', "updatedAt" = NOW()
    RETURNING "dbId"
  )
  SELECT (SELECT COUNT(*) FROM inserted_nodes)::bigint AS node_count, (SELECT COUNT(*) FROM inserted_edges)::bigint AS edge_count
`;
