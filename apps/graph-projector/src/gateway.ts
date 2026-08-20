import {
  projectionIdentityFromEvent,
  sameProjectionIdentity,
  type ClaimedProjection,
  type GraphGateway,
  type ProjectionIdentity,
  type ProjectionScope
} from "./projector.js";

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
    const projection = projectionIdentityFromEvent(event);
    if (projection !== undefined && edges.some((edge) => typeof edge.projectionOrdinal !== "string" || edge.projectionOrdinal.trim() === "")) {
      throw new Error("GRAPH_PROJECTION_ORDINAL_REQUIRED");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}/v1/projections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          graphVersion: event.graphVersion.toString(),
          ...(projection === undefined ? {} : { projection }),
          nodes: nodes.map((node) => scopedNode(node, scope, projection)),
          edges: edges.map((edge) => scopedEdge(edge, scope, projection))
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("GRAPH_GATEWAY_DELIVERY_FAILED");
      const receipt = await response.json().catch(() => undefined);
      if (
        !isRecord(receipt) ||
        receipt.graphVersion !== event.graphVersion.toString() ||
        !receiptProjectionMatches(receipt, projection) ||
        !isNonNegativeInteger(receipt.projectedNodeCount) ||
        !isNonNegativeInteger(receipt.projectedEdgeCount)
      ) {
        throw new Error("GRAPH_GATEWAY_RECEIPT_INVALID");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "GRAPH_GATEWAY_DELIVERY_FAILED",
          "GRAPH_GATEWAY_RECEIPT_INVALID",
          "GRAPH_PROJECTION_ORDINAL_REQUIRED",
          "PROJECTION_IDENTITY_MISMATCH",
          "GRAPH_PROJECTION_GENERATION_REQUIRED"
        ].includes(error.message)
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

function scopedEdge(edge: Record<string, unknown>, scope: ProjectionScope, projection: ProjectionIdentity | undefined): Record<string, unknown> {
  return {
    ...edge,
    source: isRecord(edge.source) ? scopedNode(edge.source, scope, projection) : edge.source,
    target: isRecord(edge.target) ? scopedNode(edge.target, scope, projection) : edge.target
  };
}

function scopedNode(node: Record<string, unknown>, scope: ProjectionScope, projection: ProjectionIdentity | undefined): Record<string, unknown> {
  const existing = projectionFromRecord(node.projection);
  if (existing !== undefined && projection === undefined) throw new Error("PROJECTION_IDENTITY_MISMATCH");
  if (existing !== undefined && projection !== undefined && !sameProjectionIdentity(existing, projection)) {
    throw new Error("PROJECTION_IDENTITY_MISMATCH");
  }
  return {
    ...node,
    ...scope,
    ...(projection === undefined ? {} : { projection })
  };
}

function projectionFromRecord(value: unknown): ProjectionIdentity | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const keys = ["baselineId", "manifestId", "generationId", "schemaVersion"] as const;
  if (keys.every((key) => candidate[key] === undefined)) return undefined;
  if (keys.some((key) => typeof candidate[key] !== "string" || (candidate[key] as string).trim() === "")) {
    throw new Error("GRAPH_PROJECTION_GENERATION_REQUIRED");
  }
  return {
    baselineId: candidate.baselineId as string,
    manifestId: candidate.manifestId as string,
    generationId: candidate.generationId as string,
    schemaVersion: candidate.schemaVersion as string
  };
}

function receiptProjectionMatches(receipt: Record<string, unknown>, expected: ProjectionIdentity | undefined): boolean {
  const actual = projectionFromRecord(receipt.projection);
  if (expected === undefined) return actual === undefined;
  return actual !== undefined && sameProjectionIdentity(actual, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
