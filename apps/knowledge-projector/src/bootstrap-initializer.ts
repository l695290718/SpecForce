import { PrismaClient, type Prisma } from "@prisma/client";
import {
  defaultHuaweiActor,
  huaweiArchitectureScopes,
  localizeAsset,
  normalizeAssetType,
  seedHuaweiActor,
  type ArchitectureScopeRef,
  type Asset,
  type AssetType
} from "@specforge/core";
import { createTrustedRelationshipExecutionContext, RelationshipCommandService, type UpsertRelationshipCommand } from "../../mcp-server/src/relationships/command-service";
import { PrismaRelationshipRepository } from "../../mcp-server/src/relationships/repository";
import { normalizeLegacyAssetLink } from "../../mcp-server/src/relationships/legacy-migration";
import {
  architectureChangeProposals,
  selfDesignAdrs,
  selfDesignApis,
  selfDesignAssetLinks,
  selfDesignBusinessRules,
  selfDesignContextPack,
  selfDesignDataModels,
  selfDesignDomain,
  selfDesignEvents,
  selfDesignIntegration,
  selfDesignObservability,
  selfDesignProposal,
  selfDesignQualityRequirements,
  selfDesignStateMachines
} from "../../../prisma/data/specforge-self-design";
import { createSeedConfiguration, defaultArchitectureScope } from "../../mcp-server/src/localization-report";
import { validateAssetLocalization } from "@specforge/core";

const configuration = createSeedConfiguration({
  architectureChangeProposals,
  selfDesignAdrs,
  selfDesignApis,
  selfDesignBusinessRules,
  selfDesignContextPack,
  selfDesignDataModels,
  selfDesignDomain,
  selfDesignEvents,
  selfDesignIntegration,
  selfDesignObservability,
  selfDesignProposal,
  selfDesignQualityRequirements,
  selfDesignStateMachines
});

export const BOOTSTRAP_KEY = "specforge-default-bootstrap";
export const DEFAULT_BOOTSTRAP_VERSION = "2026-08-12.v1";
const BOOTSTRAP_LOCK_KEY = "specforge:deployment-bootstrap:v1";
const RUNNING_LEASE_MS = 10 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type SeedEntry = { assetType: AssetType; asset: Asset; scope: ArchitectureScopeRef };

export interface BootstrapCounts {
  architectureScopes: number;
  designAssets: number;
  proposals: number;
  contextPacks: number;
  assetLinks: number;
}

export interface BootstrapResult {
  status: "COMPLETED" | "SKIPPED";
  version: string;
  counts: BootstrapCounts;
}

type BootstrapOperation = "INITIALIZE" | "ADOPT_EXISTING";

export type BootstrapDatabaseClassification = "FRESH" | "COMPLETED" | "RUNNING" | "RETRYABLE" | "NON_EMPTY_UNINITIALIZED";

export function classifyBootstrapDatabase(input: {
  status?: string;
  authoredRows: number;
  startedAt?: Date | null;
  now?: Date;
}): BootstrapDatabaseClassification {
  if (input.status === "COMPLETED") return "COMPLETED";
  if (!input.status && input.authoredRows > 0) return "NON_EMPTY_UNINITIALIZED";
  if (input.status === "RUNNING" && input.startedAt && (input.now ?? new Date()).getTime() - input.startedAt.getTime() < RUNNING_LEASE_MS) return "RUNNING";
  if (input.status === "FAILED" || input.status === "RUNNING") return "RETRYABLE";
  return "FRESH";
}

