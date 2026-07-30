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
import { assertProjectionScope, sameScope } from "./traversal";

export interface NebulaGatewayGraphStoreOptions {
  baseUrl: string;
  enterpriseId: string;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

export class GraphGatewayUnavailableError extends Error {
  readonly code = "GRAPH_GATEWAY_UNAVAILABLE";

  constructor() {
    super("GRAPH_GATEWAY_UNAVAILABLE");
    this.name = "GraphGatewayUnavailableError";
  }
}

interface GatewayScope extends ArchitectureScopeRef {
  enterpriseId: string;
}

interface GatewayNode extends AssetNodeIdentity {
  enterpriseId: string;
}

interface GatewayRelationship extends Omit<GraphRelationship, "source" | "target" | "version"> {
  source: GatewayNode;
  target: GatewayNode;
  version: string;
}

interface GatewayEvidencePath {
  nodes: GatewayNode[];
  edges: GatewayRelationship[];
}

interface GatewayTraversalResult {
  status: "COMPLETE" | "PARTIAL";
  nodes: GatewayNode[];
  edges: GatewayRelationship[];
  paths?: GatewayEvidencePath[];
  frontier?: GatewayNode[];
  graphVersion: string;
  elapsedMs: number;
  truncationReasons: GraphTraversalTruncationReason[];
}

interface GatewayProjectionReceipt {
  graphVersion: string;
  projectedNodeCount: number;
  projectedEdgeCount: number;
}

export class NebulaGatewayGraphStore implements GraphStore {
  private readonly baseUrl: string;
  private readonly enterpriseId: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly requestTimeoutMs: number;

  constructor(options: NebulaGatewayGraphStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.enterpriseId = options.enterpriseId;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 3_000;
  }

  async traverse(plan: GraphTraversalPlan): Promise<GraphTraversalResult> {
    const scope = this.scope(plan.authorizedScope);
    if (plan.startNodes.some((node) => !sameScope(node, plan.authorizedScope))) {
      throw new Error("GRAPH_SCOPE_MISMATCH");
    }

    const result = await this.request<GatewayTraversalResult>(
      "/v1/traversals",
      {
        method: "POST",
        body: {
          scope,
          startNodes: plan.startNodes.map((node) => this.node(node)),
          relationCodes: [...new Set(plan.relationRules.map((rule) => rule.code))],
          maxDepth: plan.maxDepth,
          maxNodes: plan.maxNodes,
          maxPaths: plan.maxPaths,
          timeoutMs: plan.timeoutMs,
          ...(plan.graphVersion === undefined ? {} : { graphVersion: plan.graphVersion.toString() })
        }
      },
      Math.min(this.requestTimeoutMs, plan.timeoutMs)
    );

    return this.traversalResult(result, scope);
  }

  async upsertProjection(batch: GraphProjectionBatch): Promise<ProjectionReceipt> {
    const scope = this.scope(batch.scope);
    assertProjectionScope(batch);
    const receipt = await this.request<GatewayProjectionReceipt>("/v1/projections", {
      method: "POST",
      body: {
        scope,
        graphVersion: batch.graphVersion.toString(),
        nodes: batch.nodes.map((node) => this.node(node)),
        edges: batch.edges.map((edge) => this.relationship(edge))
      }
    });
    return {
      graphVersion: this.bigint(receipt.graphVersion),
      projectedNodeCount: receipt.projectedNodeCount,
      projectedEdgeCount: receipt.projectedEdgeCount
    };
  }

  async checkpoint(scope: ArchitectureScopeRef): Promise<bigint> {
    const exactScope = this.scope(scope);
    const response = await this.request<{ graphVersion: string }>(
      `/v1/checkpoints/${encodeScopeKey(exactScope)}`,
      { method: "GET" }
    );
    return this.bigint(response.graphVersion);
  }

