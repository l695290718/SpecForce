import { describe, expect, it } from "vitest";
import type { KnowledgeAssertion, ReviewBundle, ScopedActor } from "@specforge/core";
import { assessReviewCandidates, assertCandidateApprovalPolicy } from "./risk-policy";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };

function assertion(overrides: Partial<KnowledgeAssertion> = {}): KnowledgeAssertion {
  return {
    id: "assertion-1",
    semanticIdentity: "orders.api",
    factType: "api-contract",
    layer: "SYS",
    aspect: "contract",
    value: {
      canonicalContent: { summary: "Orders API" },
      localizedContent: { zh: { summary: "订单 API" } },
      review: { identityDecision: "UNAMBIGUOUS" }
    },
    architectureScope: scope,
    status: "CANDIDATE",
    confidence: 0.92,
    matchingEvidence: ["source:orders"],
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: ["evidence:orders"],
    sourceObservationIds: ["source:scan:orders"],
    extractorId: "agent:claude-code",
    riskTier: "T1",
    domainCluster: "orders",
    generatedByActorId: "semantic-agent",
    revision: 1,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides
  };
}

function bundle(riskTier: ReviewBundle["riskTier"]): ReviewBundle {
  return {
    id: "review-1",
    architectureScope: scope,
    designChangeSessionId: "session-1",
    status: "READY",
    riskTier,
    assertionIds: ["assertion-1"],
    identityCandidateIds: [],
    evidenceRefs: ["evidence:orders"],
    coverage: { totalSources: 1, processedSources: 1, supportedSources: 1, candidateCount: 1, complete: true },
    blockingIssues: [],
    digest: "digest",
    createdBy: "semantic-agent",
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z"
  };
}

describe("candidate review policy", () => {
  it("uses maximum candidate risk and blocks incomplete candidate facts", () => {
    const result = assessReviewCandidates([
      assertion(),
      assertion({ id: "assertion-2", riskTier: "T3", evidenceRefs: [], value: { canonicalContent: { summary: "English only" }, review: { identityDecision: "AMBIGUOUS" } } })
    ]);

    expect(result.riskTier).toBe("T3");
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      "CANDIDATE_EVIDENCE_MISSING:assertion-2",
      "CANDIDATE_BILINGUAL_CONTENT_MISSING:assertion-2",
      "CANDIDATE_IDENTITY_AMBIGUOUS:assertion-2"
    ]));
  });

  it("prevents the generating actor from approving T1", () => {
    const actor: ScopedActor = { actorType: "agent", actorId: "semantic-agent", grants: [] };
    expect(() => assertCandidateApprovalPolicy(bundle("T1"), [assertion()], actor)).toThrow("REVIEW_ACTOR_SEPARATION_REQUIRED");
  });

  it.each(["T2", "T3"] as const)("requires a human reviewer for %s", (riskTier) => {
    const actor: ScopedActor = { actorType: "agent", actorId: "independent-agent", grants: [] };
    expect(() => assertCandidateApprovalPolicy(bundle(riskTier), [assertion({ riskTier })], actor)).toThrow("REVIEW_HUMAN_APPROVAL_REQUIRED");
  });

  it("allows an independent actor for T1 and a user for T2/T3", () => {
    expect(() => assertCandidateApprovalPolicy(bundle("T1"), [assertion()], { actorType: "agent", actorId: "review-agent", grants: [] })).not.toThrow();
    expect(() => assertCandidateApprovalPolicy(bundle("T3"), [assertion({ riskTier: "T3" })], { actorType: "user", actorId: "architect", grants: [] })).not.toThrow();
  });
});
