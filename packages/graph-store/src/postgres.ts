import {
  createGraphTraversalResult,
  type ArchitectureScopeRef,
  type AssetNodeIdentity,
  type GraphEvidencePath,
  type GraphProjectionBatch,
  type GraphRelationship,
  type GraphStore,
  type GraphTraversalPlan,
  type GraphTraversalResult,
  type GraphTraversalTruncationReason,
  type ProjectionReceipt
} from "@specforge/core";
import { assertProjectionScope, nodeKey, sameScope, type TraversalOptions } from "./traversal";

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

interface TraversalState {
  nodeId: string;
  node: AssetNodeIdentity;
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
  visited: string[];
  depth: number;
}

export class PostgresGraphStore implements GraphStore {
  constructor(private readonly client: PostgresQueryClient, private readonly options: PostgresGraphStoreOptions) {}

  async traverse(plan: GraphTraversalPlan): Promise<GraphTraversalResult> {
    const now = this.options.now ?? Date.now;
    const startedAt = now();
    let graphVersion = plan.graphVersion ?? 0n;

    try {
      if (plan.graphVersion === undefined) graphVersion = await this.checkpoint(plan.authorizedScope);
      const startLimit = Math.min(plan.maxNodes, plan.maxPaths);
      const rootRows = await this.client.$queryRawUnsafe<TraversalRow[]>(ROOT_SQL,
        this.options.enterpriseId,
        plan.authorizedScope.applicationServiceId,
        plan.authorizedScope.scopePath,
        JSON.stringify(plan.startNodes.slice(0, startLimit).map((node) => ({ nodeType: node.nodeType, logicalId: node.logicalId }))),
        plan.timeoutMs,
        startLimit
      );
      return this.traverseBounded(plan, rootRows, graphVersion, now, startedAt);
    } catch (error) {
      if (!isQueryTimeout(error)) throw error;
      return queryTimeoutResult(plan, graphVersion, plan.startNodes, [], [], elapsed(now, startedAt));
    }
  }

  async upsertProjection(batch: GraphProjectionBatch): Promise<ProjectionReceipt> {
    assertProjectionScope(batch);
    const rows = await this.client.$queryRawUnsafe<Array<{ node_count: bigint | string | number; edge_count: bigint | string | number }>>(UPSERT_PROJECTION_SQL, this.options.enterpriseId, batch.scope.applicationServiceId, batch.scope.scopePath, batch.graphVersion, JSON.stringify(batch.nodes), JSON.stringify(batch.edges));
    const row = rows[0] ?? { node_count: 0, edge_count: 0 };
    return { graphVersion: batch.graphVersion, projectedNodeCount: Number(row.node_count), projectedEdgeCount: Number(row.edge_count) };
  }

  async checkpoint(scope: ArchitectureScopeRef): Promise<bigint> {
    const rows = await this.client.$queryRawUnsafe<Array<{ graph_version: bigint | string | number }>>(CHECKPOINT_SQL, this.options.enterpriseId, scope.applicationServiceId, scope.scopePath);
    return asBigInt(rows[0]?.graph_version ?? 0);
  }

