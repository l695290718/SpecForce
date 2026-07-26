import { describe, expect, it, vi } from "vitest";
import type {
  ArchitectureScopeRef,
  AssetNodeIdentity,
  GraphProjectionBatch,
  GraphRelationship,
  GraphTraversalPlan
} from "@specforge/core";
import { createGraphStore, GraphGatewayUnavailableError, NebulaGatewayGraphStore } from "./index";

const enterpriseId = "enterprise-huawei";
const scope: ArchitectureScopeRef = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

function node(logicalId: string, nodeType: AssetNodeIdentity["nodeType"] = "dataModel"): AssetNodeIdentity {
  return { ...scope, nodeType, logicalId, rootAssetType: "dataModel", rootAssetId: logicalId };
}

function edge(source: AssetNodeIdentity, target: AssetNodeIdentity): GraphRelationship {
  return {
    id: "relationship-1",
    code: "READS",
    source,
    target,
    strength: "strong",
    confidence: 1,
    version: 17n
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("NebulaGatewayGraphStore", () => {
  it("forwards the exact three-part scope and bigint projection fields", async () => {
    const source = node("customer-api", "api");
    const target = node("customer-model");
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return jsonResponse({ graphVersion: "17", projectedNodeCount: 2, projectedEdgeCount: 1 });
    }) as typeof globalThis.fetch;
    const store = createGraphStore({ kind: "nebula", baseUrl: "http://gateway.internal/", enterpriseId, fetch });
    const batch: GraphProjectionBatch = {
      scope,
      graphVersion: 17n,
      nodes: [source, target],
      edges: [edge(source, target)]
    };

    const receipt = await store.upsertProjection(batch);

    expect(receipt).toEqual({ graphVersion: 17n, projectedNodeCount: 2, projectedEdgeCount: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("http://gateway.internal/v1/projections");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    const requestBody = JSON.parse(String(calls[0]?.init?.body));
    expect(requestBody).toMatchObject({
      scope: { enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
      graphVersion: "17"
    });
    expect(requestBody.nodes).toHaveLength(2);
    expect(requestBody.nodes[0]).toMatchObject({
      enterpriseId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      logicalId: "customer-api"
    });
    expect(requestBody.edges).toHaveLength(1);
    expect(requestBody.edges[0]).toMatchObject({
      version: "17",
      source: { enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
      target: { enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }
    });
  });

  it("maps typed traversal output and propagates the traversal abort budget", async () => {
    const source = node("customer-api", "api");
    const target = node("customer-model");
    const relationship = edge(source, target);
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(init?.body))).toMatchObject({
        scope: { enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
        relationCodes: ["READS"],
        timeoutMs: 1250
      });
      return jsonResponse({
        status: "COMPLETE",
        nodes: [
          { enterpriseId, ...source },
          { enterpriseId, ...target }
        ],
        edges: [
          {
            ...relationship,
            version: "17",
            source: { enterpriseId, ...source },
            target: { enterpriseId, ...target }
          }
        ],
        paths: [
          {
            nodes: [
              { enterpriseId, ...source },
              { enterpriseId, ...target }
            ],
            edges: [
              {
                ...relationship,
                version: "17",
                source: { enterpriseId, ...source },
                target: { enterpriseId, ...target }
              }
            ]
          }
        ],
        graphVersion: "17",
        elapsedMs: 8,
        truncationReasons: []
      });
    }) as typeof globalThis.fetch;
    const store = new NebulaGatewayGraphStore({ baseUrl: "http://gateway.internal", enterpriseId, fetch });
    const plan: GraphTraversalPlan = {
      startNodes: [source],
      authorizedScope: scope,
      relationRules: [{ code: "READS", forwardPropagation: true }],
      maxDepth: 2,
      maxNodes: 20,
      maxPaths: 20,
      timeoutMs: 1250
    };

    const result = await store.traverse(plan);

    expect(result).toEqual({
      status: "COMPLETE",
      nodes: [source, target],
      edges: [relationship],
      paths: [{ nodes: [source, target], edges: [relationship] }],
      frontier: [],
      truncationReasons: [],
      graphVersion: 17n,
      elapsedMs: 8
    });
  });

  it("encodes the exact scope in the checkpoint path", async () => {
    const fetch = vi.fn(async () => jsonResponse({ graphVersion: "19" })) as typeof globalThis.fetch;
    const store = new NebulaGatewayGraphStore({ baseUrl: "http://gateway.internal", enterpriseId, fetch });

    await expect(store.checkpoint(scope)).resolves.toBe(19n);

    const url = String(fetch.mock.calls[0]?.[0]);
    const encodedScope = url.slice(url.lastIndexOf("/") + 1);
    const base64 = encodedScope.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encodedScope.length / 4) * 4, "=");
    const decodedScope = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))));
    expect(decodedScope).toEqual({ enterpriseId, ...scope });
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("maps transport failures to GRAPH_GATEWAY_UNAVAILABLE", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("connect ECONNREFUSED with internal details");
    }) as typeof globalThis.fetch;
    const store = new NebulaGatewayGraphStore({ baseUrl: "http://gateway.internal", enterpriseId, fetch });

    const error = await store.checkpoint(scope).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GraphGatewayUnavailableError);
    expect(error).toMatchObject({ message: "GRAPH_GATEWAY_UNAVAILABLE", code: "GRAPH_GATEWAY_UNAVAILABLE" });
  });

  it("rejects an empty scope before issuing any request", async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const store = new NebulaGatewayGraphStore({ baseUrl: "http://gateway.internal", enterpriseId, fetch });

    await expect(store.checkpoint({ applicationServiceId: "", scopePath: scope.scopePath })).rejects.toThrow("GRAPH_SCOPE_REQUIRED");
    expect(fetch).not.toHaveBeenCalled();
  });
});
