import { PrismaClient } from "@prisma/client";
import { assertWritableApplicationService, assetLabel, defaultHuaweiActor, huaweiArchitectureScopes, normalizeAssetType } from "@specforge/core";
import type { ArchitectureScopeRef, Asset, AssetType, ContextPack, Proposal, ScopedActor } from "@specforge/core";

const globalForPrisma = globalThis as unknown as { specforgeMcpPrisma?: PrismaClient };

export const prisma = globalForPrisma.specforgeMcpPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.specforgeMcpPrisma = prisma;
}

export interface UpsertDesignAssetInput {
  assetType: AssetType;
  asset: Asset;
}

export interface UpsertProposalInput {
  proposal: Proposal;
}

export interface UpsertContextPackInput {
  contextPack: ContextPack;
}

export interface DeletePersistedDesignDataInput {
  assetIds?: string[];
  proposalIds?: string[];
  contextPackIds?: string[];
}

export interface AssetLinkInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description?: string;
  architectureScope?: ArchitectureScopeRef;
}

export interface PersistedAssetLink extends AssetLinkInput {
  id: string;
  createdAt: string;
}

export function resolveWritableScope(actor: ScopedActor, scope: ArchitectureScopeRef | undefined): ArchitectureScopeRef {
  if (!scope) throw new Error("Architecture scope is required.");
  try {
    return assertWritableApplicationService(actor, huaweiArchitectureScopes, scope.applicationServiceId);
  } catch {
    throw new Error("Scope write is not authorized.");
  }
}

export async function ensureArchitectureScopes() {
  for (const scope of huaweiArchitectureScopes) {
    await prisma.architectureScope.upsert({
      where: { id: scope.id },
      create: scope,
      update: {
        code: scope.code,
        name: scope.name,
        description: scope.description,
        owner: scope.owner,
        level: scope.level,
        parentId: scope.parentId,
        scopePath: scope.scopePath
      }
    });
  }

  for (const grant of defaultHuaweiActor.grants) {
    await prisma.actorScopeGrant.upsert({
      where: { actorType_actorId_scopeId_action: { actorType: defaultHuaweiActor.actorType, actorId: defaultHuaweiActor.actorId, scopeId: grant.scopeId, action: grant.action } },
      create: { actorType: defaultHuaweiActor.actorType, actorId: defaultHuaweiActor.actorId, scopeId: grant.scopeId, action: grant.action },
      update: {}
    });
  }
}

export async function listPersistedArchitectureScopes() {
  await ensureMcpPersistenceSchema();
  return prisma.architectureScope.findMany({ orderBy: { scopePath: "asc" } });
}

export async function ensureMcpPersistenceSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ArchitectureScope" (
      id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      description TEXT NOT NULL, owner TEXT NOT NULL, level TEXT NOT NULL,
      "parentId" TEXT, "scopePath" TEXT NOT NULL UNIQUE,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ActorScopeGrant" (
    id TEXT PRIMARY KEY NOT NULL, "actorType" TEXT NOT NULL, "actorId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL, action TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("actorType", "actorId", "scopeId", action)
  )`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DesignAsset" (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT NOT NULL,
      "domainId" TEXT,
      payload TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DesignAsset_type_idx" ON "DesignAsset"(type)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DesignAsset_domainId_idx" ON "DesignAsset"("domainId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Proposal" (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      "domainId" TEXT,
      payload TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContextPack" (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      "proposalId" TEXT NOT NULL,
      "targetAgent" TEXT NOT NULL,
      summary TEXT NOT NULL,
      "includedAssets" TEXT NOT NULL,
      constraints TEXT NOT NULL,
      instructions TEXT NOT NULL,
      "generatedMarkdown" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ContextPack_proposalId_idx" ON "ContextPack"("proposalId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GovernanceCheckSnapshot" (
      id TEXT PRIMARY KEY NOT NULL,
      "assetType" TEXT NOT NULL,
      "assetId" TEXT NOT NULL,
      results TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GovernanceCheckSnapshot_assetType_assetId_idx" ON "GovernanceCheckSnapshot"("assetType", "assetId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AssetLink" (
      id TEXT PRIMARY KEY NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "relationType" TEXT NOT NULL,
      description TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssetLink_source_idx" ON "AssetLink"("sourceType", "sourceId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssetLink_target_idx" ON "AssetLink"("targetType", "targetId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssetLink_relationType_idx" ON "AssetLink"("relationType")`);
  for (const table of ["DesignAsset", "Proposal", "ContextPack", "AssetLink"]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "applicationServiceId" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "scopePath" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_applicationServiceId_idx" ON "${table}"("applicationServiceId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_scopePath_idx" ON "${table}"("scopePath")`);
  }
  await ensureArchitectureScopes();
}