  private async traverseBounded(plan: GraphTraversalPlan, rootRows: TraversalRow[], graphVersion: bigint, now: () => number, startedAt: number): Promise<GraphTraversalResult> {
    const states = rootRows
      .map((row) => ({ nodeId: row.node_id, node: nodeFromRow(row) }))
      .filter((state) => sameScope(state.node, plan.authorizedScope))
      .sort((left, right) => compareNodes(left.node, right.node))
      .map<TraversalState>((state) => ({ ...state, nodes: [state.node], edges: [], visited: [state.nodeId], depth: 0 }));
    const nodes = new Map(states.map((state) => [nodeKey(state.node), state.node]));
    const edges = new Map<string, GraphRelationship>();
    const paths: GraphEvidencePath[] = states.map((state) => ({ nodes: state.nodes, edges: state.edges }));
    const queue = [...states];

    if (plan.startNodes.length > Math.min(plan.maxNodes, plan.maxPaths)) {
      const reasons: GraphTraversalTruncationReason[] = [];
      if (plan.startNodes.length > plan.maxNodes) reasons.push("MAX_NODES");
      if (plan.startNodes.length > plan.maxPaths) reasons.push("MAX_PATHS");
      return partialResult(reasons, plan.startNodes.slice(Math.min(plan.maxNodes, plan.maxPaths)), nodes, edges, paths, graphVersion, elapsed(now, startedAt));
    }

    while (queue.length > 0) {
      if (elapsed(now, startedAt) >= plan.timeoutMs) return partialResult(["TIMEOUT"], queue.map((state) => state.node), nodes, edges, paths, graphVersion, elapsed(now, startedAt));
      const state = queue.shift()!;
      const remainingPaths = plan.maxPaths - paths.length;
      if (remainingPaths <= 0) return partialResult(["MAX_PATHS"], [state.node, ...queue.map((item) => item.node)], nodes, edges, paths, graphVersion, elapsed(now, startedAt));

      let candidates: TraversalRow[];
      try {
        candidates = await this.client.$queryRawUnsafe<TraversalRow[]>(ONE_HOP_SQL,
          this.options.enterpriseId,
          plan.authorizedScope.applicationServiceId,
          plan.authorizedScope.scopePath,
          state.nodeId,
          state.visited,
          JSON.stringify(plan.relationRules),
          plan.timeoutMs,
          state.depth >= plan.maxDepth ? 1 : remainingPaths + 1
        );
      } catch (error) {
        if (!isQueryTimeout(error)) throw error;
        return queryTimeoutResult(plan, graphVersion, [state.node, ...queue.map((item) => item.node)], nodes, paths, elapsed(now, startedAt));
      }

      const eligible = candidates
        .map((row) => ({ row, node: nodeFromRow(row) }))
        .filter((candidate) => sameScope(candidate.node, plan.authorizedScope))
        .sort((left, right) => compareRows(left.row, right.row));
      if (state.depth >= plan.maxDepth) {
        if (eligible.length > 0) return partialResult(["MAX_DEPTH"], [state.node, ...queue.map((item) => item.node)], nodes, edges, paths, graphVersion, elapsed(now, startedAt));
        continue;
      }

      const hasSentinel = candidates.length > remainingPaths;
      for (const candidate of eligible.slice(0, remainingPaths)) {
        if (elapsed(now, startedAt) >= plan.timeoutMs) return partialResult(["TIMEOUT"], [state.node, ...queue.map((item) => item.node)], nodes, edges, paths, graphVersion, elapsed(now, startedAt));
        const relationship = relationshipFromRow(candidate.row, state, candidate.node);
        if (!relationship) continue;
        const key = nodeKey(candidate.node);
        if (!nodes.has(key) && nodes.size >= plan.maxNodes) return partialResult(["MAX_NODES"], [state.node, ...queue.map((item) => item.node)], nodes, edges, paths, graphVersion, elapsed(now, startedAt));
        nodes.set(key, candidate.node);
        edges.set(relationship.id, relationship);
        const next: TraversalState = {
          nodeId: candidate.row.node_id,
          node: candidate.node,
          nodes: [...state.nodes, candidate.node],
          edges: [...state.edges, relationship],
          visited: [...state.visited, candidate.row.node_id],
          depth: state.depth + 1
        };
        paths.push({ nodes: next.nodes, edges: next.edges });
        queue.push(next);
      }
      if (hasSentinel) return partialResult(["MAX_PATHS"], [...eligible.slice(remainingPaths).map((candidate) => candidate.node), ...queue.map((item) => item.node)], nodes, edges, paths, graphVersion, elapsed(now, startedAt));
    }

    return createGraphTraversalResult({ status: "COMPLETE", nodes: sortedNodes(nodes), edges: sortedEdges(edges), paths: sortedPaths(paths), graphVersion, elapsedMs: elapsed(now, startedAt) });
  }
}

function nodeFromRow(row: TraversalRow): AssetNodeIdentity {
  return { applicationServiceId: row.node_application_service_id, scopePath: row.node_scope_path, nodeType: row.node_type, logicalId: row.logical_id, rootAssetType: row.root_asset_type, rootAssetId: row.root_asset_id, ...(row.parent_logical_id ? { parentLogicalId: row.parent_logical_id } : {}) };
}

function relationshipFromRow(row: TraversalRow, current: TraversalState, next: AssetNodeIdentity): GraphRelationship | undefined {
  if (!row.edge_id || !row.edge_code || !row.edge_source_id || !row.edge_target_id || !row.edge_strength || row.edge_confidence === null || row.edge_version === null) return undefined;
  const source = row.edge_source_id === current.nodeId ? current.node : next;
  const target = row.edge_target_id === current.nodeId ? current.node : next;
  return sameScope(source, current.node) && sameScope(target, current.node) ? { id: row.edge_id, code: row.edge_code, source, target, strength: row.edge_strength, confidence: row.edge_confidence, version: asBigInt(row.edge_version) } : undefined;
}

