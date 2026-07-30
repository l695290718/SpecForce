import type { ClaimedProjection, GraphGateway, ProjectionScope } from "./projector.js";

export interface HttpGraphGatewayOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
  resolvePayload?: ProjectionPayloadResolver;
}

export interface ProjectionPayload {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export type ProjectionPayloadResolver = (event: ClaimedProjection) => ProjectionPayload | Promise<ProjectionPayload>;

export class HttpGraphGateway implements GraphGateway {
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly requestTimeoutMs: number;
  private readonly resolvePayload: ProjectionPayloadResolver;

  constructor(options: HttpGraphGatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.resolvePayload = options.resolvePayload ?? payloadFromCanonicalEnvelope;
  }

  async project(event: ClaimedProjection): Promise<void> {
    const { nodes, edges } = await this.resolvePayload(event);
    const scope = exactScope(event);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}/v1/projections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          graphVersion: event.graphVersion.toString(),
          nodes: nodes.map((node) => ({ ...node, ...scope })),
          edges: edges.map((edge) => scopedEdge(edge, scope))
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("GRAPH_GATEWAY_DELIVERY_FAILED");
      const receipt = await response.json().catch(() => undefined);
      if (
        !isRecord(receipt) ||
        receipt.graphVersion !== event.graphVersion.toString() ||
        !isNonNegativeInteger(receipt.projectedNodeCount) ||
        !isNonNegativeInteger(receipt.projectedEdgeCount)
      ) {
        throw new Error("GRAPH_GATEWAY_RECEIPT_INVALID");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "GRAPH_GATEWAY_DELIVERY_FAILED" || error.message === "GRAPH_GATEWAY_RECEIPT_INVALID")
      ) {
        throw error;
      }
      throw new Error("GRAPH_GATEWAY_DELIVERY_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function payloadFromCanonicalEnvelope(event: ClaimedProjection): ProjectionPayload {
  const nodes = recordArray(event.payload.nodes);
  const edges = recordArray(event.payload.edges);
  if (nodes === undefined || edges === undefined) throw new Error("GRAPH_PROJECTION_PAYLOAD_INVALID");
  return { nodes, edges };
}

function exactScope(event: ClaimedProjection): ProjectionScope {
  return {
    enterpriseId: event.enterpriseId,
    applicationServiceId: event.applicationServiceId,
    scopePath: event.scopePath
  };
}

function recordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) return undefined;
  return value as Array<Record<string, unknown>>;
}

function scopedEdge(edge: Record<string, unknown>, scope: ProjectionScope): Record<string, unknown> {
  return {
    ...edge,
    source: isRecord(edge.source) ? { ...edge.source, ...scope } : edge.source,
    target: isRecord(edge.target) ? { ...edge.target, ...scope } : edge.target
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
