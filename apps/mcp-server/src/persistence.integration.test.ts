import { PrismaClient } from "@prisma/client";
import { scopeById, type ArchitectureScopeRef, type ContextPack, type DomainModel, type Proposal } from "@specforge/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deletePersistedDesignData,
  disconnectMcpPersistence,
  ensureMcpPersistenceSchema,
  getPersistedAsset,
  listPersistedAssetLinks,
  prisma,
  upsertAssetLink,
  upsertContextPack,
  upsertDesignAsset,
  upsertProposal
} from "./persistence";

const testSchema = "specforge_scope_identity_test";
const databaseUrl = process.env.DATABASE_URL ?? "";
const parsedUrl = databaseUrl ? new URL(databaseUrl) : null;
const integrationEnabled = parsedUrl?.searchParams.get("schema") === testSchema;
if (parsedUrl) parsedUrl.searchParams.set("schema", "public");
const admin = integrationEnabled ? new PrismaClient({ datasourceUrl: parsedUrl!.toString() }) : null;

const designerScope = applicationServiceScope("com.huawei.celon.desiner");
const policyScope = applicationServiceScope("com.huawei.celon.policyhub");
const sharedId = "shared-logical-id";
const legacyId = "legacy-logical-id";
const timestamp = "2026-07-13T00:00:00.000Z";
const migrationSql = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260713233000_migrate_legacy_persisted_identities/migration.sql"),
  "utf8"
);

describe("persisted identity migration SQL", () => {
  it("guards composite constraints when an identically named Prisma index already exists", () => {
    expect(migrationSql).toContain("to_regclass(format('%I.%I', current_schema(), composite_constraint)) IS NULL");
  });
});

