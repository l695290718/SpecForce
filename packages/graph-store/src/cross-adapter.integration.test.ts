import type {
  ArchitectureScopeRef,
  AssetNodeIdentity,
  GraphRelationship,
  GraphTraversalPlan,
  GraphTraversalResult,
  RelationshipCode
} from "@specforge/core";
import { describe, expect, it } from "vitest";
import {
  InMemoryGraphStore,
  NebulaGatewayGraphStore,
  PostgresGraphStore,
  type GraphProjectionSnapshot,
  type PostgresQueryClient
} from "./index";

const enterpriseId = "enterprise-huawei";
const designerScope: ArchitectureScopeRef = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const policyScope: ArchitectureScopeRef = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
};

const root = node(designerScope, "customer-api", "api");
const model = node(designerScope, "customer-model", "dataModel");
const event = node(designerScope, "customer-updated", "event");
const sibling = node(policyScope, "policy-model", "dataModel");
const reads = edge("10000000-0000-0000-0000-000000000001", "READS", root, model);
const carries = edge("10000000-0000-0000-0000-000000000002", "CARRIES", model, event);
const crossScope = edge("10000000-0000-0000-0000-000000000003", "READS", root, sibling);
const snapshot: GraphProjectionSnapshot = {
  nodes: [root, model, event, sibling],
  edges: [reads, carries, crossScope],
  graphVersion: 17n
};

const nodeIds = new Map<AssetNodeIdentity, string>([
  [root, "00000000-0000-0000-0000-000000000001"],
  [model, "00000000-0000-0000-0000-000000000002"],
  [event, "00000000-0000-0000-0000-000000000003"],
  [sibling, "00000000-0000-0000-0000-000000000004"]
]);

describe("PostgreSQL and Nebula GraphStore consistency", () => {
  it("returns equal exact-scope nodes and two-hop path evidence", async () => {
    const [postgres, nebula] = stores();

    const [postgresResult, nebulaResult] = await Promise.all([
      postgres.traverse(plan()),
      nebula.traverse(plan())
    ]);

    expect(comparable(postgresResult)).toEqual(comparable(nebulaResult));
    expect(postgresResult.status).toBe("COMPLETE");
    expect(postgresResult.paths.map((path) => path.nodes.map((item) => item.logicalId))).toContainEqual([
      "customer-api",
      "customer-model",
      "customer-updated"
    ]);
    assertExactScope(postgresResult);
    assertExactScope(nebulaResult);
  });

  it("returns equal partial state, evidence, frontier, and truncation reasons", async () => {
    const [postgres, nebula] = stores();
    const bounded = plan({ maxDepth: 1 });

    const [postgresResult, nebulaResult] = await Promise.all([
      postgres.traverse(bounded),
      nebula.traverse(bounded)
    ]);

    expect(comparable(postgresResult)).toEqual(comparable(nebulaResult));
    expect(postgresResult).toMatchObject({
      status: "PARTIAL",
      truncationReasons: ["MAX_DEPTH"]
    });
    expect(postgresResult.frontier.map((item) => item.logicalId)).toEqual(["customer-model"]);
    assertExactScope(postgresResult);
    assertExactScope(nebulaResult);
  });
});

function stores() {
  return [
    new PostgresGraphStore(postgresFixtureClient(), { enterpriseId }),
    new NebulaGatewayGraphStore({
      baseUrl: "http://graph-gateway.internal",
      enterpriseId,
      fetch: gatewayFixtureFetch()
    })
  ] as const;
}

function plan(overrides: Partial<GraphTraversalPlan> = {}): GraphTraversalPlan {
  return {
    startNodes: [root],
    authorizedScope: designerScope,
    relationRules: [
      { code: "READS", forwardPropagation: true },
      { code: "CARRIES", forwardPropagation: true }
    ],
    maxDepth: 2,
    maxNodes: 20,
    maxPaths: 20,
    timeoutMs: 10_000,
    ...overrides
  };
}

function postgresFixtureClient(): PostgresQueryClient {
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      assertQueryScope(values);
      if (query.includes('MAX("graphVersion")')) {
        return [{ graph_version: snapshot.graphVersion }] as T;
      }
      if (query.includes("start_nodes")) {
        const requested = JSON.parse(String(values[3])) as Array<Pick<AssetNodeIdentity, "nodeType" | "logicalId">>;
        const limit = Number(values[5]);
        return snapshot.nodes
          .filter((candidate) => requested.some((item) => item.nodeType === candidate.nodeType && item.logicalId === candidate.logicalId))
          .filter((candidate) => sameScope(candidate, designerScope))
          .slice(0, limit)
          .map((candidate) => row(candidate)) as T;
      }

      const currentId = String(values[3]);
      const visited = new Set((values[4] as string[]) ?? []);
      const rules = JSON.parse(String(values[5])) as Array<{
        code: RelationshipCode;
        forwardPropagation?: boolean;
        reversePropagation?: boolean;
        minConfidence?: number;
      }>;
      const limit = Number(values[7]);
      const candidates = snapshot.edges.flatMap((relationship) => {
        const rule = rules.find((candidate) => candidate.code === relationship.code);
        if (!rule || relationship.confidence < (rule.minConfidence ?? 0)) return [];
        const sourceId = nodeIds.get(relationship.source)!;
        const targetId = nodeIds.get(relationship.target)!;
        if (sourceId === currentId && rule.forwardPropagation && !visited.has(targetId)) {
          return [row(relationship.target, relationship)];
        }
        if (targetId === currentId && rule.reversePropagation && !visited.has(sourceId)) {
          return [row(relationship.source, relationship)];
        }
        return [];
      });
      return candidates.slice(0, limit) as T;
    }
  };
}

