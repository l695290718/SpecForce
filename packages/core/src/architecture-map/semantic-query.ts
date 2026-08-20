import type { SemanticProjectionBatch, SemanticVertex } from "../graph/semantic-projection";
import type { SemanticProjectionIdentity } from "../graph/semantic-identity";

export interface ArchitectureSemanticQueryBudget {
  maxAssertions: number;
  maxTargets: number;
  maxTraceSteps: number;
  timeoutMs: number;
  maxPayloadBytes: number;
}

export interface ArchitectureSemanticQuery {
  applicationServiceId: string;
  scopePath: string;
  assetType: string;
  assetId: string;
  budget: ArchitectureSemanticQueryBudget;
}

export interface SemanticAssertionResult {
  assertionId: string;
  semanticIdentity: string;
  layer: "BIZ" | "SYS" | "TECH";
  confidence: number;
}

export interface SemanticTarget {
  unitIdentity: string;
  layer: "BIZ" | "SYS" | "TECH";
  canonicalName: string;
}

export interface SemanticTraceStep {
  relationshipIdentity: string;
  sourceSemanticIdentity: string;
  targetSemanticIdentity: string;
  relationCode: string;
}

export interface ArchitectureSemanticQueryResult {
  status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  source: "NEBULA" | "POSTGRESQL_FALLBACK" | "NONE";
  projection: SemanticProjectionIdentity;
  mappingMode: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED";
  assertions: readonly SemanticAssertionResult[];
  targets: Readonly<{ BIZ: readonly SemanticTarget[]; SYS: readonly SemanticTarget[]; TECH: readonly SemanticTarget[] }>;
  tracePath: readonly SemanticTraceStep[];
  reason?: string;
  partial: boolean;
  truncationReasons: readonly string[];
}

export function normalizeArchitectureSemanticQuery(input: ArchitectureSemanticQuery): ArchitectureSemanticQuery {
  if (!input.applicationServiceId.trim() || !input.scopePath.trim() || !input.assetType.trim() || !input.assetId.trim()) {
    throw new Error("SEMANTIC_QUERY_SCOPE_OR_ASSET_REQUIRED");
  }
  const budget = input.budget;
  for (const [key, value] of Object.entries(budget)) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`SEMANTIC_QUERY_${key.toUpperCase()}_INVALID`);
  }
  if (budget.maxAssertions > 10_000 || budget.maxTargets > 10_000 || budget.maxTraceSteps > 10_000 || budget.maxPayloadBytes > 10_000_000) {
    throw new Error("SEMANTIC_QUERY_BUDGET_EXCEEDED");
  }
  return {
    ...input,
    applicationServiceId: input.applicationServiceId.trim(),
    scopePath: input.scopePath.trim(),
    assetType: input.assetType.trim(),
    assetId: input.assetId.trim(),
  };
}

export function querySemanticProjection(batch: SemanticProjectionBatch, input: ArchitectureSemanticQuery): ArchitectureSemanticQueryResult {
  const query = normalizeArchitectureSemanticQuery(input);
  if (batch.identity.applicationServiceId !== query.applicationServiceId || batch.identity.scopePath !== query.scopePath) {
    throw new Error("SEMANTIC_QUERY_SCOPE_MISMATCH");
  }
  const assetKey = `asset:${query.assetType}:${query.assetId}`;
  const asset = batch.vertices.find((vertex): vertex is Extract<SemanticVertex, { family: "DesignAsset" }> => vertex.family === "DesignAsset" && vertex.id === assetKey);
  if (!asset) return emptyResult(batch.identity, "BLOCKED", "SEMANTIC_ASSET_NOT_FOUND");

  const assertionEdges = batch.edges.filter((edge) => edge.family === "ASSERTION_SUBJECT" && edge.targetId === assetKey);
  const assertionById = new Map(batch.vertices.filter((vertex): vertex is Extract<SemanticVertex, { family: "KnowledgeAssertion" }> => vertex.family === "KnowledgeAssertion").map((vertex) => [vertex.id, vertex]));
  const assertions = assertionEdges.map((edge) => assertionById.get(edge.sourceId)).filter((vertex): vertex is Extract<SemanticVertex, { family: "KnowledgeAssertion" }> => vertex !== undefined);
  const truncationReasons: string[] = [];
  const limitedAssertions = assertions.slice(0, query.budget.maxAssertions);
  if (limitedAssertions.length < assertions.length) truncationReasons.push("ASSERTION_BUDGET_EXCEEDED");

  const unitById = new Map(batch.vertices.filter((vertex): vertex is Extract<SemanticVertex, { family: "ArchitectureUnit" }> => vertex.family === "ArchitectureUnit").map((vertex) => [vertex.id, vertex]));
  const targets = { BIZ: [] as SemanticTarget[], SYS: [] as SemanticTarget[], TECH: [] as SemanticTarget[] };
  const targetEdges = batch.edges.filter((edge) => ["CLASSIFIED_AS", "REALIZED_BY", "DEPLOYED_ON"].includes(edge.family) && limitedAssertions.some((assertion) => assertion.id === edge.sourceId));
  const targetRows = targetEdges.map((edge) => unitById.get(edge.targetId)).filter((unit): unit is Extract<SemanticVertex, { family: "ArchitectureUnit" }> => unit !== undefined);
  const limitedTargets = targetRows.slice(0, query.budget.maxTargets);
  if (limitedTargets.length < targetRows.length) truncationReasons.push("TARGET_BUDGET_EXCEEDED");
  for (const target of limitedTargets) targets[target.layer].push({ unitIdentity: target.unitIdentity, layer: target.layer, canonicalName: target.canonicalName });

  const traceEdges = batch.edges.filter((edge) => edge.family === "ASSET_RELATION" && edge.sourceId === assetKey).slice(0, query.budget.maxTraceSteps);
  if (traceEdges.length < batch.edges.filter((edge) => edge.family === "ASSET_RELATION" && edge.sourceId === assetKey).length) truncationReasons.push("TRACE_BUDGET_EXCEEDED");
  const tracePath = traceEdges.map((edge) => ({ relationshipIdentity: edge.relationshipVersion ?? edge.id, sourceSemanticIdentity: edge.sourceId, targetSemanticIdentity: edge.targetId, relationCode: edge.code }));
  const result: ArchitectureSemanticQueryResult = {
    status: truncationReasons.length === 0 ? "COMPLETE" : "PARTIAL",
    source: "NEBULA",
    projection: batch.identity,
    mappingMode: asset.mappingMode,
    assertions: limitedAssertions.map((assertion) => ({ assertionId: assertion.assertionId, semanticIdentity: assertion.semanticIdentity, layer: assertion.layer, confidence: assertion.confidence })),
    targets,
    tracePath,
    ...(asset.reason ? { reason: asset.reason } : {}),
    partial: truncationReasons.length > 0,
    truncationReasons,
  };
  if (jsonBytes(result) > query.budget.maxPayloadBytes) {
    return { ...emptyResult(batch.identity, asset.mappingMode, "PAYLOAD_BUDGET_EXCEEDED"), status: "PARTIAL", source: "NEBULA", partial: true, truncationReasons: ["PAYLOAD_BUDGET_EXCEEDED"] };
  }
  return result;
}

function emptyResult(projection: SemanticProjectionIdentity, mappingMode: ArchitectureSemanticQueryResult["mappingMode"], reason: string): ArchitectureSemanticQueryResult {
  return { status: "UNAVAILABLE", source: "NONE", projection, mappingMode, assertions: [], targets: { BIZ: [], SYS: [], TECH: [] }, tracePath: [], reason, partial: false, truncationReasons: [] };
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
