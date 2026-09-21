import { describe, expect, it } from "vitest";
import type { KnowledgeAssertion } from "@specforge/core";
import { partitionReviewCandidates } from "./review-bundle";

const scope = { applicationServiceId: "com.specforge.designcenter", scopePath: "scope" };

function assertion(id: string, domainCluster: string, riskTier: KnowledgeAssertion["riskTier"]): KnowledgeAssertion {
  return {
    id,
    semanticIdentity: `identity.${id}`,
    factType: "data-model",
    layer: "SYS",
    aspect: "information",
    value: { canonicalContent: { summary: id }, localizedContent: { zh: { summary: `${id} 中文` } }, review: { identityDecision: "UNAMBIGUOUS", agentEvidenceComplete: true } },
    architectureScope: scope,
    status: "CANDIDATE",
    confidence: 0.95,
    matchingEvidence: [`source:${id}`],
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: [`evidence:${id}`],
    sourceObservationIds: [`source:scan:${id}`],
    extractorId: "agent:codex",
    riskTier,
    domainCluster,
    generatedByActorId: "semantic-agent",
    revision: 1,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z"
  };
}

describe("review bundle partitioning", () => {
  it("partitions deterministically by risk and domain cluster", () => {
    const partitions = partitionReviewCandidates([
      assertion("three", "orders", "T2"),
      assertion("one", "platform", "T1"),
      assertion("two", "platform", "T1")
    ]);

    expect(partitions.map((partition) => partition.key)).toEqual(["T1:platform", "T2:orders"]);
    expect(partitions[0]!.assertions.map((item) => item.id)).toEqual(["one", "two"]);
    expect(partitions[0]!.sourceObservationIds).toEqual(["source:scan:one", "source:scan:two"]);
  });
});