export async function upsertDesignAsset(input: UpsertDesignAssetInput) {
  await ensureMcpPersistenceSchema();
  const asset = input.asset as unknown as Record<string, unknown>;
  const scope = resolveWritableScope(defaultHuaweiActor, asset.architectureScope as ArchitectureScopeRef | undefined);
  asset.architectureScope = scope;
  assertString(asset.id, "asset.id");
  assertString(asset.name ?? asset.title, "asset.name");

  await prisma.designAsset.upsert({
    where: { id: asset.id },
    create: {
      id: asset.id,
      type: input.assetType,
      name: String(asset.name ?? asset.title ?? asset.id),
      code: optionalString(asset.code),
      description: optionalString(asset.description) ?? "",
      domainId: optionalString(asset.domainId),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(asset),
      createdAt: optionalDate(asset.createdAt),
      updatedAt: optionalDate(asset.updatedAt)
    },
    update: {
      type: input.assetType,
      name: String(asset.name ?? asset.title ?? asset.id),
      code: optionalString(asset.code),
      description: optionalString(asset.description) ?? "",
      domainId: optionalString(asset.domainId),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(asset),
      updatedAt: optionalDate(asset.updatedAt)
    }
  });

  return { id: asset.id, type: input.assetType, status: "upserted" };
}

export async function upsertProposal(input: UpsertProposalInput) {
  await ensureMcpPersistenceSchema();
  const proposal = input.proposal;
  const scope = resolveWritableScope(defaultHuaweiActor, proposal.architectureScope);
  proposal.architectureScope = scope;
  assertString(proposal.id, "proposal.id");
  assertString(proposal.title, "proposal.title");

  await prisma.proposal.upsert({
    where: { id: proposal.id },
    create: {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      status: proposal.status,
      domainId: proposal.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(proposal),
      createdAt: new Date(proposal.createdAt),
      updatedAt: new Date(proposal.updatedAt)
    },
    update: {
      title: proposal.title,
      description: proposal.description,
      status: proposal.status,
      domainId: proposal.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(proposal),
      updatedAt: new Date(proposal.updatedAt)
    }
  });

  return { id: proposal.id, status: "upserted" };
}

export async function upsertContextPack(input: UpsertContextPackInput) {
  await ensureMcpPersistenceSchema();
  const pack = input.contextPack;
  const scope = resolveWritableScope(defaultHuaweiActor, pack.architectureScope);
  pack.architectureScope = scope;
  assertString(pack.id, "contextPack.id");
  assertString(pack.proposalId, "contextPack.proposalId");

  await prisma.contextPack.upsert({
    where: { id: pack.id },
    create: {
      id: pack.id,
      name: pack.name,
      proposalId: pack.proposalId,
      targetAgent: pack.targetAgent,
      summary: pack.summary,
      includedAssets: JSON.stringify(pack.includedAssets),
      constraints: JSON.stringify(pack.constraints),
      instructions: JSON.stringify(pack.instructions),
      generatedMarkdown: pack.generatedMarkdown,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      createdAt: new Date(pack.createdAt)
    },
    update: {
      name: pack.name,
      targetAgent: pack.targetAgent,
      summary: pack.summary,
      includedAssets: JSON.stringify(pack.includedAssets),
      constraints: JSON.stringify(pack.constraints),
      instructions: JSON.stringify(pack.instructions),
      generatedMarkdown: pack.generatedMarkdown,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath
    }
  });

  return { id: pack.id, proposalId: pack.proposalId, status: "upserted" };
}

