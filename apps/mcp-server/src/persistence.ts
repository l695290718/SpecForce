import { PrismaClient } from "@prisma/client";
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
