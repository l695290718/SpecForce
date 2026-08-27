import { describe, expect, it } from "vitest";
import type { DataModelGraphResponse } from "@specforge/core";
import { DATA_MODEL_GRAPH_CLIENT_CAPACITY, DATA_MODEL_GRAPH_INITIAL_PAGE_SIZE, readCompleteDataModelGraph, shouldFetchDataModelGraph } from "./data-model-graph-fetch";

const scope = { applicationServiceId: "svc", scopePath: "scope" };
const waterlines = { catalogVersion: "1", catalogDigest: "catalog", relationshipVersion: "1", relationshipDigest: "relations" };

function page(overrides: Partial<DataModelGraphResponse> = {}): DataModelGraphResponse {
  return { architectureScope: scope, mode: "MODEL", rootModelId: "model", nodes: [], edges: [], waterlines, hasMore: false, partial: false, errors: [], ...overrides };
}

describe("readCompleteDataModelGraph", () => {
  it("only enables graph requests for the ER view", () => {
    expect(shouldFetchDataModelGraph("list")).toBe(false);
    expect(shouldFetchDataModelGraph("er")).toBe(true);
  });

  it("uses the declared bounded initial page parameters", async () => {
    let requestUrl = "";
    await readCompleteDataModelGraph({
      query: `scope=svc&scopePath=scope&pageSize=${DATA_MODEL_GRAPH_INITIAL_PAGE_SIZE}&clientCapacity=${DATA_MODEL_GRAPH_CLIENT_CAPACITY}`,
      headers: {},
      fetchImpl: async (url) => {
        requestUrl = String(url);
        return new Response(JSON.stringify(page()), { status: 200 });
      }
    });

    const request = new URL(requestUrl, "http://localhost");
    expect(request.searchParams.get("pageSize")).toBe(String(DATA_MODEL_GRAPH_INITIAL_PAGE_SIZE));
    expect(request.searchParams.get("clientCapacity")).toBe(String(DATA_MODEL_GRAPH_CLIENT_CAPACITY));
  });

  it("follows cursors and keeps all pages on one waterline", async () => {
    const calls: string[] = [];
    const pages = [
      page({ nodes: [{ id: "dataEntity:one", nodeType: "dataEntity", logicalId: "one", rootModelId: "model", displayName: "One", scope, metadata: {} }], hasMore: true, nextCursor: "cursor-2" }),
      page({ nodes: [{ id: "dataField:one.id", nodeType: "dataField", logicalId: "one.id", rootModelId: "model", displayName: "id", scope, metadata: { entityId: "one" } }] })
    ];
    const result = await readCompleteDataModelGraph({ query: "scope=svc&scopePath=scope&pageSize=1", headers: {}, fetchImpl: async (url) => { calls.push(String(url)); return new Response(JSON.stringify(pages[calls.length - 1]), { status: 200 }); } });

    expect(result).toHaveLength(2);
    expect(result.flatMap((item) => item.nodes).map((item) => item.id)).toEqual(["dataEntity:one", "dataField:one.id"]);
    expect(calls[1]).toContain("cursor=cursor-2");
  });

  it("rejects a waterline change while paging", async () => {
    let index = 0;
    await expect(readCompleteDataModelGraph({ query: "scope=svc", headers: {}, fetchImpl: async () => {
      index += 1;
      return new Response(JSON.stringify(page(index === 1 ? { hasMore: true, nextCursor: "next" } : { waterlines: { ...waterlines, catalogDigest: "changed" } })), { status: 200 });
    } })).rejects.toThrow("SNAPSHOT_CHANGED");
  });
});
