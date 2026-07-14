import { hasScopeAccess, scopeById } from "../architecture/service";
import type { ArchitectureScopeRef, ScopedActor } from "../architecture/types";
import type { AssetNodeIdentity, RelationshipCode, RelationshipStrength } from "../relationships/types";

export interface RelationTraversalRule {
  code: RelationshipCode;
  forwardPropagation?: boolean;
  reversePropagation?: boolean;
  minConfidence?: number;
}

export interface GraphTraversalPlan {
  startNodes: AssetNodeIdentity[];
  authorizedScope: ArchitectureScopeRef;
  relationRules: RelationTraversalRule[];
  maxDepth: number;
  maxNodes: number;
  maxPaths: number;
  timeoutMs: number;
  graphVersion?: bigint;
}

export interface TraversalAuthorization {
  actor: ScopedActor;
  scope: ArchitectureScopeRef;
}

export interface GraphTraversalPlanInput {
  startNodes: AssetNodeIdentity[];
  authorization: TraversalAuthorization;
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

export type NonEmptyArray<T> = [T, ...T[]];

interface GraphTraversalResultData {
  nodes: AssetNodeIdentity[];
  edges: GraphRelationship[];
  paths: GraphEvidencePath[];
  graphVersion: bigint;
  elapsedMs: number;
}

export interface CompleteGraphTraversalResult extends GraphTraversalResultData {
  status: "COMPLETE";
  frontier: [];
  truncationReasons: [];
}

export interface PartialGraphTraversalResult extends GraphTraversalResultData {
  status: "PARTIAL";
  frontier: NonEmptyArray<AssetNodeIdentity>;
  truncationReasons: NonEmptyArray<GraphTraversalTruncationReason>;
}

export type GraphTraversalResult = CompleteGraphTraversalResult | PartialGraphTraversalResult;

export interface CompleteGraphTraversalResultInput extends GraphTraversalResultData {
  status: "COMPLETE";
}

export interface PartialGraphTraversalResultInput extends GraphTraversalResultData {
  status: "PARTIAL";
  frontier: NonEmptyArray<AssetNodeIdentity>;
  truncationReasons: NonEmptyArray<GraphTraversalTruncationReason>;
}

export type GraphTraversalResultInput = CompleteGraphTraversalResultInput | PartialGraphTraversalResultInput;

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
  if (!input.authorization) {
    throw new Error("TRAVERSAL_AUTHORIZATION_REQUIRED");
  }
  const legacyAllowedScopes = (input as GraphTraversalPlanInput & { allowedScopes?: unknown }).allowedScopes;
  if (Array.isArray(legacyAllowedScopes) && legacyAllowedScopes.length !== 1) {
    throw new Error("MULTIPLE_ALLOWED_SCOPES_UNSUPPORTED");
  }
  if (input.startNodes.length === 0) {
    throw new Error("START_NODES_REQUIRED");
  }
  const authorizedScope = authorizeTraversalScope(input.authorization);
  if (input.startNodes.some((node) => !isSameScope(authorizedScope, node))) {
    throw new Error("ROOT_SCOPE_MISMATCH");
  }

  const plan: GraphTraversalPlan = {
    startNodes: [...input.startNodes],
    authorizedScope,
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

export function createGraphTraversalResult(input: GraphTraversalResultInput): GraphTraversalResult {
  if (input.status === "COMPLETE") {
    const completeInput = input as GraphTraversalResultInput & {
      frontier?: unknown;
      truncationReasons?: unknown;
    };
    if (hasItems(completeInput.frontier) || hasItems(completeInput.truncationReasons)) {
      throw new Error("COMPLETE_RESULT_INVALID");
    }
    return {
      ...input,
      status: "COMPLETE",
      frontier: [],
      truncationReasons: []
    };
  }

  if (!hasItems(input.frontier)) {
    throw new Error("PARTIAL_FRONTIER_REQUIRED");
  }
  if (!hasItems(input.truncationReasons)) {
    throw new Error("PARTIAL_TRUNCATION_REASON_REQUIRED");
  }
  return {
    ...input,
    status: "PARTIAL",
    frontier: [...input.frontier] as NonEmptyArray<AssetNodeIdentity>,
    truncationReasons: [...input.truncationReasons] as NonEmptyArray<GraphTraversalTruncationReason>
  };
}

function authorizeTraversalScope(authorization: TraversalAuthorization): ArchitectureScopeRef {
  const scope = scopeById(authorization.scope.applicationServiceId);
  if (
    !scope ||
    scope.level !== "applicationService" ||
    scope.scopePath !== authorization.scope.scopePath
  ) {
    throw new Error("AUTHORIZED_SCOPE_INVALID");
  }
  if (!hasScopeAccess(authorization.actor, scope, "read")) {
    throw new Error("SCOPE_ACCESS_DENIED");
  }
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

function isSameScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): boolean {
  return left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function hasItems(value: unknown): value is [unknown, ...unknown[]] {
  return Array.isArray(value) && value.length > 0;
}