describe.runIf(integrationEnabled)("scope-aware persisted identity", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await admin!.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}"`);
    await installLegacySchema();
  });

  afterAll(async () => {
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await admin!.$disconnect();
  });

  it("upgrades legacy global-id tables before scoped Prisma operations", async () => {
    await executeMigrationSql();
    await executeMigrationSql();
    await ensureMcpPersistenceSchema();
    await ensureMcpPersistenceSchema();

    await expect(getPersistedAsset("domain", legacyId, designerScope.applicationServiceId)).resolves.toMatchObject({
      id: legacyId,
      name: "Legacy domain"
    });
    await expect(getPersistedAsset("proposal", legacyId, designerScope.applicationServiceId)).resolves.toMatchObject({
      id: legacyId,
      title: "Legacy proposal"
    });
    await expect(getPersistedAsset("contextPack", legacyId, designerScope.applicationServiceId)).resolves.toMatchObject({
      id: legacyId,
      name: "Legacy pack"
    });
    expect(await listPersistedAssetLinks(designerScope.applicationServiceId)).toContainEqual(
      expect.objectContaining({ id: "legacy-link", sourceId: legacyId, targetId: legacyId })
    );
    const legacyRow = await prisma.designAsset.findUnique({
      where: {
        applicationServiceId_scopePath_id: {
          applicationServiceId: designerScope.applicationServiceId,
          scopePath: designerScope.scopePath,
          id: legacyId
        }
      }
    });
    expect(legacyRow).toMatchObject({
      id: legacyId,
      applicationServiceId: designerScope.applicationServiceId,
      scopePath: designerScope.scopePath
    });
    expect(legacyRow?.dbId).toMatch(/^[0-9a-f-]{36}$/u);

    await upsertDesignAsset({
      assetType: "domain",
      asset: { ...domainForScope(policyScope, "Policy legacy-id domain", "策略旧标识领域"), id: legacyId }
    });
    await expect(getPersistedAsset("domain", legacyId, policyScope.applicationServiceId)).resolves.toMatchObject({
      name: "Policy legacy-id domain"
    });
    await expect(getPersistedAsset("domain", legacyId, designerScope.applicationServiceId)).resolves.toMatchObject({
      name: "Legacy domain"
    });
  });

  it("stores the same asset, proposal, Context Pack, and link ids in two application-service scopes", async () => {
    await upsertDesignAsset({ assetType: "domain", asset: domainForScope(designerScope, "Designer shared domain", "Designer 共享领域") });
    await upsertDesignAsset({ assetType: "domain", asset: domainForScope(policyScope, "Policy shared domain", "策略共享领域") });
    await upsertProposal({ proposal: proposalForScope(designerScope, "Designer shared proposal", "Designer 共享提案") });
    await upsertProposal({ proposal: proposalForScope(policyScope, "Policy shared proposal", "策略共享提案") });
    await upsertContextPack({ contextPack: contextPackForScope(designerScope, "Designer shared context", "Designer 共享上下文") });
    await upsertContextPack({ contextPack: contextPackForScope(policyScope, "Policy shared context", "策略共享上下文") });
    await upsertAssetLink(linkForScope(designerScope));
    await upsertAssetLink(linkForScope(policyScope));

    await expect(getPersistedAsset("domain", sharedId, designerScope.applicationServiceId)).resolves.toMatchObject({ name: "Designer shared domain" });
    await expect(getPersistedAsset("domain", sharedId, policyScope.applicationServiceId)).resolves.toMatchObject({ name: "Policy shared domain" });
    await expect(getPersistedAsset("proposal", sharedId, designerScope.applicationServiceId)).resolves.toMatchObject({ title: "Designer shared proposal" });
    await expect(getPersistedAsset("proposal", sharedId, policyScope.applicationServiceId)).resolves.toMatchObject({ title: "Policy shared proposal" });
    await expect(getPersistedAsset("contextPack", sharedId, designerScope.applicationServiceId)).resolves.toMatchObject({ name: "Designer shared context" });
    await expect(getPersistedAsset("contextPack", sharedId, policyScope.applicationServiceId)).resolves.toMatchObject({ name: "Policy shared context" });
    expect(await listPersistedAssetLinks(designerScope.applicationServiceId)).toContainEqual(
      expect.objectContaining({ sourceId: sharedId, targetId: sharedId })
    );
    expect(await listPersistedAssetLinks(policyScope.applicationServiceId)).toContainEqual(
      expect.objectContaining({ sourceId: sharedId, targetId: sharedId })
    );
  });

  it("keeps Context Pack payload and legacy columns aligned when proposalId changes", async () => {
    const id = "context-pack-proposal-update";
    const initialPack = {
      ...contextPackForScope(designerScope, "Initial proposal context", "\u521d\u59cb\u63d0\u6848\u4e0a\u4e0b\u6587"),
      id,
      proposalId: "proposal-v1"
    };
    const changedPack = {
      ...initialPack,
      proposalId: "proposal-v2",
      name: "Updated proposal context",
      summary: "Context for the updated proposal."
    };

    await upsertContextPack({ contextPack: initialPack });
    await upsertContextPack({ contextPack: changedPack });

    const where = {
      applicationServiceId_scopePath_id: {
        applicationServiceId: designerScope.applicationServiceId,
        scopePath: designerScope.scopePath,
        id
      }
    };
    const persisted = await prisma.contextPack.findUniqueOrThrow({ where });
    expect(persisted.proposalId).toBe("proposal-v2");
    expect(JSON.parse(persisted.payload ?? "{}")).toMatchObject({ proposalId: "proposal-v2" });

    await prisma.contextPack.update({ where, data: { payload: null } });
    await expect(getPersistedAsset("contextPack", id, designerScope.applicationServiceId)).resolves.toMatchObject({
      proposalId: "proposal-v2",
      name: "Updated proposal context",
      summary: "Context for the updated proposal."
    });
  });

  it("cleans only the exact scope and preserves a sibling scope plus a near-prefix row", async () => {
    const nearPrefixScopePath = `${designerScope.scopePath}-near`;
    const nearPrefixAsset = domainForScope(designerScope, "Near-prefix shared domain", "近似前缀共享领域");
    nearPrefixAsset.architectureScope = {
      applicationServiceId: designerScope.applicationServiceId,
      scopePath: nearPrefixScopePath
    };
    await prisma.designAsset.create({
      data: {
        id: sharedId,
        type: "domain",
        name: nearPrefixAsset.name,
        description: nearPrefixAsset.description,
        domainId: nearPrefixAsset.domainId,
        payload: JSON.stringify(nearPrefixAsset),
        applicationServiceId: designerScope.applicationServiceId,
        scopePath: nearPrefixScopePath,
        createdAt: new Date(nearPrefixAsset.createdAt),
        updatedAt: new Date(nearPrefixAsset.updatedAt)
      }
    });

    await deletePersistedDesignData({
      architectureScope: designerScope,
      assetIds: [sharedId],
      proposalIds: [sharedId],
      contextPackIds: [sharedId]
    });

    await expect(getPersistedAsset("domain", sharedId, designerScope.applicationServiceId)).rejects.toThrow("Asset not found");
    await expect(getPersistedAsset("domain", sharedId, policyScope.applicationServiceId)).resolves.toMatchObject({ name: "Policy shared domain" });
    await expect(getPersistedAsset("proposal", sharedId, policyScope.applicationServiceId)).resolves.toMatchObject({ title: "Policy shared proposal" });
    await expect(getPersistedAsset("contextPack", sharedId, policyScope.applicationServiceId)).resolves.toMatchObject({ name: "Policy shared context" });
    expect(await listPersistedAssetLinks(designerScope.applicationServiceId)).toEqual([
      expect.objectContaining({ id: "legacy-link", sourceId: legacyId, targetId: legacyId })
    ]);
    expect(await listPersistedAssetLinks(policyScope.applicationServiceId)).toHaveLength(1);
    await expect(prisma.designAsset.findFirst({
      where: {
        id: sharedId,
        applicationServiceId: designerScope.applicationServiceId,
        scopePath: nearPrefixScopePath
      }
    })).resolves.not.toBeNull();
  });
});