function partialResult(reasons: GraphTraversalTruncationReason[], frontier: AssetNodeIdentity[], nodes: Map<string, AssetNodeIdentity>, edges: Map<string, GraphRelationship>, paths: GraphEvidencePath[], graphVersion: bigint, elapsedMs: number): GraphTraversalResult {
  const uniqueFrontier = [...new Map(frontier.map((node) => [nodeKey(node), node])).values()].sort(compareNodes);
  return createGraphTraversalResult({ status: "PARTIAL", truncationReasons: [...new Set(reasons)].sort() as [GraphTraversalTruncationReason, ...GraphTraversalTruncationReason[]], frontier: [uniqueFrontier[0]!, ...uniqueFrontier.slice(1)], nodes: sortedNodes(nodes), edges: sortedEdges(edges), paths: sortedPaths(paths), graphVersion, elapsedMs });
}

function queryTimeoutResult(plan: GraphTraversalPlan, graphVersion: bigint, frontier: AssetNodeIdentity[], nodes: Map<string, AssetNodeIdentity> | AssetNodeIdentity[], paths: GraphEvidencePath[], elapsedMs: number): GraphTraversalResult {
  const nodeMap = Array.isArray(nodes) ? new Map(nodes.map((node) => [nodeKey(node), node])) : nodes;
  return partialResult(["QUERY_TIMEOUT"], frontier.length > 0 ? frontier : plan.startNodes, nodeMap, new Map(), paths, graphVersion, elapsedMs);
}

function isQueryTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string; meta?: { code?: string } }).code ?? (error as Error & { meta?: { code?: string } }).meta?.code;
  return code === "57014" || /statement timeout|query canceled|canceling statement/u.test(error.message);
}

function asBigInt(value: bigint | string | number): bigint { return typeof value === "bigint" ? value : BigInt(value); }
function elapsed(now: () => number, startedAt: number): number { return Math.max(0, now() - startedAt); }
function compareNodes(left: AssetNodeIdentity, right: AssetNodeIdentity): number { return nodeKey(left).localeCompare(nodeKey(right)); }
function compareRows(left: TraversalRow, right: TraversalRow): number { return [left.edge_id ?? "", left.node_id].join("\u0000").localeCompare([right.edge_id ?? "", right.node_id].join("\u0000")); }
function sortedNodes(nodes: Map<string, AssetNodeIdentity>): AssetNodeIdentity[] { return [...nodes.values()].sort(compareNodes); }
function sortedEdges(edges: Map<string, GraphRelationship>): GraphRelationship[] { return [...edges.values()].sort((left, right) => [left.id, nodeKey(left.source), nodeKey(left.target)].join("\u0000").localeCompare([right.id, nodeKey(right.source), nodeKey(right.target)].join("\u0000"))); }
function sortedPaths(paths: GraphEvidencePath[]): GraphEvidencePath[] { return [...paths].sort((left, right) => left.nodes.map(nodeKey).join("\u0001").localeCompare(right.nodes.map(nodeKey).join("\u0001"))); }

const CHECKPOINT_SQL = `SELECT COALESCE(MAX("graphVersion"), 0)::bigint AS graph_version FROM "RelationshipEvent" WHERE ("enterpriseId", "applicationServiceId", "scopePath") = ($1, $2, $3)`;

const ROOT_SQL = `
  WITH authorized_scope AS (SELECT $1::text AS enterprise_id, $2::text AS application_service_id, $3::text AS scope_path),
  query_budget AS MATERIALIZED (SELECT set_config('statement_timeout', $5::text, true) AS configured),
  start_nodes AS (SELECT * FROM jsonb_to_recordset($4::jsonb) AS start_node("nodeType" text, "logicalId" text))
  SELECT node."dbId"::text AS node_id, node."applicationServiceId" AS node_application_service_id, node."scopePath" AS node_scope_path, node."nodeType" AS node_type, node."logicalId" AS logical_id, node."rootAssetType" AS root_asset_type, node."rootAssetId" AS root_asset_id, NULL::text AS parent_logical_id,
    NULL::text AS edge_id, NULL::text AS edge_code, NULL::text AS edge_source_id, NULL::text AS edge_target_id, NULL::text AS edge_strength, NULL::double precision AS edge_confidence, NULL::bigint AS edge_version
  FROM "AssetNode" node JOIN start_nodes ON start_nodes."nodeType" = node."nodeType" AND start_nodes."logicalId" = node."logicalId" CROSS JOIN authorized_scope scope CROSS JOIN query_budget
  WHERE (node."enterpriseId", node."applicationServiceId", node."scopePath") = (scope.enterprise_id, scope.application_service_id, scope.scope_path)
  LIMIT $6
`;

