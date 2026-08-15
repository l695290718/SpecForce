import { describe, expect, it } from "vitest";
import { deriveKnowledgeProjection, type KnowledgeAssertion, type KnowledgeProjectionRelationship } from "../knowledge";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/product/orders" };
const baseline = {
  id: "baseline-1",
  status: "PUBLISHED" as const,
  architectureScope: scope,
  manifest: { architectureScope: scope, baselineId: "baseline-1", changeSetId: "changeset-1", sourceRevisionIds: ["biz-1", "sys-1", "tech-1"], architectureFactRevisionIds: [], relationshipVersion: "r1", publishedAt: "2026-08-03T00:00:00.000Z" }
};

function assertion(id: string, layer: KnowledgeAssertion["layer"], semanticIdentity: string, revision = 1): KnowledgeAssertion {
  return { id, semanticIdentity, factType: `${layer.toLowerCase()}-fact`, layer, aspect: "structure", value: { summary: semanticIdentity }, architectureScope: scope, status: "ACCEPTED", confidence: 0.9, matchingEvidence: [], counterEvidence: [], unresolvedQuestions: [], evidenceRefs: [`evidence-${id}`], sourceObservationIds: [`observation-${id}`], extractorId: "fixture", revision, createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" };
}

const assertions = [assertion("biz-1", "BIZ", "order.fulfillment"), assertion("sys-1", "SYS", "order.fulfillment.service"), assertion("tech-1", "TECH", "order.fulfillment.database")];
const relationships: KnowledgeProjectionRelationship[] = [
  { id: "rel-1", sourceAssertionId: "biz-1", targetAssertionId: "sys-1", code: "IMPLEMENTS", confidence: 0.8, architectureScope: scope },
  { id: "rel-2", sourceAssertionId: "sys-1", targetAssertionId: "tech-1", code: "USES", confidence: 0.9, architectureScope: scope }
];

describe("deterministic 3A knowledge projections", () => {
  it("projects accepted facts into BIZ, SYS, and TECH without creating facts", () => {
    const result = deriveKnowledgeProjection({ baseline, assertions, relationships });
    expect(result.layers.BIZ.nodes.map((node) => node.id)).toEqual(["biz-1"]);
    expect(result.layers.SYS.nodes.map((node) => node.id)).toEqual(["sys-1"]);
    expect(result.layers.TECH.nodes.map((node) => node.id)).toEqual(["tech-1"]);
    expect(result.alignment.items).toHaveLength(2);
    expect(result.contextPack.markdown).toContain("Baseline: baseline-1");
    expect(result.contextPack.markdown).toContain("BIZ");
  });

  it("is reproducible and identifies changes against the pinned baseline", () => {
    const first = deriveKnowledgeProjection({ baseline, assertions, relationships, currentAssertions: [assertions[0]!, assertions[1]!, assertion("tech-2", "TECH", "order.fulfillment.database", 2)] });
    const second = deriveKnowledgeProjection({ baseline, assertions, relationships, currentAssertions: [assertions[0]!, assertions[1]!, assertion("tech-2", "TECH", "order.fulfillment.database", 2)] });
    expect(second.digest).toBe(first.digest);
    expect(first.drift.items.find((item) => item.semanticIdentity === "order.fulfillment.database")).toMatchObject({ kind: "CHANGED", baselineAssertionId: "tech-1", currentAssertionId: "tech-2" });
  });

  it("fails closed for a sibling-scope relationship or missing baseline source", () => {
    expect(() => deriveKnowledgeProjection({ baseline, assertions, relationships: [{ ...relationships[0]!, architectureScope: { applicationServiceId: "com.example.policy", scopePath: "org/product/policy" } }] })).toThrow("SCOPE_MISMATCH");
    expect(() => deriveKnowledgeProjection({ baseline, assertions: assertions.slice(0, 2), relationships })).toThrow("PROJECTION_SOURCE_MISSING");
  });
});
