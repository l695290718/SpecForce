import { describe, expect, it } from "vitest";
import { assertBaselinePublishable, assertPromotionDecisionValid, changeSetDigest, evaluateReviewBundle, genericSystemAnalysisProfile, projectionManifestDigest, reviewBundleDigest, validateKnowledgeAssertion } from "../index";

const scope = {
  applicationServiceId: "com.example.orders",
  scopePath: "org-example/product-orders/com.example.orders"
};

describe("generic 3A knowledge foundation", () => {
  it("accepts non-DDD assertions across the three architecture layers when evidence is present", () => {
    expect(() => validateKnowledgeAssertion({
      id: "assertion-order-api",
      semanticIdentity: "order.lifecycle",
      factType: "state-transition",
      layer: "SYS",
      aspect: "behavior",
      value: { from: "PENDING", to: "CONFIRMED" },
      architectureScope: scope,
      status: "CANDIDATE",
      confidence: 0.82,
      matchingEvidence: ["scanner:workflow-1"],
      counterEvidence: [],
      unresolvedQuestions: [],
      evidenceRefs: ["evidence-order-workflow"],
      sourceObservationIds: ["observation-order-1"],
      extractorId: "generic-repository-extractor",
      revision: 1,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z"
    }, genericSystemAnalysisProfile)).not.toThrow();
  });

  it("rejects an assertion without evidence", () => {
    expect(() => validateKnowledgeAssertion({
      id: "assertion-unproven",
      semanticIdentity: "order.lifecycle",
      factType: "state-transition",
      layer: "BIZ",
      aspect: "behavior",
      value: {},
      architectureScope: scope,
      status: "CANDIDATE",
      confidence: 0.5,
      matchingEvidence: [],
      counterEvidence: [],
      unresolvedQuestions: [],
      evidenceRefs: [],
      sourceObservationIds: [],
      extractorId: "generic-agent",
      revision: 1,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z"
    }, genericSystemAnalysisProfile)).toThrow("KNOWLEDGE_ASSERTION_EVIDENCE_REQUIRED");
  });

  it("produces stable ChangeSet and projection digests", () => {
    const changeSet = {
      architectureScope: scope,
      streamId: "stream-main",
      sequence: 1,
      assetRevisionIds: ["asset-2", "asset-1"],
      relationshipRevisionIds: ["relation-1"],
      evidenceRefs: ["evidence-1"]
    };
    expect(changeSetDigest(changeSet)).toBe(changeSetDigest({ ...changeSet, assetRevisionIds: ["asset-2", "asset-1"] }));
    expect(projectionManifestDigest({ architectureScope: scope, baselineId: "baseline-1", projectionType: "SYS_KL", projectionSchemaVersion: "1", sourceRevisionIds: ["asset-1"], relationshipVersion: "7", query: { layer: "SYS" } })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when a baseline is not converged", () => {
    const baseline = { status: "PUBLISHED" as const, manifest: { architectureScope: scope, baselineId: "baseline-1", changeSetId: "changeset-1", sourceRevisionIds: ["asset-1"], relationshipVersion: "7", publishedAt: "2026-08-02T00:00:00.000Z" } };
    expect(() => assertBaselinePublishable(baseline, "DRIFTED")).toThrow("BASELINE_RECONCILIATION_DRIFTED");
    expect(() => assertBaselinePublishable(baseline, "CONVERGED")).not.toThrow();
  });

  it("blocks partial coverage and accepts a complete review bundle", () => {
    expect(evaluateReviewBundle({ totalSources: 2, processedSources: 1, supportedSources: 1, candidateCount: 1, complete: false }, [])).toBe("BLOCKED");
    expect(evaluateReviewBundle({ totalSources: 2, processedSources: 2, supportedSources: 2, candidateCount: 1, complete: true }, [])).toBe("READY");
    const bundle = { status: "READY" as const, assertionIds: ["assertion-1"], identityCandidateIds: ["candidate-1"], coverage: { totalSources: 1, processedSources: 1, supportedSources: 1, candidateCount: 2, complete: true }, blockingIssues: [] };
    expect(() => assertPromotionDecisionValid({ decision: "APPROVE", reason: "Reviewed", evidenceRefs: ["evidence-1"], approvedAssertionIds: ["assertion-1"], approvedIdentityCandidateIds: ["candidate-1"] }, bundle)).not.toThrow();
    expect(reviewBundleDigest({ architectureScope: scope, designChangeSessionId: "session-1", riskTier: "T1", assertionIds: ["assertion-1"], identityCandidateIds: ["candidate-1"], evidenceRefs: ["evidence-1"], coverage: bundle.coverage, blockingIssues: [] })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects promotion targets outside the review bundle", () => {
    const bundle = { status: "READY" as const, assertionIds: ["assertion-1"], identityCandidateIds: [], coverage: { totalSources: 1, processedSources: 1, supportedSources: 1, candidateCount: 1, complete: true }, blockingIssues: [] };
    expect(() => assertPromotionDecisionValid({ decision: "APPROVE", reason: "Reviewed", evidenceRefs: ["evidence-1"], approvedAssertionIds: ["assertion-outside"], approvedIdentityCandidateIds: [] }, bundle)).toThrow("PROMOTION_TARGET_OUTSIDE_REVIEW_BUNDLE");
  });
});