export async function runFirstStartupBootstrap(
  prisma: PrismaClient,
  version = process.env.SPECFORGE_BOOTSTRAP_VERSION || DEFAULT_BOOTSTRAP_VERSION
): Promise<BootstrapResult> {
  await ensureBootstrapTable(prisma);
  for (const entry of buildSeedEntries()) validateAssetLocalization(entry.assetType, entry.asset);
  validateAssetLocalization("proposal", configuration.selfDesignProposal);
  for (const proposal of configuration.architectureChangeProposals) validateAssetLocalization("proposal", proposal);
  validateAssetLocalization("contextPack", configuration.selfDesignContextPack);
  const claim = await claimBootstrap(prisma, version);
  if (claim.status === "SKIPPED") {
    return { status: "SKIPPED", version: claim.version, counts: parseCounts(claim.counts) };
  }

  if (claim.operation === "ADOPT_EXISTING") {
    try {
      await ensureCanonicalRelationshipProjection(prisma);
      const counts = await prisma.$transaction((transaction) => countCatalog(transaction));
      await prisma.$executeRawUnsafe(
        `UPDATE "DeploymentBootstrap" SET "status" = 'COMPLETED', "counts" = $1, "errorMessage" = NULL, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "bootstrapKey" = $2`,
        JSON.stringify(counts), BOOTSTRAP_KEY
      );
      return { status: "COMPLETED", version, counts };
    } catch (error) {
      const message = sanitizeError(error);
      await prisma.$executeRawUnsafe(
        `UPDATE "DeploymentBootstrap" SET "status" = 'FAILED', "errorMessage" = $1, "completedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "bootstrapKey" = $2`,
        message, BOOTSTRAP_KEY
      );
      throw new Error(`EXISTING_DATABASE_ADOPTION_FAILED: ${message}`);
    }
  }

  try {
    const counts = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", BOOTSTRAP_LOCK_KEY);
      return initializeCatalog(transaction, version);
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "DeploymentBootstrap" SET "status" = 'COMPLETED', "counts" = $1, "errorMessage" = NULL, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "bootstrapKey" = $2`,
      JSON.stringify(counts), BOOTSTRAP_KEY
    );
    return { status: "COMPLETED", version, counts };
  } catch (error) {
    const message = sanitizeError(error);
    await prisma.$executeRawUnsafe(
      `UPDATE "DeploymentBootstrap" SET "status" = 'FAILED', "errorMessage" = $1, "completedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "bootstrapKey" = $2`,
      message, BOOTSTRAP_KEY
    );
    throw new Error(`FIRST_STARTUP_BOOTSTRAP_FAILED: ${message}`);
  }
}

async function claimBootstrap(prisma: PrismaClient, version: string): Promise<{ status: "CLAIMED" | "SKIPPED"; operation?: BootstrapOperation; version: string; counts: string }> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", BOOTSTRAP_LOCK_KEY);
    const existing = await bootstrapState(transaction);
    const authoredRows = await countAuthoredRows(transaction);
    const classification = classifyBootstrapDatabase({ status: existing?.status, authoredRows, startedAt: existing?.startedAt });
    if (classification === "COMPLETED" && existing) return { status: "SKIPPED", version: existing.version, counts: existing.counts };
    if (classification === "RUNNING") throw new Error("BOOTSTRAP_ALREADY_RUNNING");
    const adoptExisting = process.env.SPECFORGE_BOOTSTRAP_ADOPT_EXISTING === "1";
    if (classification === "NON_EMPTY_UNINITIALIZED" && !adoptExisting) throw new Error(`NON_EMPTY_UNINITIALIZED: authoredRows=${authoredRows}`);
    if (existing) {
      await transaction.$executeRawUnsafe(
        `UPDATE "DeploymentBootstrap" SET "status" = 'RUNNING', "version" = $1, "attemptCount" = "attemptCount" + 1, "startedAt" = CURRENT_TIMESTAMP, "errorMessage" = NULL, "completedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "bootstrapKey" = $2`,
        version, BOOTSTRAP_KEY
      );
    } else {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DeploymentBootstrap" ("bootstrapKey", "status", "version", "attemptCount", "counts", "startedAt", "createdAt", "updatedAt") VALUES ($1, 'RUNNING', $2, 1, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        BOOTSTRAP_KEY, version
      );
    }
    return { status: "CLAIMED", operation: classification === "NON_EMPTY_UNINITIALIZED" ? "ADOPT_EXISTING" : "INITIALIZE", version, counts: existing?.counts ?? "{}" };
  });
}

