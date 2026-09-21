import type { ArchitectureScopeRef } from "../architecture/types";
import { contentDigest } from "../federation/digest";
import { isBreakingCandidateValue, type ReviewRiskTier, type SemanticCandidateSubmission } from "./types";

export const fullAssetFamilies = [
  "domain",
  "dataModel",
  "api",
  "event",
  "businessRule",
  "stateMachine",
  "integration",
  "quality",
  "observability",
  "serviceFeature",
  "functionalFeature",
  "adr",
  "proposal",
  "contextPack",
  "evidence",
  "typedRelationship"
] as const;

export type FullAssetFamily = typeof fullAssetFamilies[number];

export const factTypeForAssetFamily = Object.freeze({
  domain: "domain-concept",
  dataModel: "data-model",
  api: "api-contract",
  event: "event-contract",
  businessRule: "business-rule",
  stateMachine: "state-machine",
  integration: "integration",
  quality: "quality",
  observability: "observability",
  serviceFeature: "service-feature",
  functionalFeature: "functional-feature",
  adr: "architecture-decision",
  proposal: "proposal",
  contextPack: "context-pack",
  evidence: "evidence",
  typedRelationship: "typed-relationship"
} satisfies Record<FullAssetFamily, string>);

export const semanticEvidenceTypes = [
  "source-code",
  "executable-test",
  "database-schema",
  "api-contract",
  "event-contract",
  "runtime-configuration",
  "deployment-manifest",
  "auth-policy",
  "observability-config",
  "documentation",
  "symbol-name"
] as const;

export type SemanticEvidenceType = typeof semanticEvidenceTypes[number];

export interface SemanticEvidenceCluster {
  id: string;
  architectureScope: ArchitectureScopeRef;
  domainHint?: string;
  observationIds: string[];
  evidenceTypes: SemanticEvidenceType[];
  tokenEstimate: number;
  clusterDigest: string;
}

export interface FullAssetSemanticCandidate extends SemanticCandidateSubmission {
  assetFamily: FullAssetFamily;
  promptPackDigest: string;
  policyDigest: string;
  clusterId: string;
  evidenceTypes: SemanticEvidenceType[];
  canonicalContent: Record<string, unknown>;
  localizedContent: { zh: Record<string, unknown> };
}

const MAX_CLUSTER_OBSERVATIONS = 500;
const MAX_CLUSTER_TOKEN_ESTIMATE = 100_000;
const HIGH_IMPACT_FAMILIES = new Set<FullAssetFamily>([
  "api",
  "event",
  "businessRule",
  "stateMachine",
  "integration",
  "typedRelationship"
]);

export function semanticEvidenceClusterDigest(cluster: Omit<SemanticEvidenceCluster, "clusterDigest">): string {
  return contentDigest({
    id: cluster.id,
    architectureScope: cluster.architectureScope,
    domainHint: cluster.domainHint ?? null,
    observationIds: sortedUnique(cluster.observationIds),
    evidenceTypes: sortedUnique(cluster.evidenceTypes),
    tokenEstimate: cluster.tokenEstimate
  });
}

export function validateSemanticEvidenceCluster(cluster: SemanticEvidenceCluster): SemanticEvidenceCluster {
  if (!cluster.id?.trim() || !isScope(cluster.architectureScope)) throw new Error("SEMANTIC_CLUSTER_IDENTITY_REQUIRED");
  if (!Array.isArray(cluster.observationIds) || cluster.observationIds.length === 0 || cluster.observationIds.length > MAX_CLUSTER_OBSERVATIONS) throw new Error("SEMANTIC_CLUSTER_OBSERVATION_LIMIT_INVALID");
  if (new Set(cluster.observationIds).size !== cluster.observationIds.length || cluster.observationIds.some((id) => !id?.trim())) throw new Error("SEMANTIC_CLUSTER_OBSERVATIONS_INVALID");
  if (!Array.isArray(cluster.evidenceTypes) || cluster.evidenceTypes.length === 0 || cluster.evidenceTypes.some((type) => !semanticEvidenceTypes.includes(type))) throw new Error("SEMANTIC_CLUSTER_EVIDENCE_TYPES_INVALID");
  if (!Number.isInteger(cluster.tokenEstimate) || cluster.tokenEstimate < 1 || cluster.tokenEstimate > MAX_CLUSTER_TOKEN_ESTIMATE) throw new Error("SEMANTIC_CLUSTER_TOKEN_BUDGET_INVALID");
  if (cluster.clusterDigest !== semanticEvidenceClusterDigest(cluster)) throw new Error("SEMANTIC_CLUSTER_DIGEST_MISMATCH");
  return cluster;
}

