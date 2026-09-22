import { describe, expect, it } from "vitest";
import { assertReviewerIndependent } from "./persistence";

describe("reviewer independence policy", () => {
  const base = {
    sessionActorId: "scan-agent",
    assertionGeneratorActorIds: ["semantic-agent"],
    reviewerActorId: "reviewer-agent",
    evidenceRefs: ["evidence-1"]
  };

  it("rejects the scan actor and candidate generator for T1-T3", () => {
    expect(() => assertReviewerIndependent({ ...base, riskTier: "T1", reviewerActorId: "scan-agent" })).toThrow("REVIEWER_INDEPENDENCE_REQUIRED");
    expect(() => assertReviewerIndependent({ ...base, riskTier: "T3", reviewerActorId: "semantic-agent" })).toThrow("REVIEWER_INDEPENDENCE_REQUIRED");
  });

  it("keeps T0 as the deterministic exception and requires evidence for T2/T3", () => {
    expect(() => assertReviewerIndependent({ ...base, riskTier: "T0", reviewerActorId: "scan-agent", evidenceRefs: [] })).not.toThrow();
    expect(() => assertReviewerIndependent({ ...base, riskTier: "T2", evidenceRefs: [] })).toThrow("REVIEW_DECISION_EVIDENCE_REQUIRED");
    expect(() => assertReviewerIndependent({ ...base, riskTier: "T3" })).not.toThrow();
  });
});
