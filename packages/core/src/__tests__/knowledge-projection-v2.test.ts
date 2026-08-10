import { describe, expect, it } from "vitest";
import { comparePublishedBaselines, isOfficialBaseline, projectionBuildKey, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionBuildKeyInput } from "../knowledge/projection-v2";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/product/orders/service" };

function buildKeyInput(overrides: Partial<ProjectionBuildKeyInput> = {}): ProjectionBuildKeyInput {
  return {
    architectureScope: scope,
    baselineId: "baseline-1",
    profileId: "generic-system",
    profileVersion: "1.0.0",
    projectionSchemaVersion: "3a.v2",
    sourceRevisionIds: ["tech-1", "biz-1"],
    relationshipVersion: "relationship-1",
    query: { layer: "BIZ", filters: { z: true, a: 1 } },
    ...overrides
  };
}

function node(overrides: Partial<KnowledgeProjectionNode> = {}): KnowledgeProjectionNode {
  return { ...scope, generationId: "generation-1", baselineId: "baseline-1", assertionId: "assertion-1", semanticIdentity: "order.fulfillment", layer: "BIZ", sortKey: "BIZ|order.fulfillment", contentDigest: "node-digest-1", ...overrides };
}

function edge(overrides: Partial<KnowledgeProjectionEdge> = {}): KnowledgeProjectionEdge {
  return { ...scope, generationId: "generation-1", baselineId: "baseline-1", relationshipIdentity: "order.fulfillment->order.service:IMPLEMENTS", sourceAssertionId: "assertion-1", targetAssertionId: "assertion-2", sourceSemanticIdentity: "order.fulfillment", targetSemanticIdentity: "order.service", relationCode: "IMPLEMENTS", confidence: 0.9, relationshipVersion: "relationship-1", contentDigest: "edge-digest-1", ...overrides };
}

function manifest(id: string, baselineId: string): any {
  return { ...scope, id, baselineId, generationId: `generation-${id}`, profileId: "generic-system", profileVersion: "1.0.0", projectionSchemaVersion: "3a.v2", sourceRevisionIds: ["assertion-1"], relationshipVersion: "relationship-1", query: {}, inputDigest: "input-digest", contentDigest: `manifest-${id}`, nodeCount: 1, edgeCount: 1, publishedAt: "2026-08-10T00:00:00.000Z" };
}

describe("3A projection v2", () => {
  it("accepts active and historical official publications only", () => {
    expect(isOfficialBaseline({ status: "PUBLISHED", publishedAt: "2026-08-10T00:00:00.000Z" })).toBe(true);
    expect(isOfficialBaseline({ status: "SUPERSEDED", publishedAt: "2026-08-09T00:00:00.000Z" })).toBe(true);
    expect(isOfficialBaseline({ status: "BLOCKED", publishedAt: "2026-08-09T00:00:00.000Z" })).toBe(false);
    expect(isOfficialBaseline({ status: "PUBLISHED" })).toBe(false);
  });

  it("detects a relationship-only change", () => {
    const drift = comparePublishedBaselines({
      baseBaseline: { id: "baseline-1", architectureScope: scope, status: "SUPERSEDED", publishedAt: "2026-08-09T00:00:00.000Z" },
      targetBaseline: { id: "baseline-2", architectureScope: scope, status: "PUBLISHED", publishedAt: "2026-08-10T00:00:00.000Z" },
      baseManifest: manifest("manifest-1", "baseline-1"),
      targetManifest: manifest("manifest-2", "baseline-2"),
      baseNodes: [node()],
      targetNodes: [node({ baselineId: "baseline-2", generationId: "generation-manifest-2" })],
      baseEdges: [edge()],
      targetEdges: [edge({ baselineId: "baseline-2", generationId: "generation-manifest-2", confidence: 0.7, contentDigest: "edge-digest-2" })]
    });
    expect(drift.items).toContainEqual(expect.objectContaining({ entityKind: "EDGE", change: "CHANGED" }));
    expect(drift.baseBaselineId).toBe("baseline-1");
    expect(drift.targetBaselineId).toBe("baseline-2");
  });

  it("excludes timestamps and attempts from the canonical build key", () => {
    expect(projectionBuildKey(buildKeyInput({ attempt: 1, createdAt: "2026-08-10T00:00:00.000Z" }))).toBe(projectionBuildKey(buildKeyInput({ attempt: 9, createdAt: "2026-08-10T01:00:00.000Z" })));
  });
});
