import { PrismaClient } from "@prisma/client";
import { assetLabel, normalizeAssetType } from "@specforge/core";
import type { Asset, AssetType, ContextPack, Proposal } from "@specforge/core";

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

export async function ensureMcpPersistenceSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS DesignAsset (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT NOT NULL,
      domainId TEXT,
      payload TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS DesignAsset_type_idx ON DesignAsset(type)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS DesignAsset_domainId_idx ON DesignAsset(domainId)`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Proposal (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      domainId TEXT,
      payload TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ContextPack (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      proposalId TEXT NOT NULL,
      targetAgent TEXT NOT NULL,
      summary TEXT NOT NULL,
      includedAssets TEXT NOT NULL,
      constraints TEXT NOT NULL,
      instructions TEXT NOT NULL,
      generatedMarkdown TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ContextPack_proposalId_idx ON ContextPack(proposalId)`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS GovernanceCheckSnapshot (
      id TEXT PRIMARY KEY NOT NULL,
      assetType TEXT NOT NULL,
      assetId TEXT NOT NULL,
      results TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS GovernanceCheckSnapshot_assetType_assetId_idx ON GovernanceCheckSnapshot(assetType, assetId)`);
}

export async function upsertDesignAsset(input: UpsertDesignAssetInput) {
  await ensureMcpPersistenceSchema();
  const asset = input.asset as unknown as Record<string, unknown>;
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
      payload: JSON.stringify(asset),
      updatedAt: optionalDate(asset.updatedAt)
    }
  });

  return { id: asset.id, type: input.assetType, status: "upserted" };
}

export async function upsertProposal(input: UpsertProposalInput) {
  await ensureMcpPersistenceSchema();
  const proposal = input.proposal;
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
      payload: JSON.stringify(proposal),
      createdAt: new Date(proposal.createdAt),
      updatedAt: new Date(proposal.updatedAt)
    },
    update: {
      title: proposal.title,
      description: proposal.description,
      status: proposal.status,
      domainId: proposal.domainId,
      payload: JSON.stringify(proposal),
      updatedAt: new Date(proposal.updatedAt)
    }
  });

  return { id: proposal.id, status: "upserted" };
}

export async function upsertContextPack(input: UpsertContextPackInput) {
  await ensureMcpPersistenceSchema();
  const pack = input.contextPack;
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
      createdAt: new Date(pack.createdAt)
    },
    update: {
      name: pack.name,
      targetAgent: pack.targetAgent,
      summary: pack.summary,
      includedAssets: JSON.stringify(pack.includedAssets),
      constraints: JSON.stringify(pack.constraints),
      instructions: JSON.stringify(pack.instructions),
      generatedMarkdown: pack.generatedMarkdown
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

  return {
    deletedAssetIds: assetIds,
    deletedProposalIds: proposalIds,
    deletedContextPackIds: contextPackIds,
    status: "deleted"
  };
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
