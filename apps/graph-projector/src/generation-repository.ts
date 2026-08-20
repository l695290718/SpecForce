import { Prisma, PrismaClient } from "@prisma/client";

export type NebulaGenerationStatus = "BUILDING" | "VALIDATED" | "ACTIVE" | "PREVIOUS" | "RETIRED" | "PURGED";

export interface GenerationScope {
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
}

export interface BuildingManifestInput {
  id: string;
  generationId: string;
  generationNumber: bigint;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
  sourceWatermarks?: Prisma.InputJsonValue;
  expectedCounts?: Prisma.InputJsonValue;
  bucketDigests?: Prisma.InputJsonValue;
  contentDigest: string;
}

export interface NebulaGenerationHead {
  buildingManifestId: string | null;
  activeManifestId: string | null;
  previousManifestId: string | null;
  headVersion: bigint;
  previousRetainUntil: Date | null;
}

export interface GenerationOperationReceipt extends NebulaGenerationHead {
  manifestId: string;
  status: NebulaGenerationStatus;
}

type PrismaTransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export class PrismaNebulaGenerationRepository {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  async getHead(scope: GenerationScope): Promise<NebulaGenerationHead | null> {
    const row = await this.prisma.nebulaProjectionHead.findUnique({ where: scopeKey(scope) });
    return row === null ? null : toHead(row);
  }

  async createBuilding(scope: GenerationScope, input: BuildingManifestInput): Promise<GenerationOperationReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      await lockScope(transaction, scope);
      const existing = await transaction.nebulaProjectionHead.upsert({
        where: scopeKey(scope),
        create: { ...scope, headVersion: 0n },
        update: {}
      });
      if (existing.buildingManifestId !== null) throw new Error("GENERATION_BUILD_CONFLICT");

      await transaction.nebulaProjectionManifest.create({
        data: {
          ...scope,
          id: input.id,
          generationId: input.generationId,
          generationNumber: input.generationNumber,
          baselineId: input.baselineId,
          profileId: input.profileId,
          profileVersion: input.profileVersion,
          projectionSchemaVersion: input.projectionSchemaVersion,
          status: "BUILDING",
          sourceWatermarks: input.sourceWatermarks ?? {},
          expectedCounts: input.expectedCounts ?? {},
          bucketDigests: input.bucketDigests ?? {},
          contentDigest: input.contentDigest
        }
      });

      const updated = await transaction.nebulaProjectionHead.updateMany({
        where: { ...scope, buildingManifestId: null, headVersion: existing.headVersion },
        data: { buildingManifestId: input.id, headVersion: { increment: 1n } }
      });
      if (updated.count !== 1) throw new Error("GENERATION_HEAD_VERSION_CONFLICT");
      return {
        ...toHead({ ...existing, buildingManifestId: input.id, headVersion: existing.headVersion + 1n }),
        manifestId: input.id,
        status: "BUILDING"
      };
    });
  }

  async markValidated(scope: GenerationScope, manifestId: string): Promise<GenerationOperationReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      await lockScope(transaction, scope);
      const head = await requireHead(transaction, scope);
      if (head.buildingManifestId !== manifestId) throw new Error("GENERATION_NOT_BUILDING");
      const updated = await transaction.nebulaProjectionManifest.updateMany({
        where: { ...scope, id: manifestId, status: "BUILDING" },
        data: { status: "VALIDATED", validatedAt: this.now() }
      });
      if (updated.count !== 1) throw new Error("GENERATION_MANIFEST_STATE_INVALID");
      return { ...toHead(head), manifestId, status: "VALIDATED" };
    });
  }

  async publish(scope: GenerationScope, manifestId: string): Promise<GenerationOperationReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      await lockScope(transaction, scope);
      const head = await requireHead(transaction, scope);
      if (head.buildingManifestId !== manifestId) throw new Error("GENERATION_NOT_BUILDING");
      const manifest = await transaction.nebulaProjectionManifest.findFirst({ where: { ...scope, id: manifestId, status: "VALIDATED" } });
      if (manifest === null) throw new Error("GENERATION_MANIFEST_STATE_INVALID");
      const now = this.now();
      const oldActiveManifestId = head.activeManifestId;
      const previousRetainUntil = oldActiveManifestId === null ? null : new Date(now.getTime() + 72 * 60 * 60 * 1000);

      if (head.previousManifestId !== null) {
        await transaction.nebulaProjectionManifest.updateMany({
          where: { ...scope, id: head.previousManifestId, status: "PREVIOUS" },
          data: { status: "RETIRED", retiredAt: now }
        });
      }
      if (oldActiveManifestId !== null) {
        await transaction.nebulaProjectionManifest.updateMany({
          where: { ...scope, id: oldActiveManifestId, status: "ACTIVE" },
          data: { status: "PREVIOUS" }
        });
      }
      await transaction.nebulaProjectionManifest.updateMany({
        where: { ...scope, id: manifestId, status: "VALIDATED" },
        data: { status: "ACTIVE" }
      });
      const updated = await transaction.nebulaProjectionHead.updateMany({
        where: { ...scope, headVersion: head.headVersion, buildingManifestId: manifestId },
        data: {
          buildingManifestId: null,
          activeManifestId: manifestId,
          previousManifestId: oldActiveManifestId,
          previousRetainUntil,
          headVersion: { increment: 1n }
        }
      });
      if (updated.count !== 1) throw new Error("GENERATION_HEAD_VERSION_CONFLICT");
      return {
        buildingManifestId: null,
        activeManifestId: manifestId,
        previousManifestId: oldActiveManifestId,
        headVersion: head.headVersion + 1n,
        previousRetainUntil,
        manifestId,
        status: "ACTIVE"
      };
    });
  }

  async rollback(scope: GenerationScope): Promise<GenerationOperationReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      await lockScope(transaction, scope);
      const head = await requireHead(transaction, scope);
      if (head.activeManifestId === null || head.previousManifestId === null) throw new Error("GENERATION_ROLLBACK_UNAVAILABLE");
      if (head.buildingManifestId !== null) throw new Error("GENERATION_BUILD_IN_PROGRESS");
      const now = this.now();
      const active = await transaction.nebulaProjectionManifest.findFirst({ where: { ...scope, id: head.activeManifestId, status: "ACTIVE" } });
      const previous = await transaction.nebulaProjectionManifest.findFirst({ where: { ...scope, id: head.previousManifestId, status: "PREVIOUS" } });
      if (active === null || previous === null) throw new Error("GENERATION_ROLLBACK_INCOMPATIBLE");
      await transaction.nebulaProjectionManifest.updateMany({ where: { ...scope, id: active.id, status: "ACTIVE" }, data: { status: "PREVIOUS" } });
      await transaction.nebulaProjectionManifest.updateMany({ where: { ...scope, id: previous.id, status: "PREVIOUS" }, data: { status: "ACTIVE" } });
      const updated = await transaction.nebulaProjectionHead.updateMany({
        where: { ...scope, headVersion: head.headVersion, activeManifestId: active.id, previousManifestId: previous.id },
        data: {
          activeManifestId: previous.id,
          previousManifestId: active.id,
          previousRetainUntil: new Date(now.getTime() + 72 * 60 * 60 * 1000),
          headVersion: { increment: 1n }
        }
      });
      if (updated.count !== 1) throw new Error("GENERATION_HEAD_VERSION_CONFLICT");
      return {
        buildingManifestId: null,
        activeManifestId: previous.id,
        previousManifestId: active.id,
        headVersion: head.headVersion + 1n,
        previousRetainUntil: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        manifestId: previous.id,
        status: "ACTIVE"
      };
    });
  }

  async retirePrevious(scope: GenerationScope, manifestId: string): Promise<GenerationOperationReceipt> {
    return this.prisma.$transaction(async (transaction) => {
      await lockScope(transaction, scope);
      const head = await requireHead(transaction, scope);
      if (head.activeManifestId === manifestId) throw new Error("ACTIVE_GENERATION_PROTECTED");
      if (head.previousManifestId !== manifestId) throw new Error("GENERATION_NOT_PREVIOUS");
      const updatedManifest = await transaction.nebulaProjectionManifest.updateMany({
        where: { ...scope, id: manifestId, status: "PREVIOUS" },
        data: { status: "RETIRED", retiredAt: this.now() }
      });
      if (updatedManifest.count !== 1) throw new Error("GENERATION_MANIFEST_STATE_INVALID");
      const updatedHead = await transaction.nebulaProjectionHead.updateMany({
        where: { ...scope, headVersion: head.headVersion, previousManifestId: manifestId },
        data: { previousManifestId: null, previousRetainUntil: null, headVersion: { increment: 1n } }
      });
      if (updatedHead.count !== 1) throw new Error("GENERATION_HEAD_VERSION_CONFLICT");
      return { ...toHead({ ...head, previousManifestId: null, previousRetainUntil: null, headVersion: head.headVersion + 1n }), manifestId, status: "RETIRED" };
    });
  }
}

function scopeKey(scope: GenerationScope) {
  return { enterpriseId_applicationServiceId_scopePath: scope };
}

async function lockScope(client: PrismaTransactionClient, scope: GenerationScope): Promise<void> {
  await client.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `${scope.enterpriseId}:${scope.applicationServiceId}:${scope.scopePath}`);
}

async function requireHead(client: PrismaTransactionClient, scope: GenerationScope) {
  const head = await client.nebulaProjectionHead.findUnique({ where: scopeKey(scope) });
  if (head === null) throw new Error("GENERATION_HEAD_NOT_FOUND");
  return head;
}

function toHead(row: { buildingManifestId: string | null; activeManifestId: string | null; previousManifestId: string | null; headVersion: bigint; previousRetainUntil: Date | null }): NebulaGenerationHead {
  return {
    buildingManifestId: row.buildingManifestId,
    activeManifestId: row.activeManifestId,
    previousManifestId: row.previousManifestId,
    headVersion: row.headVersion,
    previousRetainUntil: row.previousRetainUntil
  };
}
