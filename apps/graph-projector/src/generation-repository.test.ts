import { describe, expect, it, vi } from "vitest";
import { PrismaNebulaGenerationRepository, type BuildingManifestInput, type GenerationScope } from "./generation-repository.js";

const scope: GenerationScope = {
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const input = (suffix: string): BuildingManifestInput => ({
  id: `manifest-${suffix}`,
  generationId: `generation-${suffix}`,
  generationNumber: BigInt(suffix === "one" ? 1 : 2),
  baselineId: "baseline-v1",
  profileId: "profile-default",
  profileVersion: "1",
  projectionSchemaVersion: "nebula.3a.v1",
  contentDigest: `digest-${suffix}`
});

describe("PrismaNebulaGenerationRepository", () => {
  it("creates only one BUILDING generation per Scope", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaNebulaGenerationRepository(prisma as never);
    await repository.createBuilding(scope, input("one"));
    await expect(repository.createBuilding(scope, input("two"))).rejects.toThrow("GENERATION_BUILD_CONFLICT");
  });

  it("does not publish before validation", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaNebulaGenerationRepository(prisma as never);
    await repository.createBuilding(scope, input("one"));
    await expect(repository.publish(scope, "manifest-one")).rejects.toThrow("GENERATION_MANIFEST_STATE_INVALID");
    await expect(repository.getHead(scope)).resolves.toMatchObject({ activeManifestId: null, buildingManifestId: "manifest-one" });
  });

  it("publishes BUILDING and moves ACTIVE to PREVIOUS", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaNebulaGenerationRepository(prisma as never);
    await repository.createBuilding(scope, input("one"));
    await repository.markValidated(scope, "manifest-one");
    await expect(repository.publish(scope, "manifest-one")).resolves.toMatchObject({ activeManifestId: "manifest-one", previousManifestId: null });
    await repository.createBuilding(scope, input("two"));
    await repository.markValidated(scope, "manifest-two");
    await expect(repository.publish(scope, "manifest-two")).resolves.toMatchObject({ activeManifestId: "manifest-two", previousManifestId: "manifest-one" });
  });

  it("rejects a different Scope", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaNebulaGenerationRepository(prisma as never);
    await repository.createBuilding(scope, input("one"));
    await expect(repository.publish({ ...scope, applicationServiceId: "com.huawei.celon.other" }, "manifest-one")).rejects.toThrow("GENERATION_HEAD_NOT_FOUND");
  });

  it("rolls back ACTIVE and PREVIOUS atomically", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaNebulaGenerationRepository(prisma as never);
    await repository.createBuilding(scope, input("one"));
    await repository.markValidated(scope, "manifest-one");
    await repository.publish(scope, "manifest-one");
    await repository.createBuilding(scope, input("two"));
    await repository.markValidated(scope, "manifest-two");
    await repository.publish(scope, "manifest-two");
    await expect(repository.rollback(scope)).resolves.toMatchObject({ activeManifestId: "manifest-one", previousManifestId: "manifest-two" });
  });

  it("protects ACTIVE from retirement", async () => {
    const prisma = fakePrisma();
    const repository = new PrismaNebulaGenerationRepository(prisma as never);
    await repository.createBuilding(scope, input("one"));
    await repository.markValidated(scope, "manifest-one");
    await repository.publish(scope, "manifest-one");
    await expect(repository.retirePrevious(scope, "manifest-one")).rejects.toThrow("ACTIVE_GENERATION_PROTECTED");
  });
});

function fakePrisma() {
  const heads = new Map<string, any>();
  const manifests = new Map<string, any>();
  const key = (value: GenerationScope) => `${value.enterpriseId}:${value.applicationServiceId}:${value.scopePath}`;
  const sameScope = (row: any, where: any) => row.enterpriseId === where.enterpriseId && row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath;
  const prisma: any = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $transaction: (callback: (client: any) => Promise<unknown>) => callback(prisma),
    nebulaProjectionHead: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const current = heads.get(key(where.enterpriseId_applicationServiceId_scopePath));
        if (current) return { ...current };
        const created = { ...create, buildingManifestId: null, activeManifestId: null, previousManifestId: null, headVersion: 0n, previousRetainUntil: null };
        heads.set(key(create), created);
        return { ...created };
      }),
      findUnique: vi.fn(async ({ where }: any) => heads.get(key(where.enterpriseId_applicationServiceId_scopePath)) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = [...heads.values()].find((candidate) => sameScope(candidate, where) && matches(candidate, where));
        if (!row) return { count: 0 };
        apply(row, data);
        return { count: 1 };
      })
    },
    nebulaProjectionManifest: {
      create: vi.fn(async ({ data }: any) => {
        manifests.set(`${key(data)}:${data.id}`, { ...data, validatedAt: null, retiredAt: null });
        return manifests.get(`${key(data)}:${data.id}`);
      }),
      findFirst: vi.fn(async ({ where }: any) => [...manifests.values()].find((candidate) => sameScope(candidate, where) && matches(candidate, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = [...manifests.values()].find((candidate) => sameScope(candidate, where) && matches(candidate, where));
        if (!row) return { count: 0 };
        apply(row, data);
        return { count: 1 };
      })
    }
  };
  return prisma;
}

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([field, expected]) => row[field] === expected);
}

function apply(row: any, data: any): void {
  for (const [field, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && "increment" in value) row[field] += (value as { increment: bigint }).increment;
    else row[field] = value;
  }
}