export async function deletePersistedDesignData(input: DeletePersistedDesignDataInput) {
  await ensureMcpPersistenceSchema();
  const assetIds = input.assetIds ?? [];
  const proposalIds = input.proposalIds ?? [];
  const contextPackIds = input.contextPackIds ?? [];

  await prisma.contextPack.deleteMany({ where: { id: { in: contextPackIds } } });
  await prisma.proposal.deleteMany({ where: { id: { in: proposalIds } } });
  await prisma.designAsset.deleteMany({ where: { id: { in: assetIds } } });
  if (assetIds.length || proposalIds.length || contextPackIds.length) {
    const ids = [...assetIds, ...proposalIds, ...contextPackIds];
    const sourcePlaceholders = ids.map((_, index) => `$${index + 1}`).join(",");
    const targetPlaceholders = ids.map((_, index) => `$${ids.length + index + 1}`).join(",");
    await prisma.$executeRawUnsafe(
      `DELETE FROM "AssetLink" WHERE "sourceId" IN (${sourcePlaceholders}) OR "targetId" IN (${targetPlaceholders})`,
      ...ids,
      ...ids
    );
  }

  return {
    deletedAssetIds: assetIds,
    deletedProposalIds: proposalIds,
    deletedContextPackIds: contextPackIds,
    status: "deleted"
  };
}

export async function upsertAssetLink(input: AssetLinkInput): Promise<PersistedAssetLink> {
  await ensureMcpPersistenceSchema();
  const scope = resolveWritableScope(defaultHuaweiActor, input.architectureScope);
  const sourceType = normalizeAssetType(input.sourceType);
  const targetType = normalizeAssetType(input.targetType);
  assertString(input.sourceId, "sourceId");
  assertString(input.targetId, "targetId");
  assertString(input.relationType, "relationType");
  const id = assetLinkId({ ...input, sourceType, targetType });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AssetLink" (id, "sourceType", "sourceId", "targetType", "targetId", "relationType", description, "applicationServiceId", "scopePath")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       "sourceType" = excluded."sourceType",
       "sourceId" = excluded."sourceId",
       "targetType" = excluded."targetType",
       "targetId" = excluded."targetId",
       "relationType" = excluded."relationType",
       description = excluded.description,
       "applicationServiceId" = excluded."applicationServiceId",
       "scopePath" = excluded."scopePath"`,
    id,
    sourceType,
    input.sourceId,
    targetType,
    input.targetId,
    input.relationType,
    input.description ?? null,
    scope.applicationServiceId,
    scope.scopePath
  );

  return {
    id,
    sourceType,
    sourceId: input.sourceId,
    targetType,
    targetId: input.targetId,
    relationType: input.relationType,
    description: input.description,
    architectureScope: scope,
    createdAt: new Date().toISOString()
  };
}

export async function listPersistedAssetLinks(): Promise<PersistedAssetLink[]> {
  await ensureMcpPersistenceSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relationType: string;
    description: string | null;
    createdAt: Date | string;
  }>>(`SELECT id, "sourceType", "sourceId", "targetType", "targetId", "relationType", description, "createdAt" FROM "AssetLink" ORDER BY "createdAt" ASC`);
  return rows.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    targetType: row.targetType,
    targetId: row.targetId,
    relationType: row.relationType,
    description: row.description ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  }));
}

export async function listPersistedAssets(assetType?: AssetType): Promise<Array<{ type: AssetType; asset: Asset }>> {
  await ensureMcpPersistenceSchema();
  const rows = await prisma.designAsset.findMany({
    where: assetType ? { type: assetType } : undefined,
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => ({ type: normalizeAssetType(row.type), asset: JSON.parse(row.payload) as Asset }));
}

export async function listPersistedProposals(): Promise<Proposal[]> {
  await ensureMcpPersistenceSchema();
  const rows = await prisma.proposal.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => JSON.parse(row.payload) as Proposal);
}

export async function listPersistedContextPacks(): Promise<ContextPack[]> {
  await ensureMcpPersistenceSchema();
  const rows = await prisma.contextPack.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(rowToContextPack);
}

export async function getPersistedAsset(assetType: string, assetId: string): Promise<Asset> {
  await ensureMcpPersistenceSchema();
  const type = normalizeAssetType(assetType);
  if (type === "proposal") {
    const proposal = (await listPersistedProposals()).find((item) => item.id === assetId);
    if (!proposal) throw new Error(`Asset not found: ${type}/${assetId}`);
    return proposal;
  }
  if (type === "contextPack") {
    const pack = (await listPersistedContextPacks()).find((item) => item.id === assetId);
    if (!pack) throw new Error(`Asset not found: ${type}/${assetId}`);
    return pack;
  }
  const row = await prisma.designAsset.findFirst({ where: { id: assetId, type } });
  if (!row) throw new Error(`Asset not found: ${type}/${assetId}`);
  return JSON.parse(row.payload) as Asset;
}

export async function listPersistedCollectionAsMarkdown(assetType: string): Promise<string> {
  const type = normalizeAssetType(assetType);
  const assets = await listAssetsForType(type);
  return [`# ${assetLabel(type)} Catalog`, "", ...assets.map((asset) => `- ${assetName(asset)} (${type}/${asset.id})`)].join("\n");
}

