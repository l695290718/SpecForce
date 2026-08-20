import { describe, expect, it, vi } from "vitest";
import { PrismaSemanticProjectionSource, type SemanticGenerationScope } from "./semantic-source-repository.js";

const scope: SemanticGenerationScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  baselineId: "knowledge-baseline:designer:3a:v6",
  generationId: "knowledge-generation:designer:v6",
  manifestId: "nebula-manifest:v6",
  enterpriseId: "enterprise-1"
};

const source = {
  sourceProjectionManifestId: "projection-manifest:designer:v6",
  sourceCoverageManifestId: "coverage-generation:designer:3a:v13",
  knowledgeGenerationId: "knowledge-generation:designer:v6",
  coverageGenerationId: "coverage-generation:designer:3a:v13",
  relationshipVersion: "graph-version:designer:42",
  catalogVersion: "307",
  catalogDigest: "sha256:catalog-307",
  semanticSchemaVersion: "nebula.3a.semantic.v1" as const
};

describe("PrismaSemanticProjectionSource", () => {
  it("reads and validates source manifests within the exact Scope", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaSemanticProjectionSource(prisma as never);
    await expect(repository.readSourceBinding(scope)).resolves.toEqual(source);
    expect(prisma.projectionManifest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        id: source.sourceProjectionManifestId
      })
    }));
  });

  it("uses keyset pagination and repeats all Scope and generation predicates", async () => {
    const prisma = fakePrisma();
    prisma.architectureUnitProjection.findMany.mockResolvedValue([
      { dbId: "unit-db-1", applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, generationId: scope.generationId, baselineId: scope.baselineId, projectionManifestId: source.sourceProjectionManifestId, unitIdentity: "unit:sys:orders", layer: "SYS", kind: "SERVICE", canonicalName: "Orders", localizedName: null, aliases: [], memberCount: 1, criticality: 0.8, completeness: 1, evidenceCount: 1, unclassifiedMemberCount: 0, contentDigest: "digest" },
      { dbId: "unit-db-2", applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, generationId: scope.generationId, baselineId: scope.baselineId, projectionManifestId: source.sourceProjectionManifestId, unitIdentity: "unit:sys:payments", layer: "SYS", kind: "SERVICE", canonicalName: "Payments", localizedName: null, aliases: [], memberCount: 1, criticality: 0.8, completeness: 1, evidenceCount: 1, unclassifiedMemberCount: 0, contentDigest: "digest" }
    ]);
    const repository = new PrismaSemanticProjectionSource(prisma as never, async () => source);
    const page = await repository.readUnits(scope, "unit-db-0", 1);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("unit-db-1");
    expect(prisma.architectureUnitProjection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        generationId: scope.generationId,
        baselineId: scope.baselineId,
        projectionManifestId: source.sourceProjectionManifestId,
        dbId: { gt: "unit-db-0" }
      }),
      orderBy: { dbId: "asc" },
      take: 2
    }));
  });

  it("fails before child reads when the source Manifest is foreign", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaSemanticProjectionSource(prisma as never, async () => ({ ...source, sourceProjectionManifestId: scope.manifestId }));
    await expect(repository.readUnits(scope, null, 10)).rejects.toThrow("SEMANTIC_SOURCE_MANIFEST_MISMATCH");
    expect(prisma.architectureUnitProjection.findMany).not.toHaveBeenCalled();
  });
});

function fakePrisma() {
  return {
    projectionManifest: {
      findFirst: vi.fn().mockResolvedValue({ id: source.sourceProjectionManifestId, baselineId: scope.baselineId, generationId: source.knowledgeGenerationId, relationshipVersion: source.relationshipVersion, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath })
    },
    nebulaProjectionManifest: {
      findFirst: vi.fn().mockResolvedValue({ id: scope.manifestId, sourceProjectionManifestId: source.sourceProjectionManifestId, sourceCoverageManifestId: source.sourceCoverageManifestId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath })
    },
    architectureCoverageManifest: {
      findFirst: vi.fn().mockResolvedValue({ id: source.sourceCoverageManifestId, baselineId: scope.baselineId, generationId: source.coverageGenerationId, catalogVersion: 307n, catalogDigest: source.catalogDigest, relationshipVersion: source.relationshipVersion, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath })
    },
    architectureUnitProjection: { findMany: vi.fn().mockResolvedValue([]) },
    architectureUnitMemberProjection: { findMany: vi.fn().mockResolvedValue([]) },
    architectureUnitMappingProjection: { findMany: vi.fn().mockResolvedValue([]) },
    architectureAssetCoverageProjection: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeProjectionNode: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeProjectionEdge: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeAssertion: { findMany: vi.fn().mockResolvedValue([]) },
    assetNode: { findMany: vi.fn().mockResolvedValue([]) },
    relationshipCurrent: { findMany: vi.fn().mockResolvedValue([]) }
  };
}
