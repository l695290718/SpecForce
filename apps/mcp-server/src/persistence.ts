import { PrismaClient } from "@prisma/client";
import { assertWritableApplicationService, assetLabel, defaultHuaweiActor, hasScopeAccess, huaweiArchitectureScopes, localizeAsset, normalizeAssetType, scopeById, seedHuaweiActor, validateAssetLocalization } from "@specforge/core";
import type { ArchitectureScopeRef, Asset, AssetLocale, AssetType, ContextPack, Proposal, ScopedActor } from "@specforge/core";

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
  const applicationService = scopeById(scope.applicationServiceId);
  if (!applicationService || applicationService.scopePath !== scope.scopePath) throw new Error("Scope write is not authorized.");
  return assertWritableApplicationService(actor, applicationService);
}

function writableActor(): ScopedActor {
  return process.env.SPECFORGE_MCP_SEED === "1" ? seedHuaweiActor : defaultHuaweiActor;
}

function readableScope(applicationServiceId: string): ArchitectureScopeRef {
  const scope = scopeById(applicationServiceId);
  if (!scope || scope.level !== "applicationService" || !hasScopeAccess(defaultHuaweiActor, scope, "read")) throw new Error("Scope read is not authorized.");
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
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

  for (const actor of [defaultHuaweiActor, seedHuaweiActor]) for (const grant of actor.grants) {
    await prisma.actorScopeGrant.upsert({
      where: { actorType_actorId_scopeId_action: { actorType: actor.actorType, actorId: actor.actorId, scopeId: grant.scopeId, action: grant.action } },
      create: { actorType: actor.actorType, actorId: actor.actorId, scopeId: grant.scopeId, action: grant.action },
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
  const asset = input.asset as unknown as Record<string, unknown>;
  const scope = resolveWritableScope(writableActor(), asset.architectureScope as ArchitectureScopeRef | undefined);
  const localizedAsset = { ...asset, architectureScope: scope } as Asset;
  validateAssetLocalization(input.assetType, localizedAsset);
  const canonicalAsset = localizeAsset(input.assetType, localizedAsset, "en") as unknown as Record<string, unknown>;
  assertString(canonicalAsset.id, "asset.id");
  assertString(canonicalAsset.name ?? canonicalAsset.title, "asset.name");
  await ensureMcpPersistenceSchema();

  await prisma.designAsset.upsert({
    where: { id: canonicalAsset.id },
    create: {
      id: canonicalAsset.id,
      type: input.assetType,
      name: String(canonicalAsset.name ?? canonicalAsset.title ?? canonicalAsset.id),
      code: optionalString(canonicalAsset.code),
      description: optionalString(canonicalAsset.description) ?? "",
      domainId: optionalString(canonicalAsset.domainId),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonicalAsset),
      createdAt: optionalDate(canonicalAsset.createdAt),
      updatedAt: optionalDate(canonicalAsset.updatedAt)
    },
    update: {
      type: input.assetType,
      name: String(canonicalAsset.name ?? canonicalAsset.title ?? canonicalAsset.id),
      code: optionalString(canonicalAsset.code),
      description: optionalString(canonicalAsset.description) ?? "",
      domainId: optionalString(canonicalAsset.domainId),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonicalAsset),
      updatedAt: optionalDate(canonicalAsset.updatedAt)
    }
  });

  return { id: canonicalAsset.id, type: input.assetType, status: "upserted" };
}

export async function upsertProposal(input: UpsertProposalInput) {
  const proposal = input.proposal as Proposal;
  const scope = resolveWritableScope(writableActor(), proposal.architectureScope);
  const localizedProposal = { ...proposal, architectureScope: scope } as Proposal;
  validateAssetLocalization("proposal", localizedProposal);
  const canonicalProposal = localizeAsset("proposal", localizedProposal, "en");
  assertString(proposal.id, "proposal.id");
  assertString(canonicalProposal.title, "proposal.title");
  await ensureMcpPersistenceSchema();

  await prisma.proposal.upsert({
    where: { id: canonicalProposal.id },
    create: {
      id: canonicalProposal.id,
      title: canonicalProposal.title,
      description: canonicalProposal.description,
      status: canonicalProposal.status,
      domainId: canonicalProposal.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonicalProposal),
      createdAt: new Date(canonicalProposal.createdAt),
      updatedAt: new Date(canonicalProposal.updatedAt)
    },
    update: {
      title: canonicalProposal.title,
      description: canonicalProposal.description,
      status: canonicalProposal.status,
      domainId: canonicalProposal.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonicalProposal),
      updatedAt: new Date(canonicalProposal.updatedAt)
    }
  });

  return { id: canonicalProposal.id, status: "upserted" };
}

