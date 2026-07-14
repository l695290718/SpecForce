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
});

function depthBoundaryClient(): PostgresQueryClient {
  return {
    async $queryRawUnsafe<T>(query: string): Promise<T> {
      if (query.includes('MAX("graphVersion")')) return [{ graph_version: 7n }] as T;
      const rows = [
        row("00000000-0000-0000-0000-000000000001", api!),
        row("00000000-0000-0000-0000-000000000002", entity!, reads, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002")
      ];
      if (query.includes("depth_frontier")) {
        rows.push(row("00000000-0000-0000-0000-000000000003", event!, carries, "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003"));
      }
      return rows as T;
    }
  };
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
