import { describe, expect, it } from "vitest";
import { projectReviewQueueCandidate, reviewQueuePageLimit } from "./review-queue";

describe("independent review queue disclosure", () => {
  it("uses projection-specific page limits and rejects oversized requests", () => {
    expect(reviewQueuePageLimit("BUNDLES", undefined)).toBe(50);
    expect(reviewQueuePageLimit("CANDIDATES", undefined)).toBe(25);
    expect(reviewQueuePageLimit("CANDIDATES", 50)).toBe(50);
    expect(() => reviewQueuePageLimit("CANDIDATES", 51)).toThrow("REVIEW_QUEUE_PAGE_SIZE_INVALID");
  });

  it("returns only bounded bilingual candidate content", () => {
    const candidate = projectReviewQueueCandidate({
      id: "assertion-1",
      semanticIdentity: "orders.api",
      factType: "api-contract",
      layer: "SYS",
      aspect: "contract",
      status: "CANDIDATE",
      confidence: 0.91,
      riskTier: "T2",
      domainCluster: "orders",
      unresolvedQuestions: ["A question"],
      evidenceRefs: ["evidence-1"],
      sourceObservationIds: ["observation-1"],
      value: {
        canonicalContent: { title: "Orders API", description: "English description" },
        localizedContent: { zh: { title: "订单 API", description: "中文描述" } },
        secret: "must-not-leak",
        review: { identityDecision: "UNAMBIGUOUS", candidateDigest: "a".repeat(64) }
      }
    }, "bundle-1");

    expect(candidate).toMatchObject({
      reviewBundleId: "bundle-1",
      assertionId: "assertion-1",
      canonicalContent: { title: "Orders API", description: "English description" },
      localizedContentZh: { title: "订单 API", description: "中文描述" }
    });
    expect(candidate).not.toHaveProperty("value");
    expect(JSON.stringify(candidate)).not.toContain("must-not-leak");
  });
});