async function ensureBootstrapTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DeploymentBootstrap" (
      "bootstrapKey" TEXT NOT NULL PRIMARY KEY,
      "status" TEXT NOT NULL,
      "version" TEXT NOT NULL,
      "attemptCount" INTEGER NOT NULL DEFAULT 0,
      "counts" TEXT NOT NULL DEFAULT '{}',
      "errorMessage" TEXT,
      "startedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeploymentBootstrap_status_idx" ON "DeploymentBootstrap"("status")`);
}

type BootstrapStateRow = { status: string; version: string; counts: string; startedAt: Date | null };

async function bootstrapState(client: Prisma.TransactionClient): Promise<BootstrapStateRow | undefined> {
  const rows = await client.$queryRawUnsafe<BootstrapStateRow[]>(
    `SELECT "status", "version", "counts", "startedAt" FROM "DeploymentBootstrap" WHERE "bootstrapKey" = $1`,
    BOOTSTRAP_KEY
  );
  return rows[0];
}

async function initializeCatalog(transaction: Tx, version: string): Promise<BootstrapCounts> {
  for (const scope of huaweiArchitectureScopes) {
    await transaction.architectureScope.upsert({
      where: { id: scope.id },
      create: { ...scope },
      update: { code: scope.code, name: scope.name, description: scope.description, owner: scope.owner, level: scope.level, parentId: scope.parentId, scopePath: scope.scopePath }
    });
  }
  for (const actor of [defaultHuaweiActor, seedHuaweiActor]) {
    for (const grant of actor.grants) {
      await transaction.actorScopeGrant.upsert({
        where: { actorType_actorId_scopeId_action: { actorType: actor.actorType, actorId: actor.actorId, scopeId: grant.scopeId, action: grant.action } },
        create: { actorType: actor.actorType, actorId: actor.actorId, scopeId: grant.scopeId, action: grant.action },
        update: {}
      });
    }
  }

  const entries = buildSeedEntries();
  for (const entry of entries) await upsertAsset(transaction, entry);
  for (const proposal of [configuration.selfDesignProposal, ...configuration.architectureChangeProposals]) {
    await upsertProposal(transaction, proposal, defaultArchitectureScope);
  }
  await upsertContextPack(transaction, configuration.selfDesignContextPack, defaultArchitectureScope);
  for (const link of selfDesignAssetLinks) await upsertAssetLink(transaction, link, defaultArchitectureScope);

  const counts = await countCatalog(transaction);
  if (counts.designAssets < entries.length || counts.proposals < 1 + configuration.architectureChangeProposals.length || counts.contextPacks < 1) {
    throw new Error(`BOOTSTRAP_INVENTORY_MISMATCH: version=${version}`);
  }
  return counts;
}

async function ensureCanonicalRelationshipProjection(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const [assets, proposals, contextPacks, links] = await Promise.all([
      transaction.designAsset.findMany(),
      transaction.proposal.findMany(),
      transaction.contextPack.findMany(),
      transaction.assetLink.findMany()
    ]);
    for (const row of assets) {
      await bootstrapRelationshipService(transaction, { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }).upsertAssetGraph({
        channel: "bootstrap-repair",
        correlationId: `deployment-bootstrap-repair:asset:${row.type}:${row.id}`,
        idempotencyKey: `deployment-bootstrap-repair:asset:${row.type}:${row.id}:${row.updatedAt.toISOString()}`,
        assetType: normalizeAssetType(row.type),
        asset: JSON.parse(row.payload ?? "{}") as Asset
      });
    }
    for (const row of proposals) {
      await bootstrapRelationshipService(transaction, { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }).upsertAssetGraph({
        channel: "bootstrap-repair",
        correlationId: `deployment-bootstrap-repair:asset:proposal:${row.id}`,
        idempotencyKey: `deployment-bootstrap-repair:asset:proposal:${row.id}:${row.updatedAt.toISOString()}`,
        assetType: "proposal",
        asset: JSON.parse(row.payload ?? "{}") as Asset
      });
    }
    for (const row of contextPacks) {
      await bootstrapRelationshipService(transaction, { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }).upsertAssetGraph({
        channel: "bootstrap-repair",
        correlationId: `deployment-bootstrap-repair:asset:contextPack:${row.id}`,
        idempotencyKey: `deployment-bootstrap-repair:asset:contextPack:${row.id}:${row.createdAt.toISOString()}`,
        assetType: "contextPack",
        asset: JSON.parse(row.payload ?? "{}") as Asset
      });
    }
    for (const row of links) {
      const scope = { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath };
      const service = bootstrapRelationshipService(transaction, scope);
      for (const normalized of normalizeLegacyAssetLink({ sourceType: row.sourceType, sourceId: row.sourceId, targetType: row.targetType, targetId: row.targetId, relationType: row.relationType, ...(row.description ? { description: row.description } : {}), architectureScope: scope })) {
        await service.upsertLegacyRelationship(legacyRelationshipCommand(normalized, row.id));
      }
    }
  }, { maxWait: 10_000, timeout: 120_000 });
}

function buildSeedEntries(): SeedEntry[] {
  const entries: SeedEntry[] = [];
  const add = (assetType: AssetType, asset: Asset, scope: ArchitectureScopeRef) => entries.push({ assetType, asset, scope });
  for (const [assetType, assets] of configuration.designerAssetGroups) for (const asset of assets) add(assetType, asset as Asset, defaultArchitectureScope);
  const serviceScopes = new Map(huaweiArchitectureScopes.filter((scope) => scope.level === "applicationService").map((scope) => [scope.id, { applicationServiceId: scope.id, scopePath: scope.scopePath }]));
  for (const service of configuration.mockServiceSeeds) {
    const scope = serviceScopes.get(service.scope.applicationServiceId);
    if (!scope) throw new Error(`BOOTSTRAP_SCOPE_NOT_FOUND: ${service.scope.applicationServiceId}`);
    add("domain", service.domain as Asset, scope);
    for (const [assetType, asset] of service.assets) add(assetType, asset as Asset, scope);
  }
  return entries;
}

async function upsertAsset(transaction: Tx, entry: SeedEntry): Promise<void> {
  const scoped = { ...(entry.asset as unknown as Record<string, unknown>), architectureScope: entry.scope } as Asset;
  const canonical = localizeAsset(entry.assetType, scoped as never, "en") as Asset & Record<string, unknown>;
  await transaction.designAsset.upsert({
    where: { applicationServiceId_scopePath_id: { applicationServiceId: entry.scope.applicationServiceId, scopePath: entry.scope.scopePath, id: canonical.id } },
    create: { id: canonical.id, type: entry.assetType, name: assetName(canonical), code: stringValue(canonical.code), description: stringValue(canonical.description) ?? "", domainId: stringValue(canonical.domainId), applicationServiceId: entry.scope.applicationServiceId, scopePath: entry.scope.scopePath, payload: JSON.stringify(canonical), createdAt: dateValue(canonical.createdAt), updatedAt: dateValue(canonical.updatedAt) },
    update: { type: entry.assetType, name: assetName(canonical), code: stringValue(canonical.code), description: stringValue(canonical.description) ?? "", domainId: stringValue(canonical.domainId), payload: JSON.stringify(canonical), updatedAt: dateValue(canonical.updatedAt) }
  });
  await bootstrapRelationshipService(transaction, entry.scope).upsertAssetGraph({
    channel: "bootstrap",
    correlationId: `deployment-bootstrap:${entry.assetType}:${canonical.id}`,
    idempotencyKey: `deployment-bootstrap:asset:${entry.assetType}:${canonical.id}:${dateValue(canonical.updatedAt).toISOString()}`,
    assetType: entry.assetType,
    asset: scoped
  });
}

async function upsertProposal(transaction: Tx, proposal: Asset, scope: ArchitectureScopeRef): Promise<void> {
  const scoped = { ...(proposal as unknown as Record<string, unknown>), architectureScope: scope } as Asset;
  const canonical = localizeAsset("proposal", scoped as never, "en") as Asset & Record<string, unknown>;
  await transaction.proposal.upsert({
    where: { applicationServiceId_scopePath_id: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id: canonical.id } },
    create: { id: canonical.id, title: stringValue(canonical.title) ?? canonical.id, description: stringValue(canonical.description) ?? "", status: stringValue(canonical.status) ?? "draft", domainId: stringValue(canonical.domainId), applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, payload: JSON.stringify(canonical), createdAt: dateValue(canonical.createdAt), updatedAt: dateValue(canonical.updatedAt) },
    update: { title: stringValue(canonical.title) ?? canonical.id, description: stringValue(canonical.description) ?? "", status: stringValue(canonical.status) ?? "draft", domainId: stringValue(canonical.domainId), payload: JSON.stringify(canonical), updatedAt: dateValue(canonical.updatedAt) }
  });
}

async function upsertContextPack(transaction: Tx, pack: Asset, scope: ArchitectureScopeRef): Promise<void> {
  const scoped = { ...(pack as unknown as Record<string, unknown>), architectureScope: scope } as Asset;
  const canonical = localizeAsset("contextPack", scoped as never, "en") as Asset & Record<string, unknown>;
  await transaction.contextPack.upsert({
    where: { applicationServiceId_scopePath_id: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id: canonical.id } },
    create: { id: canonical.id, name: stringValue(canonical.name) ?? canonical.id, proposalId: stringValue(canonical.proposalId) ?? "", targetAgent: stringValue(canonical.targetAgent) ?? "", summary: stringValue(canonical.summary) ?? "", includedAssets: JSON.stringify(canonical.includedAssets ?? []), constraints: JSON.stringify(canonical.constraints ?? []), instructions: JSON.stringify(canonical.instructions ?? []), generatedMarkdown: stringValue(canonical.generatedMarkdown) ?? "", payload: JSON.stringify(canonical), applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, createdAt: dateValue(canonical.createdAt) },
    update: { name: stringValue(canonical.name) ?? canonical.id, proposalId: stringValue(canonical.proposalId) ?? "", targetAgent: stringValue(canonical.targetAgent) ?? "", summary: stringValue(canonical.summary) ?? "", includedAssets: JSON.stringify(canonical.includedAssets ?? []), constraints: JSON.stringify(canonical.constraints ?? []), instructions: JSON.stringify(canonical.instructions ?? []), generatedMarkdown: stringValue(canonical.generatedMarkdown) ?? "", payload: JSON.stringify(canonical) }
  });
}

async function upsertAssetLink(transaction: Tx, link: typeof selfDesignAssetLinks[number], scope: ArchitectureScopeRef): Promise<void> {
  const id = `${link.sourceType}:${link.sourceId}:${link.relationType}:${link.targetType}:${link.targetId}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
  await transaction.assetLink.upsert({
    where: { applicationServiceId_scopePath_id: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id } },
    create: { id, sourceType: link.sourceType, sourceId: link.sourceId, targetType: link.targetType, targetId: link.targetId, relationType: link.relationType, description: link.description, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
    update: { sourceType: link.sourceType, sourceId: link.sourceId, targetType: link.targetType, relationType: link.relationType, description: link.description }
  });
  const relationshipService = bootstrapRelationshipService(transaction, scope);
  for (const normalized of normalizeLegacyAssetLink({ ...link, architectureScope: scope })) {
    await relationshipService.upsertLegacyRelationship(legacyRelationshipCommand(normalized, id));
  }
}

