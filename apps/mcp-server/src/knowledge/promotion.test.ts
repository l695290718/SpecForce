import type { KnowledgeAssertion } from "@specforge/core";
import { describe, expect, it } from "vitest";
import { mapKnowledgeAssertionForPromotion, promotionInputDigest } from "./promotion";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

function assertion(overrides: Partial<KnowledgeAssertion> = {}): KnowledgeAssertion {
  return {
    id: "candidate-api-1",
    semanticIdentity: "orders.api.create-order",
    factType: "api-contract",
    layer: "SYS",
    aspect: "contract",
    value: {
      canonicalContent: { summary: "Creates an order after validation.", method: "POST", path: "/orders" },
      localizedContent: { zh: { summary: "校验后创建订单。" } },
      review: { normalizedDigest: "candidate-revision-1", identityDecision: "UNAMBIGUOUS" },
      agentProvenance: { sessionId: "scan-session-1" }
    },
    architectureScope: scope,
    status: "ACCEPTED",
    confidence: 0.95,
    matchingEvidence: ["source:orders"],
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: ["source-observation:orders"],
    sourceObservationIds: ["orders"],
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

describe("knowledge promotion mapping", () => {
  it("maps a supported fact to a stable immutable asset revision", () => {
    const first = mapKnowledgeAssertionForPromotion(assertion(), scope);
    const second = mapKnowledgeAssertionForPromotion(assertion({ id: "rescan-candidate" }), scope);
    expect(first).toMatchObject({ assetType: "api", semanticIdentity: "orders.api.create-order" });
    expect((first as { revisionDigest: string }).revisionDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(second).toMatchObject({ id: (first as { id: string }).id });
    expect((first as { payload: Record<string, unknown> }).payload).toMatchObject({
      name: "Creates an order after validation.",
      localizedContent: { zh: { name: "校验后创建订单。", description: "校验后创建订单。" } }
    });
    expect(((first as unknown as { payload: { localizedContent: Record<string, unknown> } }).payload.localizedContent)).not.toHaveProperty("en");
  });

  it("derives revision identity from governed content instead of an agent-supplied digest", () => {
    const first = mapKnowledgeAssertionForPromotion(assertion(), scope) as { id: string; revisionDigest: string };
    const digestTampered = mapKnowledgeAssertionForPromotion(assertion({ value: { ...assertion().value, review: { normalizedDigest: "untrusted-agent-value" } } }), scope) as { id: string; revisionDigest: string };
    const contentChanged = mapKnowledgeAssertionForPromotion(assertion({ value: { ...assertion().value, canonicalContent: { summary: "Creates a different order." } } }), scope) as { id: string; revisionDigest: string };

    expect(digestTampered).toMatchObject({ id: first.id, revisionDigest: first.revisionDigest });
    expect(contentChanged.id).not.toBe(first.id);
  });

  it("fails closed for unsupported fact types and incomplete bilingual content", () => {
    expect(() => mapKnowledgeAssertionForPromotion(assertion({ factType: "deployment-secret" }), scope)).toThrow("PROMOTION_MAPPING_UNSUPPORTED");
    expect(() => mapKnowledgeAssertionForPromotion(assertion({ value: { canonicalContent: { summary: "English only" } } }), scope)).toThrow("PROMOTION_BILINGUAL_CONTENT_REQUIRED");
  });

  it.each([
    ["integration", "integration"],
    ["quality", "quality"],
    ["observability", "observability"],
    ["service-feature", "serviceFeature"],
    ["functional-feature", "functionalFeature"],
    ["proposal", "proposal"],
    ["context-pack", "contextPack"],
    ["evidence", "evidence"]
  ] as const)("maps %s full-asset facts to %s assets", (factType, assetType) => {
    expect(mapKnowledgeAssertionForPromotion(assertion({ factType }), scope)).toMatchObject({ assetType });
  });

  it("maps only explicit directional typed relationships", () => {
    const mapped = mapKnowledgeAssertionForPromotion(assertion({
      id: "candidate-relationship-1",
      semanticIdentity: "orders.api-writes-order",
      factType: "typed-relationship",
      value: {
        canonicalContent: {
          summary: "The create-order API writes the order model.",
          source: { semanticIdentity: "orders.api.create-order" },
          target: { assetId: "orders-data-model", assetType: "dataModel" },
          relationType: "WRITES"
        },
        localizedContent: { zh: { summary: "创建订单 API 写入订单数据模型。" } },
        review: { normalizedDigest: "relationship-revision-1", identityDecision: "UNAMBIGUOUS" },
        agentProvenance: { sessionId: "scan-session-1" }
      }
    }), scope);
    expect(mapped).toMatchObject({ relationType: "WRITES", source: { semanticIdentity: "orders.api.create-order" }, target: { assetId: "orders-data-model", assetType: "dataModel" } });
  });

  it("canonicalizes unordered promotion inputs before hashing", () => {
    const base = {
      architectureScope: scope,
      promotionDecisionId: "decision-1",
      reviewBundleDigest: "review-digest",
      scanSessionId: "scan-session-1",
      scanSessionDigest: "scan-digest",
      streamId: "stream-1",
      assertionDigests: [{ id: "b", digest: "2" }, { id: "a", digest: "1" }],
      identityCandidateIds: ["identity-b", "identity-a"]
    };
    expect(promotionInputDigest(base)).toBe(promotionInputDigest({ ...base, assertionDigests: [...base.assertionDigests].reverse(), identityCandidateIds: [...base.identityCandidateIds].reverse() }));
  });
});
