import { PrismaClient } from "@prisma/client";
import { generateContextPack, seedData } from "@specforge/core";
import {
  selfDesignAdr,
  selfDesignApis,
  selfDesignBusinessRules,
  selfDesignContextPack,
  selfDesignDataModels,
  selfDesignDomain,
  selfDesignEvents,
  selfDesignIntegration,
  selfDesignObservability,
  selfDesignProposal,
  selfDesignQuality,
  selfDesignStateMachines
} from "./data/specforge-self-design";

const prisma = new PrismaClient();

async function bootstrapSqliteSchema() {
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

async function upsertAsset(type: string, asset: { id: string; name?: string; title?: string; code?: string; description?: string; domainId?: string; createdAt?: string; updatedAt?: string }) {
  await prisma.designAsset.upsert({
    where: { id: asset.id },
    create: {
      id: asset.id,
      type,
      name: asset.name ?? asset.title ?? asset.id,
      code: asset.code,
      description: asset.description ?? "",
      domainId: asset.domainId,
      payload: JSON.stringify(asset),
      createdAt: asset.createdAt ? new Date(asset.createdAt) : new Date(),
      updatedAt: asset.updatedAt ? new Date(asset.updatedAt) : new Date()
    },
    update: {
      type,
      name: asset.name ?? asset.title ?? asset.id,
      code: asset.code,
      description: asset.description ?? "",
      domainId: asset.domainId,
      payload: JSON.stringify(asset)
    }
  });
}

async function main() {
  await bootstrapSqliteSchema();

  const assetGroups: Array<[string, Array<any>]> = [
    ["domain", seedData.domains],
    ["dataModel", seedData.dataModels],
    ["api", seedData.apis],
    ["event", seedData.events],
    ["businessRule", seedData.businessRules],
    ["stateMachine", seedData.stateMachines],
    ["integration", seedData.integrations],
    ["quality", seedData.qualityRequirements],
    ["observability", seedData.observabilityDesigns],
    ["adr", seedData.adrs]
  ];

  const databaseManagedAssetGroups: Array<[string, Array<any>]> = [
    ["domain", [selfDesignDomain]],
    ["dataModel", selfDesignDataModels],
    ["api", selfDesignApis],
    ["event", selfDesignEvents],
    ["businessRule", selfDesignBusinessRules],
    ["stateMachine", selfDesignStateMachines],
    ["integration", [selfDesignIntegration]],
    ["quality", [selfDesignQuality]],
    ["observability", [selfDesignObservability]],
    ["adr", [selfDesignAdr]]
  ];

  for (const [type, assets] of [...assetGroups, ...databaseManagedAssetGroups]) {
    for (const asset of assets) {
      await upsertAsset(type, asset);
    }
  }

  for (const proposal of seedData.proposals) {
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
        payload: JSON.stringify(proposal)
      }
    });
  }

  await prisma.proposal.upsert({
    where: { id: selfDesignProposal.id },
    create: {
      id: selfDesignProposal.id,
      title: selfDesignProposal.title,
      description: selfDesignProposal.description,
      status: selfDesignProposal.status,
      domainId: selfDesignProposal.domainId,
      payload: JSON.stringify(selfDesignProposal),
      createdAt: new Date(selfDesignProposal.createdAt),
      updatedAt: new Date(selfDesignProposal.updatedAt)
    },
    update: {
      title: selfDesignProposal.title,
      description: selfDesignProposal.description,
      status: selfDesignProposal.status,
      domainId: selfDesignProposal.domainId,
      payload: JSON.stringify(selfDesignProposal)
    }
  });

  const pack = await generateContextPack("proposal-partial-refund");
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

  await prisma.contextPack.upsert({
    where: { id: selfDesignContextPack.id },
    create: {
      id: selfDesignContextPack.id,
      name: selfDesignContextPack.name,
      proposalId: selfDesignContextPack.proposalId,
      targetAgent: selfDesignContextPack.targetAgent,
      summary: selfDesignContextPack.summary,
      includedAssets: JSON.stringify(selfDesignContextPack.includedAssets),
      constraints: JSON.stringify(selfDesignContextPack.constraints),
      instructions: JSON.stringify(selfDesignContextPack.instructions),
      generatedMarkdown: selfDesignContextPack.generatedMarkdown,
      createdAt: new Date(selfDesignContextPack.createdAt)
    },
    update: {
      name: selfDesignContextPack.name,
      targetAgent: selfDesignContextPack.targetAgent,
      summary: selfDesignContextPack.summary,
      includedAssets: JSON.stringify(selfDesignContextPack.includedAssets),
      constraints: JSON.stringify(selfDesignContextPack.constraints),
      instructions: JSON.stringify(selfDesignContextPack.instructions),
      generatedMarkdown: selfDesignContextPack.generatedMarkdown
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