function bootstrapRelationshipService(transaction: Tx, scope: ArchitectureScopeRef): RelationshipCommandService {
  return new RelationshipCommandService(
    new PrismaRelationshipRepository(transaction),
    createTrustedRelationshipExecutionContext({
      enterpriseId: process.env.SPECFORGE_ENTERPRISE_ID ?? "legacy-enterprise",
      scope,
      actor: defaultHuaweiActor
    })
  );
}

function legacyRelationshipCommand(link: ReturnType<typeof normalizeLegacyAssetLink>[number], assetLinkId: string): UpsertRelationshipCommand {
  const sourceType = normalizeAssetType(link.sourceType);
  const targetType = normalizeAssetType(link.targetType);
  const scope = link.architectureScope;
  if (!scope) throw new Error("BOOTSTRAP_RELATIONSHIP_SCOPE_REQUIRED");
  return {
    channel: "bootstrap",
    correlationId: `deployment-bootstrap:legacy-link:${assetLinkId}:${link.relationType}`,
    idempotencyKey: `deployment-bootstrap:legacy-link:${assetLinkId}:${link.relationType}`,
    source: { identity: { ...scope, nodeType: sourceType, logicalId: link.sourceId, rootAssetType: sourceType, rootAssetId: link.sourceId } },
    target: { identity: { ...scope, nodeType: targetType, logicalId: link.targetId, rootAssetType: targetType, rootAssetId: link.targetId } },
    relationType: link.relationType,
    relationshipSource: "legacy-asset-link",
    sourceReference: `legacy-asset-link:${assetLinkId}`,
    metadata: link.description ? { description: link.description } : {}
  };
}