export async function upsertContextPack(input: UpsertContextPackInput) {
  await ensureMcpPersistenceSchema();
  const pack = input.contextPack;
  const scope = resolveWritableScope(writableActor(), pack.architectureScope);
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
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
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

export async function listPersistedAssetLinks(applicationServiceId: string): Promise<PersistedAssetLink[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relationType: string;
    description: string | null;
    createdAt: Date | string;
  }>>(`SELECT id, "sourceType", "sourceId", "targetType", "targetId", "relationType", description, "createdAt" FROM "AssetLink" WHERE "applicationServiceId" = '${scope.applicationServiceId}' AND "scopePath" LIKE '${scope.scopePath}%' ORDER BY "createdAt" ASC`);
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

export async function listPersistedAssets(applicationServiceId: string, assetType?: AssetType): Promise<Array<{ type: AssetType; asset: Asset }>> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.designAsset.findMany({
    where: { ...(assetType ? { type: assetType } : {}), applicationServiceId: scope.applicationServiceId, scopePath: { startsWith: scope.scopePath } },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => ({ type: normalizeAssetType(row.type), asset: JSON.parse(row.payload) as Asset }));
}

export async function listPersistedProposals(applicationServiceId: string): Promise<Proposal[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.proposal.findMany({ where: { applicationServiceId: scope.applicationServiceId, scopePath: { startsWith: scope.scopePath } }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => JSON.parse(row.payload) as Proposal);
}

export async function listPersistedContextPacks(applicationServiceId: string): Promise<ContextPack[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.contextPack.findMany({ where: { applicationServiceId: scope.applicationServiceId, scopePath: { startsWith: scope.scopePath } }, orderBy: { createdAt: "asc" } });
  return rows.map(rowToContextPack);
}

export async function getPersistedAsset(assetType: string, assetId: string, applicationServiceId: string): Promise<Asset> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const type = normalizeAssetType(assetType);
  if (type === "proposal") {
    const proposal = (await listPersistedProposals(applicationServiceId)).find((item) => item.id === assetId);
    if (!proposal) throw new Error(`Asset not found: ${type}/${assetId}`);
    return proposal;
  }
  if (type === "contextPack") {
    const pack = (await listPersistedContextPacks(applicationServiceId)).find((item) => item.id === assetId);
    if (!pack) throw new Error(`Asset not found: ${type}/${assetId}`);
    return pack;
  }
  const row = await prisma.designAsset.findFirst({ where: { id: assetId, type, applicationServiceId: scope.applicationServiceId, scopePath: { startsWith: scope.scopePath } } });
  if (!row) throw new Error(`Asset not found: ${type}/${assetId}`);
  return JSON.parse(row.payload) as Asset;
}

export async function listPersistedCollectionAsMarkdown(assetType: string, applicationServiceId: string): Promise<string> {
  const type = normalizeAssetType(assetType);
  const assets = await listAssetsForType(type, applicationServiceId);
  return [`# ${assetLabel(type)} Catalog`, "", ...assets.map((asset) => `- ${assetName(asset)} (${type}/${asset.id})`)].join("\n");
}

export async function renderPersistedAssetAsMarkdown(assetType: string, assetId: string, applicationServiceId: string, locale: AssetLocale = "en"): Promise<string> {
  const type = normalizeAssetType(assetType);
  const canonicalAsset = await getPersistedAsset(type, assetId, applicationServiceId);
  const asset = localizeAsset(type, canonicalAsset, locale);
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
    JSON.stringify(canonicalAsset, null, 2),
    "```"
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export async function searchPersistedDesignAssets(input: { applicationServiceId: string; query: string; assetTypes?: string[]; domainId?: string; limit?: number; locale?: AssetLocale }) {
  const terms = input.query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const types = input.assetTypes?.length ? input.assetTypes.map(normalizeAssetType) : undefined;
  const locale = input.locale ?? "en";
  const candidates = types
    ? (await Promise.all(types.map((type) => listPersistedAssets(input.applicationServiceId, type)))).flat()
    : [
        ...(await listPersistedAssets(input.applicationServiceId)),
        ...(await listPersistedProposals(input.applicationServiceId)).map((asset) => ({ type: "proposal" as AssetType, asset })),
        ...(await listPersistedContextPacks(input.applicationServiceId)).map((asset) => ({ type: "contextPack" as AssetType, asset }))
      ];
  const scored = candidates
    .filter(({ asset }) => !input.domainId || !("domainId" in asset) || asset.domainId === input.domainId || asset.id === input.domainId)
    .map(({ type, asset }) => ({ type, asset, localized: localizeAsset(type, asset, locale), score: scoreAsset(asset, terms) }))
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score || assetName(a.localized).localeCompare(assetName(b.localized)))
    .slice(0, Math.max(1, Math.min(input.limit ?? 10, 50)));

  return {
    results: scored.map(({ type, asset, localized, score }) => ({
      id: localized.id,
      type,
      name: assetName(localized),
      summary: assetSummary(localized),
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

async function listAssetsForType(assetType: AssetType, applicationServiceId: string): Promise<Asset[]> {
  if (assetType === "proposal") return listPersistedProposals(applicationServiceId);
  if (assetType === "contextPack") return listPersistedContextPacks(applicationServiceId);
  return (await listPersistedAssets(applicationServiceId, assetType)).map(({ asset }) => asset);
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
