import { describe, expect, it, vi } from "vitest";
import { queryArchitectureSemantics, type SemanticProjectionIdentity, type SemanticQueryResult } from "./semantic-query-service.js";

const scope = { enterpriseId: "huawei", applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner", baselineId: "b1", generationId: "g1", manifestId: "m1" };
const identity: SemanticProjectionIdentity = { ...scope, profileId: "p1", profileVersion: "1", projectionSchemaVersion: "nebula.3a.v1", semanticSchemaVersion: "nebula.3a.semantic.v1", sourceProjectionManifestId: "pm1", sourceCoverageManifestId: "cm1", knowledgeGenerationId: "kg1", coverageGenerationId: "cg1", relationshipVersion: "rv1", catalogVersion: "cv1", catalogDigest: "cd1" };
const input = { assetType: "api", assetId: "orders", budget: { maxAssertions: 10, maxTargets: 10, maxTraceSteps: 10, timeoutMs: 1000, maxPayloadBytes: 10000 } };
const result: SemanticQueryResult = { status: "COMPLETE", source: "NEBULA", projection: identity, mappingMode: "DIRECT", assertions: [], targets: { BIZ: [], SYS: [], TECH: [] }, tracePath: [], partial: false, truncationReasons: [] };

describe("semantic query service", () => {
  it("falls back only for graph transport unavailability", async () => {
    const fallback = { ...result, source: "POSTGRESQL_FALLBACK" as const };
    const output = await queryArchitectureSemantics(scope, input, { active: { resolveActive: vi.fn().mockResolvedValue(identity) }, nebula: { query: vi.fn().mockRejectedValue(new Error("NEBULA_QUERY_FAILED")) }, postgres: { query: vi.fn().mockResolvedValue(fallback) } });
    expect(output.source).toBe("POSTGRESQL_FALLBACK");
  });

  it("does not hide a mixed-manifest result", async () => {
    const foreign = { ...result, projection: { ...identity, generationId: "foreign" } };
    await expect(queryArchitectureSemantics(scope, input, { active: { resolveActive: vi.fn().mockResolvedValue(identity) }, nebula: { query: vi.fn().mockResolvedValue(foreign) }, postgres: { query: vi.fn() } })).rejects.toThrow("SEMANTIC_RESULT_IDENTITY_MISMATCH");
  });
});
