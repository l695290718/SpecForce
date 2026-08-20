import { describe, expect, it, vi } from "vitest";
import { buildSemanticGeneration, type SemanticBatch, type SemanticProjectionIdentity, type SemanticSourceReader } from "./semantic-projector.js";
import type { SemanticSourceBinding } from "./semantic-source-repository.js";

const scope = { enterpriseId: "huawei", applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner", baselineId: "b1", generationId: "g1", manifestId: "m1" };
const binding: SemanticSourceBinding = { sourceProjectionManifestId: "pm1", sourceCoverageManifestId: "cm1", knowledgeGenerationId: "kg1", coverageGenerationId: "cg1", relationshipVersion: "rv1", catalogVersion: "cv1", catalogDigest: "cd1", semanticSchemaVersion: "nebula.3a.semantic.v1" };
const identity: SemanticProjectionIdentity = { ...scope, profileId: "p1", profileVersion: "1", projectionSchemaVersion: "nebula.3a.v1", ...binding };
const batch: SemanticBatch = { identity, vertices: [{ family: "DesignAsset", id: "asset:api:orders", contentDigest: "a" }], edges: [], counts: { vertices: 1 }, bucketDigests: {}, contentDigest: "digest", semanticProbes: {} };

function source(): SemanticSourceReader {
  const page = async () => ({ items: [], nextCursor: null, source: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, baselineId: scope.baselineId, generationId: scope.generationId, manifestId: scope.manifestId } });
  return { readSourceBinding: vi.fn().mockResolvedValue(binding), readAssets: page, readAssertions: page, readUnits: page, readMembers: page, readUnitMappings: page, readAssetCoverage: page, readAssetRelationships: page, readAssertionRelationships: page, readArchitectureRelationships: page };
}

describe("semantic generation builder", () => {
  it("does not publish when the gateway receipt diverges", async () => {
    const lifecycle = { markValidated: vi.fn(), publish: vi.fn() };
    await expect(buildSemanticGeneration(scope, { source: source(), materializer: { createIdentity: () => identity, materialize: () => batch }, gateway: { project: vi.fn().mockResolvedValue({ projection: { baselineId: "b1", manifestId: "foreign", generationId: "g1", schemaVersion: "nebula.3a.v1" }, projectedVertexCount: 1, projectedEdgeCount: 0 }) }, lifecycle })).rejects.toThrow("SEMANTIC_GATEWAY_RECEIPT_INVALID");
    expect(lifecycle.markValidated).not.toHaveBeenCalled();
    expect(lifecycle.publish).not.toHaveBeenCalled();
  });

  it("publishes only after a matching receipt and parity check", async () => {
    const lifecycle = { markValidated: vi.fn(), publish: vi.fn() };
    const output = await buildSemanticGeneration(scope, { source: source(), materializer: { createIdentity: () => identity, materialize: () => batch }, gateway: { project: vi.fn().mockResolvedValue({ projection: { baselineId: "b1", manifestId: "m1", generationId: "g1", schemaVersion: "nebula.3a.v1" }, projectedVertexCount: 1, projectedEdgeCount: 0 }) }, lifecycle, options: { verify: () => true } });
    expect(output.partitionsCompleted).toBe(1);
    expect(lifecycle.markValidated).toHaveBeenCalledWith(scope, "m1");
    expect(lifecycle.publish).toHaveBeenCalledWith(scope, "m1");
  });
});