const ONE_HOP_SQL = `
  WITH authorized_scope AS (SELECT $1::text AS enterprise_id, $2::text AS application_service_id, $3::text AS scope_path),
  query_budget AS MATERIALIZED (SELECT set_config('statement_timeout', $7::text, true) AS configured),
  rules AS (SELECT * FROM jsonb_to_recordset($6::jsonb) AS rule(code text, "forwardPropagation" boolean, "reversePropagation" boolean, "minConfidence" double precision))
  SELECT next_node."dbId"::text AS node_id, next_node."applicationServiceId" AS node_application_service_id, next_node."scopePath" AS node_scope_path, next_node."nodeType" AS node_type, next_node."logicalId" AS logical_id, next_node."rootAssetType" AS root_asset_type, next_node."rootAssetId" AS root_asset_id, NULL::text AS parent_logical_id,
    relationship."dbId"::text AS edge_id, relationship."relationType" AS edge_code, relationship."sourceNodeId"::text AS edge_source_id, relationship."targetNodeId"::text AS edge_target_id, relationship.strength AS edge_strength, relationship.confidence AS edge_confidence, relationship.version AS edge_version
  FROM "RelationshipCurrent" relationship CROSS JOIN authorized_scope scope CROSS JOIN query_budget
  JOIN rules ON rules.code = relationship."relationType" AND ((rules."forwardPropagation" IS TRUE AND relationship."sourceNodeId" = $4::uuid) OR (rules."reversePropagation" IS TRUE AND relationship."targetNodeId" = $4::uuid)) AND relationship.confidence >= COALESCE(rules."minConfidence", 0)
  JOIN "AssetNode" next_node ON next_node."dbId" = CASE WHEN relationship."sourceNodeId" = $4::uuid THEN relationship."targetNodeId" ELSE relationship."sourceNodeId" END
  WHERE (relationship."enterpriseId", relationship."applicationServiceId", relationship."scopePath") = (scope.enterprise_id, scope.application_service_id, scope.scope_path) AND NOT next_node."dbId" = ANY($5::uuid[])
  ORDER BY relationship."dbId"
  LIMIT $8
`;

const UPSERT_PROJECTION_SQL = `
  WITH scope AS (SELECT $1::text AS enterprise_id, $2::text AS application_service_id, $3::text AS scope_path),
  nodes AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS node("nodeType" text, "logicalId" text, "rootAssetType" text, "rootAssetId" text, "parentLogicalId" text)),
  inserted_nodes AS (
    INSERT INTO "AssetNode" ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId", "rootAssetType", "rootAssetId", "nodePath", "displayName", version, "lifecycleStatus")
    SELECT scope.enterprise_id, scope.application_service_id, scope.scope_path, nodes."nodeType", nodes."logicalId", nodes."rootAssetType", nodes."rootAssetId", nodes."logicalId", nodes."logicalId", $4::bigint, 'ACTIVE' FROM nodes CROSS JOIN scope
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId") DO UPDATE SET version = EXCLUDED.version, "lifecycleStatus" = 'ACTIVE', "updatedAt" = NOW() RETURNING "dbId"
  ), edges AS (SELECT * FROM jsonb_to_recordset($6::jsonb) AS edge(id text, code text, strength text, confidence double precision, "source" jsonb, "target" jsonb)),
  inserted_edges AS (
    INSERT INTO "RelationshipCurrent" ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", strength, confidence, source, "sourceReference", version)
    SELECT scope.enterprise_id, scope.application_service_id, scope.scope_path, source_node."dbId", target_node."dbId", edges.code, edges.strength, edges.confidence, 'graph-store-projection', edges.id, $4::bigint FROM edges CROSS JOIN scope
    JOIN "AssetNode" source_node ON source_node."enterpriseId" = scope.enterprise_id AND source_node."applicationServiceId" = scope.application_service_id AND source_node."scopePath" = scope.scope_path AND source_node."nodeType" = edges.source->>'nodeType' AND source_node."logicalId" = edges.source->>'logicalId'
    JOIN "AssetNode" target_node ON target_node."enterpriseId" = scope.enterprise_id AND target_node."applicationServiceId" = scope.application_service_id AND target_node."scopePath" = scope.scope_path AND target_node."nodeType" = edges.target->>'nodeType' AND target_node."logicalId" = edges.target->>'logicalId'
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", source, "sourceReference") DO UPDATE SET version = EXCLUDED.version, strength = EXCLUDED.strength, confidence = EXCLUDED.confidence, "lifecycleStatus" = 'ACTIVE', "updatedAt" = NOW() RETURNING "dbId"
  ) SELECT (SELECT COUNT(*) FROM inserted_nodes)::bigint AS node_count, (SELECT COUNT(*) FROM inserted_edges)::bigint AS edge_count
`;