function gatewayFixtureFetch(): typeof globalThis.fetch {
  const graph = new InMemoryGraphStore(snapshot);
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      scope: typeof designerScope & { enterpriseId: string };
      startNodes: Array<AssetNodeIdentity & { enterpriseId: string }>;
      relationCodes: RelationshipCode[];
      maxDepth: number;
      maxNodes: number;
      maxPaths: number;
      timeoutMs: number;
      graphVersion?: string;
    };
    expect(body.scope).toEqual({ enterpriseId, ...designerScope });
    const result = await graph.traverse({
      startNodes: body.startNodes.map(withoutEnterprise),
      authorizedScope: designerScope,
      relationRules: body.relationCodes.map((code) => ({ code, forwardPropagation: true })),
      maxDepth: body.maxDepth,
      maxNodes: body.maxNodes,
      maxPaths: body.maxPaths,
      timeoutMs: body.timeoutMs,
      ...(body.graphVersion === undefined ? {} : { graphVersion: BigInt(body.graphVersion) })
    });
    return jsonResponse(gatewayResult(result));
  };
}

function gatewayResult(result: GraphTraversalResult) {
  return {
    ...result,
    graphVersion: result.graphVersion.toString(),
    nodes: result.nodes.map(withEnterprise),
    edges: result.edges.map(gatewayEdge),
    paths: result.paths.map((path) => ({
      nodes: path.nodes.map(withEnterprise),
      edges: path.edges.map(gatewayEdge)
    })),
    frontier: result.frontier.map(withEnterprise)
  };
}

function gatewayEdge(relationship: GraphRelationship) {
  return {
    ...relationship,
    source: withEnterprise(relationship.source),
    target: withEnterprise(relationship.target),
    version: relationship.version.toString()
  };
}

function comparable(result: GraphTraversalResult) {
  return {
    status: result.status,
    nodes: result.nodes,
    edges: result.edges,
    paths: result.paths,
    frontier: result.frontier,
    truncationReasons: result.truncationReasons,
    graphVersion: result.graphVersion
  };
}

function assertExactScope(result: GraphTraversalResult): void {
  expect(result.nodes.every((candidate) => sameScope(candidate, designerScope))).toBe(true);
  expect(result.nodes.map((candidate) => candidate.logicalId)).not.toContain(sibling.logicalId);
  expect(result.edges.every((relationship) =>
    sameScope(relationship.source, designerScope) && sameScope(relationship.target, designerScope)
  )).toBe(true);
}

function assertQueryScope(values: unknown[]): void {
  expect(values.slice(0, 3)).toEqual([
    enterpriseId,
    designerScope.applicationServiceId,
    designerScope.scopePath
  ]);
}

function row(candidate: AssetNodeIdentity, relationship?: GraphRelationship) {
  return {
    node_id: nodeIds.get(candidate)!,
    node_application_service_id: candidate.applicationServiceId,
    node_scope_path: candidate.scopePath,
    node_type: candidate.nodeType,
    logical_id: candidate.logicalId,
    root_asset_type: candidate.rootAssetType,
    root_asset_id: candidate.rootAssetId,
    parent_logical_id: candidate.parentLogicalId ?? null,
    edge_id: relationship?.id ?? null,
    edge_code: relationship?.code ?? null,
    edge_source_id: relationship ? nodeIds.get(relationship.source)! : null,
    edge_target_id: relationship ? nodeIds.get(relationship.target)! : null,
    edge_strength: relationship?.strength ?? null,
    edge_confidence: relationship?.confidence ?? null,
    edge_version: relationship?.version ?? null
  };
}

function node(
  scope: ArchitectureScopeRef,
  logicalId: string,
  nodeType: "api" | "dataModel" | "event"
): AssetNodeIdentity {
  return {
    ...scope,
    nodeType,
    logicalId,
    rootAssetType: nodeType,
    rootAssetId: logicalId
  };
}

function edge(
  id: string,
  code: RelationshipCode,
  source: AssetNodeIdentity,
  target: AssetNodeIdentity
): GraphRelationship {
  return { id, code, source, target, strength: "strong", confidence: 1, version: 17n };
}

function sameScope(candidate: ArchitectureScopeRef, scope: ArchitectureScopeRef): boolean {
  return candidate.applicationServiceId === scope.applicationServiceId && candidate.scopePath === scope.scopePath;
}

function withEnterprise(candidate: AssetNodeIdentity) {
  return { enterpriseId, ...candidate };
}

function withoutEnterprise(candidate: AssetNodeIdentity & { enterpriseId: string }): AssetNodeIdentity {
  const { enterpriseId: _enterpriseId, ...nodeIdentity } = candidate;
  return nodeIdentity;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
