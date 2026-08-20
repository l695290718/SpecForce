import { describe, expect, it, vi } from "vitest";
import { HttpGraphGateway } from "./gateway.js";
import type { ClaimedProjection } from "./projector.js";

const event: ClaimedProjection = {
  id: "outbox-1",
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  relationshipEventId: "event-1",
  graphVersion: 8n,
  eventType: "GRAPH_PROJECTION",
  payload: {
    nodes: [{ nodeType: "api", logicalId: "api-1" }],
    edges: []
  },
  idempotencyKey: "relationship-command:outbox-1",
  status: "PENDING",
  attemptCount: 0
};

describe("HttpGraphGateway", () => {
  it("sends a structured exact-scope projection contract", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      graphVersion: "8",
      projectedNodeCount: 1,
      projectedEdgeCount: 0
    }), { status: 200 }));
    const fetch = fetchMock as unknown as typeof globalThis.fetch;
    const gateway = new HttpGraphGateway({
      baseUrl: "http://graph-gateway:8088/",
      fetch
    });

    await gateway.project(event);

    expect(fetch).toHaveBeenCalledWith("http://graph-gateway:8088/v1/projections", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" }
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      scope: exactScope(),
      graphVersion: "8",
      nodes: [{
        nodeType: "api",
        logicalId: "api-1",
        ...exactScope()
      }],
      edges: []
    });
  });

  it("forwards generation identity and qualifies every graph endpoint", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      graphVersion: "8",
      projection: generationIdentity(),
      projectedNodeCount: 2,
      projectedEdgeCount: 1
    }), { status: 200 }));
    const gateway = new HttpGraphGateway({
      baseUrl: "http://graph-gateway:8088",
      fetch: fetchMock as unknown as typeof globalThis.fetch
    });

    await gateway.project({
      ...event,
      payload: {
        projection: generationIdentity(),
        nodes: [
          { nodeType: "api", logicalId: "api-1" },
          { nodeType: "dataModel", logicalId: "model-1" }
        ],
        edges: [{
          id: "edge-1",
          code: "API_USES_MODEL",
          projectionOrdinal: "42",
          source: { nodeType: "api", logicalId: "api-1" },
          target: { nodeType: "dataModel", logicalId: "model-1" }
        }]
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      projection: Record<string, string>;
      nodes: Array<Record<string, unknown>>;
      edges: Array<{ source: Record<string, unknown>; target: Record<string, unknown> }>;
    };
    expect(body.projection).toEqual(generationIdentity());
    expect(body.nodes[0]?.projection).toEqual(generationIdentity());
    expect(body.edges[0]?.source.projection).toEqual(generationIdentity());
    expect(body.edges[0]?.target.projection).toEqual(generationIdentity());
  });

  it("rejects an endpoint carrying a different generation", async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const gateway = new HttpGraphGateway({ baseUrl: "http://graph-gateway:8088", fetch });

    await expect(gateway.project({
      ...event,
      payload: {
        projection: generationIdentity(),
        nodes: [{
          nodeType: "api",
          logicalId: "api-1",
          projection: { ...generationIdentity(), generationId: "generation-foreign" }
        }],
        edges: []
      }
    })).rejects.toThrow("PROJECTION_IDENTITY_MISMATCH");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported payloads before delivery", async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const gateway = new HttpGraphGateway({
      baseUrl: "http://graph-gateway:8088",
      fetch
    });

    await expect(gateway.project({
      ...event,
      payload: { eventId: "event-1", subject: {} }
    })).rejects.toThrow("GRAPH_PROJECTION_PAYLOAD_INVALID");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prevents payload fields from overriding the exact event scope", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      graphVersion: "8",
      projectedNodeCount: 1,
      projectedEdgeCount: 1
    }), { status: 200 }));
    const fetch = fetchMock as unknown as typeof globalThis.fetch;
    const gateway = new HttpGraphGateway({
      baseUrl: "http://graph-gateway:8088",
      fetch
    });
    const siblingScope = {
      enterpriseId: "foreign-enterprise",
      applicationServiceId: "com.huawei.celon.policyhub",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
    };

    await gateway.project({
      ...event,
      payload: {
        nodes: [{ ...siblingScope, nodeType: "api", logicalId: "api-1" }],
        edges: [{
          id: "edge-1",
          source: { ...siblingScope, nodeType: "api", logicalId: "api-1" },
          target: { ...siblingScope, nodeType: "dataModel", logicalId: "model-1" }
        }]
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<{ source: Record<string, unknown>; target: Record<string, unknown> }>;
    };
    expect(body.nodes[0]).toMatchObject(exactScope());
    expect(body.edges[0]?.source).toMatchObject(exactScope());
    expect(body.edges[0]?.target).toMatchObject(exactScope());
  });

  it("sanitizes Gateway response failures", async () => {
    const fetch = vi.fn(async () => new Response(
      "password=super-secret graph error",
      { status: 503 }
    )) as typeof globalThis.fetch;
    const gateway = new HttpGraphGateway({
      baseUrl: "http://graph-gateway:8088",
      fetch
    });

    await expect(gateway.project(event)).rejects.toThrow("GRAPH_GATEWAY_DELIVERY_FAILED");
  });

  it("requires a valid receipt for the delivered graph version", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      graphVersion: "7",
      projectedNodeCount: 1,
      projectedEdgeCount: 0
    }), { status: 200 })) as typeof globalThis.fetch;
    const gateway = new HttpGraphGateway({
      baseUrl: "http://graph-gateway:8088",
      fetch
    });

    await expect(gateway.project(event)).rejects.toThrow("GRAPH_GATEWAY_RECEIPT_INVALID");
  });
});

function exactScope() {
  return {
    enterpriseId: event.enterpriseId,
    applicationServiceId: event.applicationServiceId,
    scopePath: event.scopePath
  };
}

function generationIdentity() {
  return {
    baselineId: "baseline-1",
    manifestId: "manifest-1",
    generationId: "generation-1",
    schemaVersion: "nebula-v1"
  };
}
