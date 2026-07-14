import { describe, expect, it } from "vitest";
import { PostgresGraphStore, type PostgresQueryClient } from "./postgres";
import { graph, plan } from "./graph-store.contract.test";

const [event, , entity, api] = graph.nodes;
const reads = graph.edges.find((edge) => edge.code === "READS")!;
const carries = graph.edges.find((edge) => edge.code === "CARRIES")!;

describe("PostgresGraphStore", () => {
  it("supplies the eligible depth-boundary successor so traversal returns a partial frontier", async () => {
    const store = new PostgresGraphStore(depthBoundaryClient(), { enterpriseId: "enterprise-graph-store-test" });

    const result = await store.traverse(plan({ maxDepth: 1 }));

    expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_DEPTH"] });
    expect(result.frontier.map((node) => node.logicalId)).toEqual(["customer-entity"]);
    expect(result.nodes.map((node) => node.logicalId)).toEqual(["customer-api", "customer-entity"]);
  });

  it("bounds a high-branching database fetch to the remaining path capacity plus one sentinel", async () => {
    const client = highBranchingClient();
    const store = new PostgresGraphStore(client, { enterpriseId: "enterprise-graph-store-test" });

    const result = await store.traverse(plan({ maxPaths: 2 }));

    expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_PATHS"] });
    expect(result.frontier.map((node) => node.logicalId)).toEqual(["branch-one", "branch-two"]);
    expect(client.candidateLimits).toEqual([2]);
    expect(client.returnedCandidates).toBe(2);
  });

  it("maps a PostgreSQL statement cancellation to a partial query-timeout result", async () => {
    const store = new PostgresGraphStore(queryTimeoutClient(), { enterpriseId: "enterprise-graph-store-test" });

    const result = await store.traverse(plan());

    expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["TIMEOUT"] });
    expect(result.frontier.map((node) => node.logicalId)).toEqual(["customer-api"]);
  });

  it("uses one deadline across checkpoint and root resolution before the first hop", async () => {
    let time = 0;
    const queryTimeouts: number[] = [];
    let hopQueries = 0;
    const client: PostgresQueryClient = {
      async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
        if (query.includes('MAX("graphVersion")')) {
          queryTimeouts.push(values[3] as number);
          time = 6;
          return [{ graph_version: 7n }] as T;
        }
        if (query.includes("start_nodes")) {
          queryTimeouts.push(values[4] as number);
          time = 11;
          return [row("00000000-0000-0000-0000-000000000001", api!)] as T;
        }
        hopQueries += 1;
        return [] as T;
      }
    };
    const store = new PostgresGraphStore(client, { enterpriseId: "enterprise-graph-store-test", now: () => time });

    const result = await store.traverse(plan({ timeoutMs: 10 }));

    expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["TIMEOUT"], elapsedMs: 11 });
    expect(result.frontier.map((node) => node.logicalId)).toEqual(["customer-api"]);
    expect(queryTimeouts).toEqual([10, 4]);
    expect(hopQueries).toBe(0);
  });

  it("sorts reversed roots before sending the node-budget-limited root query", async () => {
    const store = new PostgresGraphStore(reversedRootClient(), { enterpriseId: "enterprise-graph-store-test" });

    const result = await store.traverse(plan({ startNodes: [entity!, api!], maxNodes: 1 }));

    expect(result.nodes.map((node) => node.logicalId)).toEqual(["customer-api"]);
    expect(result.paths.map((path) => path.nodes.map((node) => node.logicalId))).toEqual([["customer-api"]]);
    expect(result.frontier.map((node) => node.logicalId)).toEqual(["customer-entity"]);
  });

  it("rejects a cross-Scope projection before issuing PostgreSQL", async () => {
    let queryCount = 0;
    const client: PostgresQueryClient = {
      async $queryRawUnsafe<T>(): Promise<T> {
        queryCount += 1;
        return [] as T;
      }
    };
    const store = new PostgresGraphStore(client, { enterpriseId: "enterprise-graph-store-test" });

    await expect(store.upsertProjection({ scope: apiScope(), graphVersion: 8n, nodes: [graph.nodes[1]!], edges: [] })).rejects.toThrow("PROJECTION_SCOPE_MISMATCH");
    expect(queryCount).toBe(0);
  });
});

function depthBoundaryClient(): PostgresQueryClient {
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      if (query.includes('MAX("graphVersion")')) return [{ graph_version: 7n }] as T;
      if (query.includes("start_nodes")) return [row("00000000-0000-0000-0000-000000000001", api!)] as T;
      if (values[3] === "00000000-0000-0000-0000-000000000001") return [row("00000000-0000-0000-0000-000000000002", entity!, reads, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002")] as T;
      return [row("00000000-0000-0000-0000-000000000003", event!, carries, "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003")] as T;
    }
  };
}

function highBranchingClient() {
  const targetOne = { ...entity!, logicalId: "branch-one", rootAssetId: "branch-one" };
  const targetTwo = { ...entity!, logicalId: "branch-two", rootAssetId: "branch-two" };
  const client: PostgresQueryClient & { candidateLimits: number[]; returnedCandidates: number } = {
    candidateLimits: [] as number[],
    returnedCandidates: 0,
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      if (query.includes('MAX("graphVersion")')) return [{ graph_version: 7n }] as T;
      if (query.includes("start_nodes")) return [row("00000000-0000-0000-0000-000000000001", api!)] as T;
      client.candidateLimits.push(values.at(-1) as number);
      const rows = [
        row("00000000-0000-0000-0000-000000000002", targetOne, reads, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"),
        row("00000000-0000-0000-0000-000000000003", targetTwo, reads, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000003")
      ];
      client.returnedCandidates += rows.length;
      return rows as T;
    }
  };
  return client;
}

function queryTimeoutClient(): PostgresQueryClient {
  return {
    async $queryRawUnsafe<T>(query: string): Promise<T> {
      if (query.includes('MAX("graphVersion")')) return [{ graph_version: 7n }] as T;
      if (query.includes("start_nodes")) return [row("00000000-0000-0000-0000-000000000001", api!)] as T;
      throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    }
  };
}

function reversedRootClient(): PostgresQueryClient {
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      if (query.includes('MAX("graphVersion")')) return [{ graph_version: 7n }] as T;
      if (query.includes("start_nodes")) {
        const [first] = JSON.parse(values[3] as string) as Array<{ logicalId: string }>;
        return [row("00000000-0000-0000-0000-000000000001", first!.logicalId === "customer-api" ? api! : entity!)] as T;
      }
      return [] as T;
    }
  };
}

function apiScope() {
  return { applicationServiceId: api!.applicationServiceId, scopePath: api!.scopePath };
}

function row(id: string, node: NonNullable<typeof api>, relation?: typeof reads, sourceId?: string, targetId?: string) {
  return {
    node_id: id,
    node_application_service_id: node.applicationServiceId,
    node_scope_path: node.scopePath,
    node_type: node.nodeType,
    logical_id: node.logicalId,
    root_asset_type: node.rootAssetType,
    root_asset_id: node.rootAssetId,
    parent_logical_id: null,
    edge_id: relation ? `10000000-0000-0000-0000-${relation.id.padStart(12, "0")}` : null,
    edge_code: relation?.code ?? null,
    edge_source_id: sourceId ?? null,
    edge_target_id: targetId ?? null,
    edge_strength: relation?.strength ?? null,
    edge_confidence: relation?.confidence ?? null,
    edge_version: relation?.version ?? null
  };
}
