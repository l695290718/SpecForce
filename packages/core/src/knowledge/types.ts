import type { ArchitectureScopeRef } from "../architecture/types";

export type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
export type ArchitectureAspect = "structure" | "behavior" | "information" | "contract" | "constraint";
export type KnowledgeAssertionStatus = "DRAFT" | "CANDIDATE" | "ACCEPTED" | "REJECTED" | "CONFLICTED" | "SUPERSEDED";
export type IdentityCandidateDecision = "UNDECIDED" | "ACCEPTED" | "REJECTED" | "CONFLICTED";
export type ChangeSetStatus = "OPEN" | "COMMITTED" | "REJECTED";
export type WorkingStreamStatus = "ACTIVE" | "FROZEN" | "ARCHIVED";
export type BaselineStatus = "PUBLISHED" | "SUPERSEDED" | "BLOCKED";
export type ReviewBundleStatus = "DRAFT" | "READY" | "BLOCKED" | "APPROVED" | "REJECTED";
export type ReviewRiskTier = "T0" | "T1" | "T2" | "T3";
export type PromotionDecision = "APPROVE" | "REJECT";

export interface LocalePolicy {
  canonicalLocale: string;
  requiredLocales: string[];
  supportedLocales: string[];
}

export interface AnalysisProfile {
  id: string;
  name: string;
  supportedLayers: ArchitectureLayer[];
  supportedAspects: ArchitectureAspect[];
  requiresDdd: boolean;
  extractorKinds: string[];
  version: string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  scopeLevels: string[];
  minimumWriteLevel: string;
  localePolicy: LocalePolicy;
  aliases: Record<string, string[]>;
  extensions: Record<string, unknown>;
}

export interface KnowledgeAssertion {
  id: string;
  semanticIdentity: string;
  factType: string;
  layer: ArchitectureLayer;
  aspect: ArchitectureAspect;
  value: Record<string, unknown>;
  architectureScope: ArchitectureScopeRef;
  status: KnowledgeAssertionStatus;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
  unresolvedQuestions: string[];
  evidenceRefs: string[];
  sourceObservationIds: string[];
  extractorId: string;
  riskTier?: ReviewRiskTier;
  domainCluster?: string;
  generatedByActorId?: string;
  revision: number;
  changeSetId?: string;
  createdAt: string;
  updatedAt: string;
}

export type SemanticIdentityDecision = "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS";

export interface SemanticCandidateProvenance {
  agent: string;
  model?: string;
  tool?: string;
  runId?: string;
}

export interface SemanticCandidateSubmission {
  semanticIdentity: string;
  normalizedDigest: string;
  factType: string;
  layer: ArchitectureLayer;
  aspect: ArchitectureAspect;
  value: Record<string, unknown>;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
  unresolvedQuestions: string[];
  evidenceRefs: string[];
  sourceObservationIds: string[];
  domainCluster: string;
  identityDecision: SemanticIdentityDecision;
}

export interface SemanticCandidateBatch {
  sessionId: string;
  sequence: number;
  previousBatchDigest?: string;
  complete: boolean;
  provenance: SemanticCandidateProvenance;
  candidates: SemanticCandidateSubmission[];
}

export interface SemanticCandidateBatchReceipt {
  sessionId: string;
  acceptedSequence: number;
  acceptedBatchDigest: string;
  assertionIds: string[];
  idempotent: boolean;
  complete: boolean;
}

const reviewRiskOrder: Record<ReviewRiskTier, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
const criticalFactTypes = new Set(["security-policy", "authorization-policy", "privacy-policy", "compliance-policy"]);
const structuralFactTypes = new Set(["api-contract", "event-contract", "data-model", "state-machine", "business-rule", "typed-relationship", "architecture-decision"]);

export function classifyCandidateRisk(candidate: Pick<SemanticCandidateSubmission, "factType" | "value" | "confidence" | "evidenceRefs" | "sourceObservationIds" | "unresolvedQuestions" | "identityDecision">): ReviewRiskTier {
  const factType = candidate.factType.trim().toLowerCase();
  if (criticalFactTypes.has(factType) || /(security|authorization|authentication|privacy|compliance)/u.test(factType)) return "T3";
  if (isBreakingCandidateValue(candidate.value)) return "T2";
  if (structuralFactTypes.has(factType)) return "T1";
  if (
    factType === "documentation"
    && candidate.confidence >= 0.95
    && candidate.identityDecision === "UNAMBIGUOUS"
    && candidate.unresolvedQuestions.length === 0
    && candidate.evidenceRefs.length > 0
    && candidate.sourceObservationIds.length > 0
    && hasBilingualCandidateContent(candidate.value)
  ) return "T0";
  return "T1";
}

export function maximumReviewRisk(tiers: readonly ReviewRiskTier[]): ReviewRiskTier {
  return tiers.reduce<ReviewRiskTier>((maximum, tier) => reviewRiskOrder[tier] > reviewRiskOrder[maximum] ? tier : maximum, "T0");
}