async function countAuthoredRows(transaction: Tx): Promise<number> {
  const [assets, proposals, packs, links] = await Promise.all([transaction.designAsset.count(), transaction.proposal.count(), transaction.contextPack.count(), transaction.assetLink.count()]);
  return assets + proposals + packs + links;
}

async function countCatalog(transaction: Tx): Promise<BootstrapCounts> {
  const [architectureScopes, designAssets, proposals, contextPacks, assetLinks] = await Promise.all([transaction.architectureScope.count(), transaction.designAsset.count(), transaction.proposal.count(), transaction.contextPack.count(), transaction.assetLink.count()]);
  return { architectureScopes, designAssets, proposals, contextPacks, assetLinks };
}

function assetName(asset: Asset & Record<string, unknown>): string { return stringValue(asset.name) ?? stringValue(asset.title) ?? asset.id; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function dateValue(value: unknown): Date { return typeof value === "string" ? new Date(value) : new Date(); }
function parseCounts(value: string): BootstrapCounts { try { return JSON.parse(value) as BootstrapCounts; } catch { return { architectureScopes: 0, designAssets: 0, proposals: 0, contextPacks: 0, assetLinks: 0 }; } }
function sanitizeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, " ").slice(0, 500); }

if (process.argv[1]?.endsWith("bootstrap-initializer.ts")) {
  const prisma = new PrismaClient();
  runFirstStartupBootstrap(prisma)
    .then((result) => { console.info(JSON.stringify(result)); })
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
