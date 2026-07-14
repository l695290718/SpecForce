import type { ArchitectureScopeRef } from "../architecture/types";
import type { AssetNodeIdentity, RelationshipCode, RelationshipStrength } from "../relationships/types";

export interface RelationTraversalRule {
  code: RelationshipCode;
  forwardPropagation?: boolean;
  reversePropagation?: boolean;
  minConfidence?: number;
}

export interface GraphTraversalPlan {
  startNodes: AssetNodeIdentity[];
  allowedScopes: ArchitectureScopeRef[];
  relationRules: RelationTraversalRule[];
  maxDepth: number;
  maxNodes: number;
  maxPaths: number;
  timeoutMs: number;
  graphVersion?: bigint;
}

export interface GraphTraversalPlanInput {
  startNodes: AssetNodeIdentity[];
  allowedScopes: ArchitectureScopeRef[];
  relationRules?: RelationTraversalRule[];
  maxDepth?: number;
  maxNodes?: number;
  maxPaths?: number;
  timeoutMs?: number;
  graphVersion?: bigint;
}

export interface GraphRelationship {
  id: string;
  code: RelationshipCode;
  source: AssetNodeIdentity;
  target: AssetNodeIdentity;
  strength: RelationshipStrength;
  confidence: number;
  version: bigint;
}

export interface GraphEvidencePath {
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
}

export type GraphTraversalTruncationReason = "MAX_DEPTH" | "MAX_NODES" | "MAX_PATHS" | "TIMEOUT";

export interface GraphTraversalResult {
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
  paths: GraphEvidencePath[];
  frontier: AssetNodeIdentity[];
  graphVersion: bigint;
  elapsedMs: number;
  truncated: boolean;
  truncationReasons: GraphTraversalTruncationReason[];
}

export interface GraphProjectionBatch {
  scope: ArchitectureScopeRef;
  graphVersion: bigint;
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
}

export interface ProjectionReceipt {
  graphVersion: bigint;
  projectedNodeCount: number;
  projectedEdgeCount: number;
}

export interface GraphStore {
  traverse(plan: GraphTraversalPlan): Promise<GraphTraversalResult>;
  upsertProjection(batch: GraphProjectionBatch): Promise<ProjectionReceipt>;
  checkpoint(scope: ArchitectureScopeRef): Promise<bigint>;
}

export function createTraversalPlan(input: GraphTraversalPlanInput): GraphTraversalPlan {
  if (input.allowedScopes.length === 0) {
    throw new Error("ALLOWED_SCOPES_REQUIRED");
  }

  if (input.allowedScopes.some((scope) => !isExactScope(scope))) {
    throw new Error("ALLOWED_SCOPE_INVALID");
  }
  if (input.startNodes.length === 0) {
    throw new Error("START_NODES_REQUIRED");
  }
  if (input.startNodes.some((node) => !input.allowedScopes.some((scope) => isSameScope(scope, node)))) {
    throw new Error("START_NODE_SCOPE_UNAUTHORIZED");
  }

  const plan: GraphTraversalPlan = {
    startNodes: [...input.startNodes],
    allowedScopes: [...input.allowedScopes],
    relationRules: [...(input.relationRules ?? [])],
    maxDepth: input.maxDepth ?? 2,
    maxNodes: input.maxNodes ?? 1_000,
    maxPaths: input.maxPaths ?? 1_000,
    timeoutMs: input.timeoutMs ?? 3_000,
    ...(input.graphVersion === undefined ? {} : { graphVersion: input.graphVersion })
  };

  if (![plan.maxDepth, plan.maxNodes, plan.maxPaths, plan.timeoutMs].every(isPositiveInteger)) {
    throw new Error("TRAVERSAL_BUDGET_INVALID");
  }

  return plan;
}

function isExactScope(scope: ArchitectureScopeRef): boolean {
  return scope.applicationServiceId.trim().length > 0 && scope.scopePath.trim().length > 0;
}

function isSameScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): boolean {
  return left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
