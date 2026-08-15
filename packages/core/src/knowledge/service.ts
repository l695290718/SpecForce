import type { ArchitectureScopeRef } from "../architecture/types";
import type { AnalysisProfile } from "./types";
import { assertAnalysisProfile } from "./profiles";
import { contentDigest } from "../federation/digest";
import type { Baseline, ChangeSet, KnowledgeAssertion, KnowledgePromotionDecision, ProjectionManifest, ReviewBundle, ReviewCoverage } from "./types";

export function assertExactScope(actual: ArchitectureScopeRef, expected: ArchitectureScopeRef): void {
  if (actual.applicationServiceId !== expected.applicationServiceId || actual.scopePath !== expected.scopePath) {
    throw new Error("SCOPE_MISMATCH");
  }
}

export function validateKnowledgeAssertion(assertion: KnowledgeAssertion, profile: AnalysisProfile): void {
  if (!assertion.id || !assertion.semanticIdentity || !assertion.factType || !assertion.extractorId) {
    throw new Error("KNOWLEDGE_ASSERTION_IDENTITY_REQUIRED");
  }
  assertAnalysisProfile(profile, assertion.layer, assertion.aspect);
  if (!Number.isFinite(assertion.confidence) || assertion.confidence < 0 || assertion.confidence > 1) {
    throw new Error("KNOWLEDGE_ASSERTION_CONFIDENCE_INVALID");
  }
  if (!Array.isArray(assertion.evidenceRefs) || assertion.evidenceRefs.length === 0) {
    throw new Error("KNOWLEDGE_ASSERTION_EVIDENCE_REQUIRED");
  }
}

export function changeSetDigest(input: Pick<ChangeSet, "architectureScope" | "streamId" | "sequence" | "assetRevisionIds" | "relationshipRevisionIds" | "architectureFactRevisionIds" | "evidenceRefs">): string {
  return contentDigest({ ...input, assetRevisionIds: [...input.assetRevisionIds].sort(), relationshipRevisionIds: [...input.relationshipRevisionIds].sort(), architectureFactRevisionIds: [...input.architectureFactRevisionIds].sort(), evidenceRefs: [...input.evidenceRefs].sort() });
}

export function projectionManifestDigest(input: Pick<ProjectionManifest, "architectureScope" | "baselineId" | "projectionType" | "projectionSchemaVersion" | "sourceRevisionIds" | "relationshipVersion" | "query">): string {
  return contentDigest(input);
}

export function assertBaselinePublishable(baseline: Pick<Baseline, "status" | "manifest">, reconciliationStatus: "CONVERGED" | "DRIFTED" | "BLOCKED"): void {
  if (baseline.status !== "PUBLISHED") throw new Error("BASELINE_STATUS_INVALID");
  if (reconciliationStatus !== "CONVERGED") throw new Error(`BASELINE_RECONCILIATION_${reconciliationStatus}`);
  if (!baseline.manifest.changeSetId || (baseline.manifest.sourceRevisionIds.length === 0 && baseline.manifest.architectureFactRevisionIds.length === 0)) {
    throw new Error("BASELINE_MANIFEST_INCOMPLETE");
  }
}

export function reviewBundleDigest(input: Pick<ReviewBundle, "architectureScope" | "designChangeSessionId" | "riskTier" | "assertionIds" | "identityCandidateIds" | "architectureFactRevisionIds" | "evidenceRefs" | "coverage" | "blockingIssues">): string {
  return contentDigest({
    architectureScope: input.architectureScope,
    designChangeSessionId: input.designChangeSessionId,
    riskTier: input.riskTier,
    assertionIds: [...input.assertionIds].sort(),
    identityCandidateIds: [...input.identityCandidateIds].sort(),
    architectureFactRevisionIds: [...input.architectureFactRevisionIds].sort(),
    evidenceRefs: [...input.evidenceRefs].sort(),
    coverage: input.coverage,
    blockingIssues: [...input.blockingIssues].sort()
  });
}

export function evaluateReviewBundle(coverage: ReviewCoverage, blockingIssues: string[]): "READY" | "BLOCKED" {
  if (!coverage.complete || coverage.processedSources < coverage.totalSources || coverage.supportedSources > coverage.processedSources || blockingIssues.length > 0) return "BLOCKED";
  return "READY";
}

export function assertReviewBundleApprovable(bundle: Pick<ReviewBundle, "status" | "coverage" | "blockingIssues">): void {
  if (bundle.status !== "READY") throw new Error("REVIEW_BUNDLE_NOT_READY");
  if (!bundle.coverage.complete || bundle.blockingIssues.length > 0) throw new Error("REVIEW_BUNDLE_BLOCKED");
}

export function assertPromotionDecisionValid(input: Pick<KnowledgePromotionDecision, "decision" | "reason" | "evidenceRefs" | "approvedAssertionIds" | "approvedIdentityCandidateIds" | "approvedArchitectureFactRevisionIds">, bundle: Pick<ReviewBundle, "status" | "assertionIds" | "identityCandidateIds" | "architectureFactRevisionIds" | "coverage" | "blockingIssues">): void {
  if (!input.reason.trim() || input.evidenceRefs.length === 0) throw new Error("PROMOTION_DECISION_EVIDENCE_REQUIRED");
  if (input.decision === "APPROVE") {
    assertReviewBundleApprovable(bundle);
    if (input.approvedAssertionIds.length === 0 && input.approvedIdentityCandidateIds.length === 0 && input.approvedArchitectureFactRevisionIds.length === 0) throw new Error("PROMOTION_TARGETS_REQUIRED");
    if (input.approvedAssertionIds.some((id) => !bundle.assertionIds.includes(id)) || input.approvedIdentityCandidateIds.some((id) => !bundle.identityCandidateIds.includes(id))) throw new Error("PROMOTION_TARGET_OUTSIDE_REVIEW_BUNDLE");
    if (input.approvedArchitectureFactRevisionIds.some((id) => !bundle.architectureFactRevisionIds.includes(id))) throw new Error("PROMOTION_TARGET_OUTSIDE_REVIEW_BUNDLE");
  }
}