async function executeMigrationSql() {
  const blockEnd = "END $$;";
  const blockEndIndex = migrationSql.indexOf(blockEnd) + blockEnd.length;
  if (blockEndIndex < blockEnd.length) throw new Error("Migration DO block terminator not found.");
  await prisma.$executeRawUnsafe(migrationSql.slice(0, blockEndIndex));
  await prisma.$executeRawUnsafe(migrationSql.slice(blockEndIndex).trim());
}

async function installLegacySchema() {
  await prisma.$executeRawUnsafe(`CREATE TABLE "DesignAsset" (
    id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, code TEXT,
    description TEXT NOT NULL, "domainId" TEXT, "applicationServiceId" TEXT, "scopePath" TEXT,
    payload TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE "Proposal" (
    id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
    "domainId" TEXT, "applicationServiceId" TEXT, "scopePath" TEXT, payload TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE "ContextPack" (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, "proposalId" TEXT NOT NULL, "targetAgent" TEXT NOT NULL,
    summary TEXT NOT NULL, "includedAssets" TEXT NOT NULL, constraints TEXT NOT NULL, instructions TEXT NOT NULL,
    "generatedMarkdown" TEXT NOT NULL, "applicationServiceId" TEXT, "scopePath" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE "AssetLink" (
    id TEXT PRIMARY KEY NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "relationType" TEXT NOT NULL,
    description TEXT, "applicationServiceId" TEXT, "scopePath" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const legacyDomain = { ...domainForScope(designerScope, "Legacy domain", "旧版领域"), id: legacyId };
  const legacyProposal = { ...proposalForScope(designerScope, "Legacy proposal", "旧版提案"), id: legacyId };
  await prisma.$executeRawUnsafe(
    `INSERT INTO "DesignAsset" (id, type, name, description, payload) VALUES ($1, 'domain', $2, $3, $4)`,
    legacyId,
    legacyDomain.name,
    legacyDomain.description,
    JSON.stringify(legacyDomain)
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Proposal" (id, title, description, status, payload) VALUES ($1, $2, $3, 'draft', $4)`,
    legacyId,
    legacyProposal.title,
    legacyProposal.description,
    JSON.stringify(legacyProposal)
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ContextPack" (id, name, "proposalId", "targetAgent", summary, "includedAssets", constraints, instructions, "generatedMarkdown")
     VALUES ($1, 'Legacy pack', $1, 'codex', 'Legacy summary', '[]', '[]', '[]', '# Legacy')`,
    legacyId
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AssetLink" (id, "sourceType", "sourceId", "targetType", "targetId", "relationType")
     VALUES ('legacy-link', 'proposal', $1, 'domain', $1, 'impacts')`,
    legacyId
  );
  for (const table of ["DesignAsset", "Proposal", "ContextPack", "AssetLink"]) {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "${table}_applicationServiceId_scopePath_id_key"
       ON "${table}"("applicationServiceId", "scopePath", id)`
    );
  }
}

function applicationServiceScope(id: string): ArchitectureScopeRef {
  const scope = scopeById(id);
  if (!scope) throw new Error(`Missing test scope: ${id}`);
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

function domainForScope(scope: ArchitectureScopeRef, name: string, zhName: string): DomainModel {
  return {
    id: sharedId,
    name,
    description: `${name} description.`,
    code: "SHARED_DOMAIN",
    boundedContext: "SharedDomain",
    owner: "Scope Identity Test",
    entities: ["SharedEntity"],
    valueObjects: ["SharedId"],
    domainServices: ["SharedService"],
    businessCapabilities: ["Test scoped identity"],
    glossaryTerms: ["Shared Entity"],
    createdAt: timestamp,
    updatedAt: timestamp,
    architectureScope: scope,
    localizedContent: {
      zh: {
        name: zhName,
        description: `${zhName}说明。`,
        entities: ["共享实体"],
        valueObjects: ["共享标识"],
        domainServices: ["共享服务"],
        businessCapabilities: ["验证范围身份"],
        glossaryTerms: ["共享实体"]
      }
    }
  };
}

function proposalForScope(scope: ArchitectureScopeRef, title: string, zhTitle: string): Proposal {
  return {
    id: sharedId,
    name: title,
    title,
    description: `${title} description.`,
    background: "Scoped persistence requires independent logical identities.",
    goal: "Verify the same proposal id can exist in two application services.",
    nonGoal: "Do not change proposal workflow semantics.",
    scope: "Persistence identity integration test.",
    impactedAssets: [{ type: "domain", id: sharedId, label: title }],
    specChanges: ["Use a scope-aware composite database identity."],
    risks: ["An unscoped query could select the wrong proposal."],
    rolloutPlan: "Verify in an isolated PostgreSQL schema.",
    rollbackPlan: "Drop the isolated test schema.",
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    architectureScope: scope,
    localizedContent: {
      zh: {
        name: zhTitle,
        title: zhTitle,
        description: `${zhTitle}说明。`,
        background: "范围持久化需要独立的逻辑身份。",
        goal: "验证两个应用服务可以使用相同提案标识。",
        nonGoal: "不改变提案流程语义。",
        scope: "持久化身份集成测试。",
        specChanges: ["使用包含范围的数据库复合身份。"],
        risks: ["无范围查询可能选中错误提案。"],
        rolloutPlan: "在隔离的 PostgreSQL schema 中验证。",
        rollbackPlan: "删除隔离测试 schema。"
      }
    }
  };
}

function contextPackForScope(scope: ArchitectureScopeRef, name: string, zhName: string): ContextPack {
  return {
    id: sharedId,
    proposalId: sharedId,
    name,
    summary: `${name} summary.`,
    targetAgent: "codex",
    includedAssets: [{ type: "domain", id: sharedId, label: name }],
    constraints: ["Keep scope identity exact."],
    instructions: ["Read and write through the scoped composite key."],
    generatedMarkdown: `# ${name}`,
    createdAt: timestamp,
    architectureScope: scope,
    localizedContent: {
      zh: {
        name: zhName,
        summary: `${zhName}摘要。`,
        constraints: ["保持范围身份精确匹配。"],
        instructions: ["通过范围复合键读写。"],
        generatedMarkdown: `# ${zhName}`
      }
    }
  };
}

function linkForScope(architectureScope: ArchitectureScopeRef) {
  return {
    sourceType: "proposal",
    sourceId: sharedId,
    targetType: "domain",
    targetId: sharedId,
    relationType: "impacts",
    architectureScope
  };
}
