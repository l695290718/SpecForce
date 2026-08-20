import { describe, expect, it, vi } from "vitest";
import { buildSemanticGeneration, type SemanticBatch, type SemanticProjectionIdentity, type SemanticSourceReader } from "./semantic-projector.js";
import { queryArchitectureSemantics } from "./semantic-query-service.js";
import type { SemanticSourceBinding } from "./semantic-source-repository.js";

const scope = { enterpriseId: "huawei", applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner", baselineId: "b1", generationId: "g1", manifestId: "m1" };
const binding: SemanticSourceBinding = { sourceProjectionManifestId: "pm1", sourceCoverageManifestId: "cm1", knowledgeGenerationId: "kg1", coverageGenerationId: "cg1", relationshipVersion: "rv1", catalogVersion: "cv1", catalogDigest: "cd1", semanticSchemaVersion: "nebula.3a.semantic.v1" };
const identity: SemanticProjectionIdentity = { ...scope, profileId: "p1", profileVersion: "1", projectionSchemaVersion: "nebula.3a.v1", ...binding };

function source(): SemanticSourceReader {
  const page = async () => ({ items: [], nextCursor: null, source: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, baselineId: scope.baselineId, generationId: scope.generationId, manifestId: scope.manifestId } });
  return { readSourceBinding: vi.fn().mockResolvedValue(binding), readAssets: page, readAssertions: page, readUnits: page, readMembers: page, readUnitMappings: page, readAssetCoverage: page, readAssetRelationships: page, readAssertionRelationships: page, readArchitectureRelationships: page };
}

function batch(): SemanticBatch {
  return {
    identity,
    vertices: [{ family: "DesignAsset", id: "asset:api:orders", logicalId: "orders", assetType: "api", assetId: "orders", mappingMode: "BLOCKED", reason: "TRACE_TARGET_NOT_FOUND", contentDigest: "asset" }],
    edges: [], counts: { vertices: 1, edges: 0 }, bucketDigests: {}, contentDigest: "batch", semanticProbes: { "api:orders:mapping": "BLOCKED" }
  };
}

describe("semantic projection integration", () => {
  it("keeps the same identity through build, receipt and PostgreSQL fallback", async () => {
    const lifecycle = { markValidated: vi.fn(), publish: vi.fn() };
    const gateway = { project: vi.fn().mockResolvedValue({ projection: { baselineId: "b1", manifestId: "m1", generationId: "g1", schemaVersion: "nebula.3a.v1" }, projectedVertexCount: 1, projectedEdgeCount: 0 }) };
    const built = await buildSemanticGeneration(scope, { source: source(), materializer: { createIdentity: () => identity, materialize: () => batch() }, gateway, lifecycle });
    expect(built.identity).toEqual(identity);
    expect(lifecycle.publish).toHaveBeenCalledWith(scope, "m1");

    const fallback = { status: "COMPLETE" as const, source: "POSTGRESQL_FALLBACK" as const, projection: identity, mappingMode: "BLOCKED" as const, assertions: [], targets: { BIZ: [], SYS: [], TECH: [] }, tracePath: [], partial: false, truncationReasons: ["GRAPH_UNAVAILABLE"] };
    const result = await queryArchitectureSemantics(scope, { assetType: "api", assetId: "orders", budget: { maxAssertions: 10, maxTargets: 10, maxTraceSteps: 10, timeoutMs: 1000, maxPayloadBytes: 10000 } }, { active: { resolveActive: vi.fn().mockResolvedValue(identity) }, nebula: { query: vi.fn().mockRejectedValue(new Error("NEBULA_QUERY_FAILED")) }, postgres: { query: vi.fn().mockResolvedValue(fallback) } });
    expect(result.source).toBe("POSTGRESQL_FALLBACK");
    expect(result.projection.manifestId).toBe("m1");
  });
});