  private scope(scope: ArchitectureScopeRef): GatewayScope {
    if (!this.enterpriseId.trim() || !scope.applicationServiceId.trim() || !scope.scopePath.trim()) {
      throw new Error("GRAPH_SCOPE_REQUIRED");
    }
    return { enterpriseId: this.enterpriseId, ...scope };
  }

  private node(node: AssetNodeIdentity): GatewayNode {
    return { enterpriseId: this.enterpriseId, ...node };
  }

  private relationship(relationship: GraphRelationship): GatewayRelationship {
    return {
      ...relationship,
      source: this.node(relationship.source),
      target: this.node(relationship.target),
      version: relationship.version.toString()
    };
  }

  private traversalResult(result: GatewayTraversalResult, scope: GatewayScope): GraphTraversalResult {
    const nodes = result.nodes.map((node) => this.localNode(node, scope));
    const edges = result.edges.map((edge) => this.localRelationship(edge, scope));
    const paths = (result.paths ?? []).map((path) => this.localPath(path, scope));
    const graphVersion = this.bigint(result.graphVersion);

    if (result.status === "COMPLETE") {
      if (result.truncationReasons.length > 0 || (result.frontier?.length ?? 0) > 0) {
        throw new Error("GRAPH_GATEWAY_RESPONSE_INVALID");
      }
      return createGraphTraversalResult({
        status: "COMPLETE",
        nodes,
        edges,
        paths,
        graphVersion,
        elapsedMs: result.elapsedMs
      });
    }

    const frontier = (result.frontier ?? []).map((node) => this.localNode(node, scope));
    if (frontier.length === 0 || result.truncationReasons.length === 0) {
      throw new Error("GRAPH_GATEWAY_RESPONSE_INVALID");
    }
    return createGraphTraversalResult({
      status: "PARTIAL",
      nodes,
      edges,
      paths,
      frontier: [frontier[0]!, ...frontier.slice(1)],
      truncationReasons: [result.truncationReasons[0]!, ...result.truncationReasons.slice(1)],
      graphVersion,
      elapsedMs: result.elapsedMs
    });
  }

  private localNode(node: GatewayNode, scope: GatewayScope): AssetNodeIdentity {
    this.assertGatewayScope(node, scope);
    const { enterpriseId: _enterpriseId, ...localNode } = node;
    return localNode;
  }

  private localRelationship(edge: GatewayRelationship, scope: GatewayScope): GraphRelationship {
    return {
      ...edge,
      source: this.localNode(edge.source, scope),
      target: this.localNode(edge.target, scope),
      version: this.bigint(edge.version)
    };
  }

  private localPath(path: GatewayEvidencePath, scope: GatewayScope): GraphEvidencePath {
    return {
      nodes: path.nodes.map((node) => this.localNode(node, scope)),
      edges: path.edges.map((edge) => this.localRelationship(edge, scope))
    };
  }

  private assertGatewayScope(value: GatewayScope, scope: GatewayScope): void {
    if (
      value.enterpriseId !== scope.enterpriseId ||
      value.applicationServiceId !== scope.applicationServiceId ||
      value.scopePath !== scope.scopePath
    ) {
      throw new Error("GRAPH_SCOPE_MISMATCH");
    }
  }

  private bigint(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new Error("GRAPH_GATEWAY_RESPONSE_INVALID");
    }
  }

  private async request<T>(
    path: string,
    request: { method: "GET" | "POST"; body?: unknown },
    timeoutMs = this.requestTimeoutMs
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method: request.method,
        ...(request.body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(request.body)
            }),
        signal: controller.signal
      });
      if (!response.ok) throw new GraphGatewayUnavailableError();
      return await response.json() as T;
    } catch (error) {
      if (error instanceof GraphGatewayUnavailableError) throw error;
      throw new GraphGatewayUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}

function encodeScopeKey(scope: GatewayScope): string {
  const bytes = new TextEncoder().encode(JSON.stringify(scope));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
