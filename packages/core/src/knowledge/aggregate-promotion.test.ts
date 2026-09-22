import { describe, expect, it } from "vitest";
import { promotionReviewSetDigest, reviewSetCoverage } from "./service";
import type { KnowledgeReviewSetPromotionInput } from "./types";

const scope = { applicationServiceId: "com.specforge.designcenter", scopePath: "scope" };

function aggregateInput(overrides: Partial<KnowledgeReviewSetPromotionInput> = {}): KnowledgeReviewSetPromotionInput {
  return {
    architectureScope: scope,
    reviewSetId: "review-set-1",
    scanSessionId: "scan-1",
    designChangeSessionId: "session-1",
    streamId: "stream-1",
    expectedReviewBundleIds: ["bundle-a"],
    promotionDecisionIds: ["decision-a"],
    approvedAssertionIds: ["assertion-a"],
    approvedIdentityCandidateIds: ["identity-a"],
    sourceObservationIds: ["source-a"],
    evidenceRefs: ["evidence-a"],
    ...overrides
  };
}

describe("aggregate promotion contract", () => {
  it("hashes the same review set regardless of input ordering", () => {
    const base = aggregateInput({
      expectedReviewBundleIds: ["bundle-b", "bundle-a"],
      promotionDecisionIds: ["decision-b", "decision-a"],
      approvedAssertionIds: ["assertion-b", "assertion-a"]
    });
    expect(promotionReviewSetDigest(base)).toBe(promotionReviewSetDigest({
      ...base,
      expectedReviewBundleIds: [...base.expectedReviewBundleIds].reverse(),
      promotionDecisionIds: [...base.promotionDecisionIds].reverse(),
      approvedAssertionIds: [...base.approvedAssertionIds].reverse()
    }));
  });

  it("does not report complete coverage when an observation is missing", () => {
    expect(reviewSetCoverage({ expected: ["source-a", "source-b"], approved: ["source-a"] }).complete).toBe(false);
  });

  it("reports exact closure without mutating caller arrays", () => {
    const expected = ["source-b", "source-a"];
    const approved = ["source-a", "source-b"];
    expect(reviewSetCoverage({ expected, approved })).toMatchObject({ totalSources: 2, approvedSources: 2, complete: true });
    expect(expected).toEqual(["source-b", "source-a"]);
  });
});
