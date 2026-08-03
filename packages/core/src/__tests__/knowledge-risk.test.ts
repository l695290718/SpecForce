import { describe, expect, it } from "vitest";
import { classifyCandidateRisk, hasBilingualCandidateContent, maximumReviewRisk } from "../knowledge/risk";
import type { SemanticCandidateSubmission } from "../knowledge/types";

function candidate(factType: string, confidence: number, value: Record<string, unknown> = {}): SemanticCandidateSubmission {
  return {
    semanticIdentity: `candidate.${factType}`,
    normalizedDigest: `${factType}-digest`,
    factType,
    layer: "SYS",
    aspect: "structure",
    value: {
      canonicalContent: { summary: "Canonical English meaning" },
      localizedContent: { zh: { summary: "中文语义" } },
      ...value
    },
    confidence,
    matchingEvidence: ["source:orders"],
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: ["evidence:orders"],
    sourceObservationIds: ["source:scan:orders"],
    domainCluster: "orders",
    identityDecision: "UNAMBIGUOUS"
  };
}

describe("candidate-level review risk", () => {
  it.each([
    [candidate("documentation", 0.98), "T0"],
    [candidate("api-contract", 0.92), "T1"],
    [candidate("data-model", 0.88, { breaking: true }), "T2"],
    [candidate("security-policy", 0.95), "T3"]
  ] as const)("classifies $expected deterministically", (input, expected) => {
    expect(classifyCandidateRisk(input)).toBe(expected);
  });

  it("does not allow incomplete documentation to fall into T0", () => {
    expect(classifyCandidateRisk({ ...candidate("documentation", 0.99), identityDecision: "AMBIGUOUS" })).toBe("T1");
    expect(classifyCandidateRisk({ ...candidate("documentation", 0.99), evidenceRefs: [] })).toBe("T1");
    expect(classifyCandidateRisk({ ...candidate("documentation", 0.99), value: { canonicalContent: { summary: "English only" } } })).toBe("T1");
  });

  it("uses the maximum candidate risk for a bundle", () => {
    expect(maximumReviewRisk(["T0", "T2", "T1"])).toBe("T2");
    expect(maximumReviewRisk([])).toBe("T0");
  });

  it("accepts canonical-plus-overlay and legacy bilingual summaries", () => {
    expect(hasBilingualCandidateContent(candidate("documentation", 0.98).value)).toBe(true);
    expect(hasBilingualCandidateContent({ summary: { en: "English", zh: "中文" } })).toBe(true);
    expect(hasBilingualCandidateContent({ summary: { en: "English" } })).toBe(false);
  });
});