export async function renderPersistedAssetAsMarkdown(assetType: string, assetId: string): Promise<string> {
  const type = normalizeAssetType(assetType);
  const asset = await getPersistedAsset(type, assetId);
  return [
    `# ${assetName(asset)}`,
    "",
    `- ID: ${asset.id}`,
    `- Type: ${assetLabel(type)}`,
    "domainId" in asset && asset.domainId ? `- Domain: ${asset.domainId}` : undefined,
    "",
    "## Agent Summary",
    assetSummary(asset),
    "",
    "## Source JSON",
    "```json",
    JSON.stringify(asset, null, 2),
    "```"
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export async function searchPersistedDesignAssets(input: { query: string; assetTypes?: string[]; domainId?: string; limit?: number }) {
  const terms = input.query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const types = input.assetTypes?.length ? input.assetTypes.map(normalizeAssetType) : undefined;
  const candidates = types
    ? (await Promise.all(types.map((type) => listPersistedAssets(type)))).flat()
    : [
        ...(await listPersistedAssets()),
        ...(await listPersistedProposals()).map((asset) => ({ type: "proposal" as AssetType, asset })),
        ...(await listPersistedContextPacks()).map((asset) => ({ type: "contextPack" as AssetType, asset }))
      ];
  const scored = candidates
    .filter(({ asset }) => !input.domainId || !("domainId" in asset) || asset.domainId === input.domainId || asset.id === input.domainId)
    .map(({ type, asset }) => ({ type, asset, score: scoreAsset(asset, terms) }))
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score || assetName(a.asset).localeCompare(assetName(b.asset)))
    .slice(0, Math.max(1, Math.min(input.limit ?? 10, 50)));

  return {
    results: scored.map(({ type, asset, score }) => ({
      id: asset.id,
      type,
      name: assetName(asset),
      summary: assetSummary(asset),
      relevanceReason: score > 0 ? `Matched ${score} query term(s) in persisted ${assetLabel(type)} metadata.` : `Included from persisted ${assetLabel(type)} catalog.`
    }))
  };
}

export async function disconnectMcpPersistence() {
  await prisma.$disconnect();
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid MCP write payload: ${field} is required.`);
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalDate(value: unknown): Date {
  return typeof value === "string" ? new Date(value) : new Date();
}

async function listAssetsForType(assetType: AssetType): Promise<Asset[]> {
  if (assetType === "proposal") return listPersistedProposals();
  if (assetType === "contextPack") return listPersistedContextPacks();
  return (await listPersistedAssets(assetType)).map(({ asset }) => asset);
}

function rowToContextPack(row: {
  id: string;
  name: string;
  proposalId: string;
  targetAgent: string;
  summary: string;
  includedAssets: string;
  constraints: string;
  instructions: string;
  generatedMarkdown: string;
  createdAt: Date;
}): ContextPack {
  return {
    id: row.id,
    name: row.name,
    proposalId: row.proposalId,
    targetAgent: row.targetAgent,
    summary: row.summary,
    includedAssets: JSON.parse(row.includedAssets),
    constraints: JSON.parse(row.constraints),
    instructions: JSON.parse(row.instructions),
    generatedMarkdown: row.generatedMarkdown,
    createdAt: row.createdAt.toISOString()
  };
}

function assetName(asset: Asset): string {
  return "title" in asset && asset.title ? asset.title : asset.name;
}

function assetSummary(asset: Asset): string {
  if ("summary" in asset) return asset.summary;
  return asset.description;
}

function scoreAsset(asset: Asset, terms: string[]): number {
  const text = JSON.stringify(asset).toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function assetLinkId(input: Pick<AssetLinkInput, "sourceType" | "sourceId" | "targetType" | "targetId" | "relationType">): string {
  return `${input.sourceType}:${input.sourceId}:${input.relationType}:${input.targetType}:${input.targetId}`
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-");
}
