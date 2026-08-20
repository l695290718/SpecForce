import type { SemanticGenerationScope } from "./semantic-source-repository.js";

export interface SemanticQueryBudget {
  maxAssertions: number;
  maxTargets: number;
  maxTraceSteps: number;
  timeoutMs: number;
  maxPayloadBytes: number;
}

export interface SemanticQueryInput {
  assetType: string;
  assetId: string;
  budget: SemanticQueryBudget;
}

export interface SemanticProjectionIdentity {
  applicationServiceId: string;
  scopePath: string;
  manifestId: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
  semanticSchemaVersion: "nebula.3a.semantic.v1";
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
}

export interface SemanticQueryResult {
  status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  source: "NEBULA" | "POSTGRESQL_FALLBACK" | "NONE";
  projection: SemanticProjectionIdentity;
  mappingMode: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED";
  assertions: readonly unknown[];
  targets: Readonly<{ BIZ: readonly unknown[]; SYS: readonly unknown[]; TECH: readonly unknown[] }>;
  tracePath: readonly unknown[];
  reason?: string;
  partial: boolean;
  truncationReasons: readonly string[];
}

export interface SemanticQueryGateway {
  query(input: SemanticQueryInput, scope: SemanticGenerationScope, identity: SemanticProjectionIdentity): Promise<SemanticQueryResult>;
}

export interface SemanticActiveResolver {
  resolveActive(scope: SemanticGenerationScope): Promise<SemanticProjectionIdentity>;
}

export interface SemanticPostgresFallback {
  query(input: SemanticQueryInput, scope: SemanticGenerationScope, identity: SemanticProjectionIdentity): Promise<SemanticQueryResult>;
}

export interface SemanticQueryDependencies {
  active: SemanticActiveResolver;
  nebula: SemanticQueryGateway;
  postgres: SemanticPostgresFallback;
}

export async function queryArchitectureSemantics(
  scope: SemanticGenerationScope,
  input: SemanticQueryInput,
  dependencies: SemanticQueryDependencies
): Promise<SemanticQueryResult> {
  const identity = await dependencies.active.resolveActive(scope);
  assertIdentityScope(scope, identity);
  try {
    const result = await dependencies.nebula.query(input, scope, identity);
    assertResultIdentity(result, identity);
    if (result.status === "UNAVAILABLE" || result.source !== "NEBULA") throw new Error("SEMANTIC_GATEWAY_UNAVAILABLE");
    return result;
  } catch (error) {
    if (!isTransportUnavailable(error)) throw error;
    const fallback = await dependencies.postgres.query(input, scope, identity);
    assertResultIdentity(fallback, identity);
    if (fallback.source !== "POSTGRESQL_FALLBACK") throw new Error("SEMANTIC_FALLBACK_SOURCE_INVALID");
    return fallback;
  }
}

function assertIdentityScope(scope: SemanticGenerationScope, identity: SemanticProjectionIdentity): void {
  if (identity.applicationServiceId !== scope.applicationServiceId || identity.scopePath !== scope.scopePath || identity.baselineId !== scope.baselineId || identity.generationId !== scope.generationId || identity.manifestId !== scope.manifestId) {
    throw new Error("SEMANTIC_ACTIVE_IDENTITY_MISMATCH");
  }
}

function assertResultIdentity(result: SemanticQueryResult, identity: SemanticProjectionIdentity): void {
  if (result.projection.applicationServiceId !== identity.applicationServiceId || result.projection.scopePath !== identity.scopePath || result.projection.manifestId !== identity.manifestId || result.projection.generationId !== identity.generationId || result.projection.baselineId !== identity.baselineId || result.projection.semanticSchemaVersion !== identity.semanticSchemaVersion) {
    throw new Error("SEMANTIC_RESULT_IDENTITY_MISMATCH");
  }
}

function isTransportUnavailable(error: unknown): boolean {
  return error instanceof Error && ["SEMANTIC_GATEWAY_UNAVAILABLE", "GRAPH_GATEWAY_DELIVERY_FAILED", "NEBULA_QUERY_FAILED", "ECONNREFUSED", "ETIMEDOUT"].includes(error.message);
}