export function hasBilingualCandidateContent(value: Record<string, unknown>): boolean {
  const summary = asRecord(value.summary);
  if (nonEmptyContent(summary?.en) && nonEmptyContent(summary?.zh)) return true;
  const canonical = asRecord(value.canonicalContent);
  const localized = asRecord(value.localizedContent);
  const chinese = asRecord(localized?.zh);
  return hasTextLeaf(canonical) && hasTextLeaf(chinese);
}

export function isBreakingCandidateValue(value: Record<string, unknown>): boolean {
  if (value.breaking === true || value.breakingChange === true) return true;
  return asRecord(value.compatibility)?.breaking === true;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonEmptyContent(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : hasTextLeaf(asRecord(value));
}

function hasTextLeaf(value: Record<string, unknown> | undefined): boolean {
  if (!value) return false;
  return Object.values(value).some((item) => typeof item === "string" ? item.trim().length > 0 : Array.isArray(item) ? item.some(nonEmptyContent) : hasTextLeaf(asRecord(item)));
}

export interface IdentityCandidate {
  id: string;
  semanticIdentity: string;
  sourceObservationId: string;
  targetAssetType: string;
  targetAssetId?: string;
  architectureScope: ArchitectureScopeRef;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
  decision: IdentityCandidateDecision;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeSet {
  id: string;
  architectureScope: ArchitectureScopeRef;
  streamId: string;
  sequence: number;
  status: ChangeSetStatus;
  assetRevisionIds: string[];
  relationshipRevisionIds: string[];
  architectureFactRevisionIds: string[];
  evidenceRefs: string[];
  digest: string;
  promotionDecisionId?: string;
  createdAt: string;
  committedAt?: string;
}

export interface WorkingStream {
  id: string;
  architectureScope: ArchitectureScopeRef;
  name: string;
  status: WorkingStreamStatus;
  headChangeSetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaselineManifest {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  changeSetId: string;
  sourceRevisionIds: string[];
  architectureFactRevisionIds: string[];
  relationshipVersion: string;
  promotionReceiptId?: string;
  reconciliationReceiptId?: string;
  scanSessionDigest?: string;
  publishedAt: string;
}

export interface Baseline {
  id: string;
  architectureScope: ArchitectureScopeRef;
  streamId: string;
  changeSetId: string;
  status: BaselineStatus;
  manifest: BaselineManifest;
  createdAt: string;
  publishedAt?: string;
}

export interface ProjectionManifest {
  id: string;
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  projectionType: "BIZ_KL" | "SYS_KL" | "TECH_KL" | "DIAGRAM" | "CATALOG" | "ALIGNMENT" | "DRIFT" | "CONTEXT_PACK";
  projectionSchemaVersion: string;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  digest: string;
  generatedAt: string;
}

export interface ReviewCoverage {
  totalSources: number;
  processedSources: number;
  supportedSources: number;
  candidateCount: number;
  complete: boolean;
}

export interface ReviewBundle {
  id: string;
  architectureScope: ArchitectureScopeRef;
  designChangeSessionId: string;
  status: ReviewBundleStatus;
  riskTier: ReviewRiskTier;
  assertionIds: string[];
  identityCandidateIds: string[];
  architectureFactRevisionIds: string[];
  evidenceRefs: string[];
  coverage: ReviewCoverage;
  blockingIssues: string[];
  digest: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgePromotionDecision {
  id: string;
  architectureScope: ArchitectureScopeRef;
  reviewBundleId: string;
  designChangeSessionId: string;
  decision: PromotionDecision;
  approvedAssertionIds: string[];
  approvedIdentityCandidateIds: string[];
  approvedArchitectureFactRevisionIds: string[];
  evidenceRefs: string[];
  reason: string;
  actorId: string;
  createdAt: string;
}

export interface KnowledgePromotionReceipt {
  id: string;
  architectureScope: ArchitectureScopeRef;
  promotionDecisionId: string;
  reviewBundleId: string;
  scanSessionId: string;
  scanSessionDigest: string;
  sourceDigest: string;
  streamId: string;
  changeSetId: string;
  changeSetSequence: number;
  assetRevisionIds: string[];
  relationshipRevisionIds: string[];
  architectureFactRevisionIds: string[];
  architectureFactBatchId?: string;
  evidenceRefs: string[];
  relationshipVersion: string;
  idempotent: boolean;
  createdAt: string;
}

export type KnowledgeReconciliationStatus = "CONVERGED" | "DRIFTED" | "BLOCKED";

export interface KnowledgeReconciliationResult {
  id: string;
  architectureScope: ArchitectureScopeRef;
  promotionReceiptId: string;
  promotionSourceDigest: string;
  scanSessionId: string;
  scanSessionDigest: string;
  changeSetId: string;
  status: KnowledgeReconciliationStatus;
  issues: string[];
  assetRevisionIds: string[];
  relationshipRevisionIds: string[];
  architectureFactRevisionIds: string[];
  evidenceRefs: string[];
  relationshipVersion: string;
  reconciledAt: string;
}
