import { describe, expect, it, vi } from "vitest";
import { PrismaThreeAQueryRepository } from "./prisma-repository";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const manifest = { ...scope, id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: ["a-1"], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 1, edgeCount: 0, publishedAt: "2026-08-10T00:00:00.000Z" };

describe("PrismaThreeAQueryRepository", () => {
  it("queries only exact-Scope downstream adjacency", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaThreeAQueryRepository({ knowledgeProjectionEdge: { findMany } } as never);

    await repository.listAdjacentEdges(scope, manifest, { frontierAssertionIds: ["sys-1"], direction: "downstream", relationTypes: ["DEPENDS_ON"], limit: 25 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...scope, generationId: manifest.generationId, sourceAssertionId: { in: ["sys-1"] }, relationCode: { in: ["DEPENDS_ON"] } },
      orderBy: [{ sourceAssertionId: "asc" }, { targetAssertionId: "asc" }, { relationshipIdentity: "asc" }],
      take: 26
    }));
  });

  it("does not send projectionManifestId to the generation-bound edge table", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaThreeAQueryRepository({ knowledgeProjectionEdge: { findMany } } as never);
    const identity = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: "manifest-1" };

    await repository.listSameLayerDependencies(identity, ["assertion-1", "assertion-2"], 25);

    const call = findMany.mock.calls[0];
    expect(call).toBeDefined();
    const where = call![0].where;
    expect(where).toEqual(expect.objectContaining({
      ...scope,
      generationId: manifest.generationId,
      baselineId: manifest.baselineId,
      OR: [
        { sourceAssertionId: { in: ["assertion-1", "assertion-2"] }, targetAssertionId: { in: ["assertion-1", "assertion-2"] } }
      ]
    }));
    expect(where).not.toHaveProperty("projectionManifestId");
  });

  it("reads unit members in one deterministic exact-identity batch", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaThreeAQueryRepository({ architectureUnitMemberProjection: { findMany } } as never);
    const identity = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: "manifest-1" };

    await repository.listArchitectureUnitMembersByUnits(identity, ["unit:sys:b", "unit:biz:a", "unit:sys:b"], 500);

    expect(findMany).toHaveBeenCalledWith({
      where: { ...identity, unitIdentity: { in: ["unit:biz:a", "unit:sys:b"] } },
      orderBy: [{ unitIdentity: "asc" }, { semanticIdentity: "asc" }, { assertionId: "asc" }],
      take: 501
    });
  });
});
