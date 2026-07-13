import { PrismaClient } from "@prisma/client";
import { scopeById, type ArchitectureScopeRef, type ContextPack, type DomainModel, type Proposal } from "@specforge/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deletePersistedDesignData,
  disconnectMcpPersistence,
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
const timestamp = "2026-07-13T00:00:00.000Z";

describe.runIf(integrationEnabled)("scope-aware persisted identity", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await admin!.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}"`);
  });

  afterAll(async () => {
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await admin!.$disconnect();
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
    expect(await listPersistedAssetLinks(designerScope.applicationServiceId)).toHaveLength(1);
    expect(await listPersistedAssetLinks(policyScope.applicationServiceId)).toHaveLength(1);
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
    expect(await listPersistedAssetLinks(designerScope.applicationServiceId)).toHaveLength(0);
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
