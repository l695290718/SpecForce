import { describe, expect, it } from "vitest";
import { querySemanticProjection, normalizeArchitectureSemanticQuery, type ArchitectureSemanticQuery } from "./semantic-query";
import { semanticProjectionIdentity, type SemanticSourceBinding } from "../graph/semantic-identity";
import type { SemanticProjectionBatch } from "../graph/semantic-projection";

const binding: SemanticSourceBinding = { sourceProjectionManifestId: "pm1", sourceCoverageManifestId: "cm1", knowledgeGenerationId: "kg1", coverageGenerationId: "cg1", relationshipVersion: "rv1", catalogVersion: "cv1", catalogDigest: "cd1", semanticSchemaVersion: "nebula.3a.semantic.v1" };
const identity = semanticProjectionIdentity({ applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner" }, { id: "m1", generationId: "g1", baselineId: "b1", profileId: "p1", profileVersion: "1", projectionSchemaVersion: "nebula.3a.v1" }, binding);
const budget = { maxAssertions: 10, maxTargets: 10, maxTraceSteps: 10, timeoutMs: 1000, maxPayloadBytes: 100_000 };

function batch(): SemanticProjectionBatch {
  return {
    identity,
    vertices: [
      { family: "DesignAsset", id: "asset:api:orders", logicalId: "orders", assetType: "api", assetId: "orders", mappingMode: "DIRECT", contentDigest: "a" },
      { family: "KnowledgeAssertion", id: "assertion:a1", assertionId: "a1", semanticIdentity: "orders", layer: "SYS", factType: "REALIZES", confidence: 0.9, contentDigest: "b" },
      { family: "ArchitectureUnit", id: "unit:sys:orders", unitIdentity: "unit:sys:orders", layer: "SYS", kind: "SERVICE", canonicalName: "Orders", contentDigest: "c" },
    ],
    edges: [
      { family: "ASSERTION_SUBJECT", id: "e1", sourceId: "assertion:a1", targetId: "asset:api:orders", code: "SUBJECT_OF", confidence: 1, projectionOrdinal: 1n, contentDigest: "e1" },
      { family: "REALIZED_BY", id: "e2", sourceId: "assertion:a1", targetId: "unit:sys:orders", code: "REALIZED_BY", confidence: 1, projectionOrdinal: 1n, contentDigest: "e2" },
    ],
    counts: {}, bucketDigests: {}, contentDigest: "digest", semanticProbes: {},
  };
}

describe("semantic architecture query", () => {
  it("returns all three-layer buckets with the active identity", () => {
    const result = querySemanticProjection(batch(), { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner", assetType: "api", assetId: "orders", budget });
    expect(result.source).toBe("NEBULA");
    expect(result.projection.manifestId).toBe("m1");
    expect(result.targets.SYS).toEqual([{ unitIdentity: "unit:sys:orders", layer: "SYS", canonicalName: "Orders" }]);
  });

  it("fails closed for a foreign scope and rejects invalid budgets", () => {
    expect(() => querySemanticProjection(batch(), { applicationServiceId: "other", scopePath: "scope/desiner", assetType: "api", assetId: "orders", budget })).toThrow("SEMANTIC_QUERY_SCOPE_MISMATCH");
    expect(() => normalizeArchitectureSemanticQuery({ applicationServiceId: "x", scopePath: "s", assetType: "api", assetId: "a", budget: { ...budget, maxTargets: 0 } })).toThrow("SEMANTIC_QUERY_MAXTARGETS_INVALID");
  });
});
