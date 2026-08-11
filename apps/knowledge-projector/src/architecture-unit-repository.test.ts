import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { architectureUnitScopePredicate, PrismaProjectionBuildRepository, type ArchitectureUnitRepositoryIdentity } from "./repository.js";
import type { ArchitectureUnitMaterialization } from "./architecture-unit-materializer.js";

const identity: ArchitectureUnitRepositoryIdentity = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  generationId: "generation-1",
  baselineId: "baseline-1",
  projectionManifestId: "projection-manifest:generation-1"
};

const unit = {
  applicationServiceId: identity.applicationServiceId,
  scopePath: identity.scopePath,
  generationId: identity.generationId,
  baselineId: identity.baselineId,
  projectionManifestId: identity.projectionManifestId,
  unitIdentity: "unit:biz:policy-evaluation",
  layer: "BIZ" as const,
  kind: "CAPABILITY" as const,
  canonicalName: "Policy Evaluation",
  localizedName: "策略评估",
  aliases: ["policy"],
  memberCount: 1,
  criticality: 0.8,
  completeness: 1,
  evidenceCount: 1,
  unclassifiedMemberCount: 0,
  contentDigest: "unit-digest"
};

const materialization: ArchitectureUnitMaterialization = {
  architectureScope: { applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath },
  generationId: identity.generationId,
  baselineId: identity.baselineId,
  projectionManifestId: identity.projectionManifestId,
  units: [unit],
  members: [{ ...identity, unitIdentity: unit.unitIdentity, assertionId: "assertion-policy", assetType: "businessRule", semanticIdentity: "policy.evaluation", contentDigest: "member-digest" }],
  mappings: [{ ...identity, mappingIdentity: "mapping:policy-service", sourceUnitIdentity: unit.unitIdentity, targetUnitIdentity: "unit:sys:policy-service", sourceLayer: "BIZ", targetLayer: "SYS", mappingFamily: "REALIZES", relationshipCount: 1, evidenceCount: 1, confidence: 0.9, contentDigest: "mapping-digest" }],
  contentDigest: "materialization-digest"
};

const job = {
  ...identity,
  id: "build-1",
  buildKey: "build-key",
  profileId: "generic-system",
  profileVersion: "1",
  projectionSchemaVersion: "3a.v2" as const,
  status: "BUILDING" as const,
  attempt: 1,
  checkpoint: {},
  nodeCount: 0,
  edgeCount: 0
};

describe("architecture unit repository identity", () => {
  it("uses the exact Scope and generation identity for both reads and writes", () => {
    const predicate = architectureUnitScopePredicate(identity);

    expect(predicate).toEqual(identity);
    expect(architectureUnitScopePredicate({ ...identity, scopePath: "other/scope" })).not.toEqual(predicate);
    expect(architectureUnitScopePredicate({ ...identity, generationId: "generation-2" })).not.toEqual(predicate);
    expect(Object.keys(predicate)).toEqual([
      "applicationServiceId",
      "scopePath",
      "generationId",
      "baselineId",
      "projectionManifestId"
    ]);
  });

  it("writes only the leased generation and all three derived tables", async () => {
    const transaction = {
      projectionBuildJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      architectureUnitProjection: { deleteMany: vi.fn(), createMany: vi.fn() },
      architectureUnitMemberProjection: { deleteMany: vi.fn(), createMany: vi.fn() },
      architectureUnitMappingProjection: { deleteMany: vi.fn(), createMany: vi.fn() }
    };
    const prisma = { $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new PrismaProjectionBuildRepository(prisma);

    await expect(repository.writeArchitectureUnitBatch(job, "projector-1", materialization)).resolves.toBe(true);
    const predicate = architectureUnitScopePredicate(identity);
    expect(transaction.architectureUnitProjection.deleteMany).toHaveBeenCalledWith({ where: predicate });
    expect(transaction.architectureUnitMemberProjection.deleteMany).toHaveBeenCalledWith({ where: predicate });
    expect(transaction.architectureUnitMappingProjection.deleteMany).toHaveBeenCalledWith({ where: predicate });
    expect(transaction.architectureUnitProjection.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining(predicate)] });
    expect(transaction.architectureUnitMemberProjection.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining(predicate)] });
    expect(transaction.architectureUnitMappingProjection.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining(predicate)] });
    expect(transaction.projectionBuildJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath, id: job.id, status: "BUILDING", leaseOwner: "projector-1" }) }));
  });

  it("applies exact identity and bounded filters to reads", async () => {
    const unitRow = { ...unit, aliases: ["policy"] };
    const mappingFindMany = vi.fn().mockResolvedValue([{ sourceUnitIdentity: unit.unitIdentity, targetUnitIdentity: "unit:sys:policy-service" }]);
    const unitFindMany = vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => where.layer === "BIZ" ? [unitRow] : []);
    const unitCount = vi.fn().mockResolvedValue(1);
    const prisma = {
      architectureUnitMappingProjection: { findMany: mappingFindMany },
      architectureUnitProjection: { findMany: unitFindMany, count: unitCount },
      architectureUnitMemberProjection: { findMany: vi.fn() }
    } as unknown as PrismaClient;
    const repository = new PrismaProjectionBuildRepository(prisma);

    await repository.listArchitectureUnits(identity, { layers: ["BIZ"], kinds: ["CAPABILITY"], mappingFamilies: ["REALIZES"], query: "Policy", minCriticality: 0.5, minCompleteness: 0.9, includeUnclassified: false }, { maxUnitsPerLayer: 2, maxMappings: 4, timeoutMs: 1000, maxPayloadBytes: 10_000 });
    expect(mappingFindMany).toHaveBeenCalledWith({ where: { ...identity, mappingFamily: { in: ["REALIZES"] } }, select: { sourceUnitIdentity: true, targetUnitIdentity: true } });
    const countWhere = unitCount.mock.calls[0]![0].where;
    expect(countWhere).toMatchObject({ applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, kind: { in: ["CAPABILITY"] }, unitIdentity: { in: ["unit:biz:policy-evaluation", "unit:sys:policy-service"] }, unclassifiedMemberCount: 0 });
    expect(unitFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ layer: "BIZ" }), take: 3 }));
  });

  it("restricts member and mapping reads to the requested generation and units", async () => {
    const memberFindMany = vi.fn().mockResolvedValue([]);
    const mappingFindMany = vi.fn().mockResolvedValue([]);
    const prisma = { architectureUnitMemberProjection: { findMany: memberFindMany }, architectureUnitMappingProjection: { findMany: mappingFindMany } } as unknown as PrismaClient;
    const repository = new PrismaProjectionBuildRepository(prisma);

    await repository.listArchitectureUnitMembers(identity, unit.unitIdentity, 10);
    await repository.listArchitectureUnitMappings(identity, [unit.unitIdentity, "unit:sys:policy-service"], 10);
    expect(memberFindMany).toHaveBeenCalledWith({ where: { ...identity, unitIdentity: unit.unitIdentity }, orderBy: [{ semanticIdentity: "asc" }, { assertionId: "asc" }], take: 10 });
    expect(mappingFindMany).toHaveBeenCalledWith({ where: { ...identity, sourceUnitIdentity: { in: [unit.unitIdentity, "unit:sys:policy-service"] }, targetUnitIdentity: { in: [unit.unitIdentity, "unit:sys:policy-service"] } }, orderBy: [{ sourceUnitIdentity: "asc" }, { targetUnitIdentity: "asc" }, { mappingFamily: "asc" }, { mappingIdentity: "asc" }], take: 10 });
  });
});