export function validateFullAssetSemanticCandidate(candidate: FullAssetSemanticCandidate, cluster: SemanticEvidenceCluster): FullAssetSemanticCandidate {
  validateSemanticEvidenceCluster(cluster);
  if (!fullAssetFamilies.includes(candidate.assetFamily)) throw new Error("SEMANTIC_ASSET_FAMILY_INVALID");
  if (candidate.factType !== factTypeForAssetFamily[candidate.assetFamily]) throw new Error("SEMANTIC_ASSET_FAMILY_FACT_TYPE_MISMATCH");
  if (!candidate.semanticIdentity?.trim() || !candidate.domainCluster?.trim() || !candidate.clusterId?.trim()) throw new Error("SEMANTIC_CANDIDATE_IDENTITY_REQUIRED");
  if (candidate.clusterId !== cluster.id) throw new Error("SEMANTIC_CLUSTER_IDENTITY_MISMATCH");
  if (!sha256(candidate.normalizedDigest) || !sha256(candidate.promptPackDigest) || !sha256(candidate.policyDigest)) throw new Error("SEMANTIC_CANDIDATE_DIGEST_INVALID");
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) throw new Error("SEMANTIC_CANDIDATE_CONFIDENCE_INVALID");
  if (!Array.isArray(candidate.sourceObservationIds) || candidate.sourceObservationIds.length === 0 || candidate.sourceObservationIds.length > MAX_CLUSTER_OBSERVATIONS) throw new Error("SEMANTIC_CANDIDATE_SOURCE_REQUIRED");
  const clusterObservationIds = new Set(cluster.observationIds);
  if (candidate.sourceObservationIds.some((id) => !clusterObservationIds.has(id))) throw new Error("SEMANTIC_CLUSTER_MEMBERSHIP_INVALID");
  if (!sameScope(cluster.architectureScope, candidate.value.architectureScope as ArchitectureScopeRef | undefined)) {
    if (candidate.value.architectureScope !== undefined) throw new Error("SEMANTIC_CANDIDATE_SCOPE_MISMATCH");
  }
  if (!Array.isArray(candidate.evidenceTypes) || candidate.evidenceTypes.length === 0 || candidate.evidenceTypes.some((type) => !cluster.evidenceTypes.includes(type))) throw new Error("SEMANTIC_CANDIDATE_EVIDENCE_TYPES_INVALID");
  if (!hasTextLeaf(candidate.canonicalContent) || !hasTextLeaf(candidate.localizedContent.zh)) throw new Error("CANDIDATE_BILINGUAL_CONTENT_MISSING");
  if (contentDigest(candidate.value.canonicalContent) !== contentDigest(candidate.canonicalContent)
    || contentDigest(record(candidate.value.localizedContent).zh) !== contentDigest(candidate.localizedContent.zh)) throw new Error("SEMANTIC_CANDIDATE_CONTENT_MISMATCH");
  if (HIGH_IMPACT_FAMILIES.has(candidate.assetFamily) && (new Set(candidate.evidenceTypes).size < 2 || candidate.matchingEvidence.length < 2 || candidate.evidenceRefs.length < 2)) throw new Error("SEMANTIC_MULTI_EVIDENCE_REQUIRED");
  return candidate;
}

export function classifyFullAssetCandidateRisk(candidate: FullAssetSemanticCandidate, serverAuthorizedT0 = false): ReviewRiskTier {
  if (candidate.identityDecision !== "UNAMBIGUOUS") return "T3";
  const governedMeaning = `${candidate.factType} ${candidate.semanticIdentity} ${JSON.stringify(candidate.canonicalContent)}`.toLowerCase();
  if (/(security|authorization|authentication|privacy|compliance)/u.test(governedMeaning)) return "T3";
  if (isBreakingCandidateValue(candidate.value)) return "T2";
  if (HIGH_IMPACT_FAMILIES.has(candidate.assetFamily)) return "T2";
  if (serverAuthorizedT0
    && ["quality", "observability", "evidence"].includes(candidate.assetFamily)
    && candidate.confidence >= 0.99
    && candidate.unresolvedQuestions.length === 0) return "T0";
  return "T1";
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function sha256(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function isScope(value: unknown): value is ArchitectureScopeRef {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as ArchitectureScopeRef).applicationServiceId === "string" && (value as ArchitectureScopeRef).applicationServiceId
    && typeof (value as ArchitectureScopeRef).scopePath === "string" && (value as ArchitectureScopeRef).scopePath);
}

function sameScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef | undefined): boolean {
  return !right || (left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasTextLeaf(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) => typeof item === "string"
    ? item.trim().length > 0
    : Array.isArray(item)
      ? item.some((entry) => typeof entry === "string" ? entry.trim().length > 0 : hasTextLeaf(record(entry)))
      : hasTextLeaf(record(item)));
}
