import { defaultHuaweiActor, type ApiContract, type ContextPack, type DataModel, type Proposal } from "@specforge/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deletePersistedDesignData,
  getPersistedAsset,
  prisma,
  renderPersistedAssetAsMarkdown,
  resolveWritableScope,
  searchPersistedDesignAssets,
  upsertAssetLink,
  upsertContextPack,
  upsertDesignAsset,
  upsertProposal
} from "./persistence";

const writableScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;

const now = "2026-07-13T00:00:00.000Z";

const bilingualApi: ApiContract = {
  id: "api-upsert-design-asset",
  name: "Upsert design asset API",
  description: "Writes design assets through the MCP boundary.",
  method: "POST",
  path: "/api/assets/upsert",
  domainId: "domain-design-center",
  providerSystem: "SpecForge Design Center",
  consumers: ["MCP clients"],
  requestSchema: { id: "string" },
  responseSchema: { id: "string" },
  errorCodes: ["INVALID_INPUT"],
  authType: "Bearer token",
  idempotency: "Uses the asset id as the idempotency key.",
  rateLimit: "60 rpm",
  timeout: "2 seconds",
  compatibilityPolicy: "Additive changes only.",
  openapiSpec: "openapi: 3.1.0",
  exposure: "internal",
  createdAt: now,
  updatedAt: now,
  architectureScope: writableScope,
  localizedContent: {
    zh: {
      name: "设计资产写入接口",
      description: "通过 MCP 边界写入设计资产。",
      authType: "Bearer 令牌",
      idempotency: "使用资产 ID 作为幂等键。",
      rateLimit: "每分钟 60 次",
      timeout: "2 秒",
      compatibilityPolicy: "仅允许向后兼容的增量变更。"
    }
  }
};

const bilingualDataModel: DataModel = {
  id: "data-model-ledger-write",
  name: "Ledger customer model",
  description: "Exercises normal data-model graph persistence.",
  code: "LEDGER_CUSTOMER",
  modelType: "logical",
  domainId: "domain-design-center",
  tables: ["customers"],
  entities: ["Customer"],
  fields: [{ fieldName: "id", displayName: "Customer ID", dataType: "uuid", nullable: false, owner: "Design Center" }],
  relationships: [],
  constraints: [],
  dataClassification: "internal",
  lifecycle: "active",
  lineage: "Design Center",
  createdAt: now,
  updatedAt: now,
  architectureScope: writableScope,
  localizedContent: {
    zh: {
      name: "账本客户模型",
      description: "覆盖普通数据模型图持久化。",
      relationships: [],
      constraints: [],
      lifecycle: "active",
      lineage: "Design Center",
      fields: { id: { displayName: "客户标识" } }
    }
  }
};

const bilingualProposal: Proposal = {
  id: "proposal-bilingual-assets",
  name: "Bilingual assets proposal",
  title: "Bilingual assets proposal",
  description: "Adds bilingual MCP-managed assets.",
  background: "Readers need English and Chinese from one record.",
  goal: "Render locale-specific narratives from a canonical asset.",
  nonGoal: "Do not duplicate persisted assets.",
  scope: "MCP persistence and read tooling",
  impactedAssets: [],
  specChanges: ["Validate complete bilingual snapshots before persistence."],
  risks: ["Incomplete overlays could leak partial updates."],
  rolloutPlan: "Ship MCP enforcement before broader consumers.",
  rollbackPlan: "Disable localized renders while preserving canonical payloads.",
  status: "reviewing",
  createdAt: now,
  updatedAt: now,
  architectureScope: writableScope,
  localizedContent: {
    zh: {
      name: "双语资产方案",
      title: "双语资产方案",
      description: "为 MCP 管理的资产增加双语能力。",
      background: "读者需要从一条记录中读取英文和中文。",
      goal: "从规范英文资产渲染本地化叙述。",
      nonGoal: "不复制持久化资产。",
      scope: "MCP 持久化与读取工具",
      specChanges: ["在持久化前校验完整的双语快照。"],
      risks: ["不完整的覆盖层可能导致部分更新泄漏。"],
      rolloutPlan: "先交付 MCP 边界约束，再扩展消费者。",
      rollbackPlan: "保留规范载荷，只关闭本地化渲染。"
    }
  }
};

const bilingualContextPack: ContextPack = {
  id: "ctx-bilingual-assets",
  name: "Bilingual assets implementation context",
  proposalId: "proposal-bilingual-assets",
  targetAgent: "codex",
  summary: "Implementation guidance for canonical English design assets with Chinese overlays.",
  includedAssets: [{ type: "api", id: bilingualApi.id, label: "Upsert design asset API" }],
  constraints: ["Keep technical identifiers unchanged.", "Persist the complete Context Pack payload."],
  instructions: ["Validate localization before writing.", "Prefer the stored payload when reading Context Packs."],
  generatedMarkdown: "# Context\nUse canonical English payloads with localized Chinese overlays.",
  createdAt: now,
  architectureScope: writableScope,
  localizedContent: {
    zh: {
      name: "双语资产实现上下文",
      summary: "用于实现规范英文设计资产和中文覆盖层的上下文说明。",
      constraints: ["保持技术标识不变。", "持久化完整的 Context Pack 载荷。"],
      instructions: ["写入前校验本地化内容。", "读取 Context Pack 时优先使用已存储的完整载荷。"],
      generatedMarkdown: "# 上下文\n使用规范英文载荷，并提供中文本地化覆盖层。"
    }
  }
};

function mockSchemaSetup() {
  vi.spyOn(prisma, "$executeRawUnsafe").mockResolvedValue(0);
  vi.spyOn(prisma, "$transaction").mockImplementation(async (operation) => operation(prisma as never));
  vi.spyOn(prisma.architectureScope, "upsert").mockResolvedValue({} as never);
  vi.spyOn(prisma.actorScopeGrant, "upsert").mockResolvedValue({} as never);
  vi.spyOn(prisma.assetLink, "findMany").mockResolvedValue([] as never);
}

function persistedAssetRow(asset: ApiContract) {
  return {
    id: asset.id,
    type: "api",
    name: asset.name,
    code: null,
    description: asset.description,
    domainId: asset.domainId,
    applicationServiceId: writableScope.applicationServiceId,
    scopePath: writableScope.scopePath,
    payload: JSON.stringify(asset),
    createdAt: new Date(asset.createdAt),
    updatedAt: new Date(asset.updatedAt)
  };
}

function persistedContextPackRow(pack: ContextPack, payload?: string | null) {
  return {
    id: pack.id,
    name: pack.name,
    proposalId: pack.proposalId,
    targetAgent: pack.targetAgent,
    summary: pack.summary,
    includedAssets: JSON.stringify(pack.includedAssets),
    constraints: JSON.stringify(pack.constraints),
    instructions: JSON.stringify(pack.instructions),
    generatedMarkdown: pack.generatedMarkdown,
    payload,
    applicationServiceId: writableScope.applicationServiceId,
    scopePath: writableScope.scopePath,
    createdAt: new Date(pack.createdAt)
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.SPECFORGE_MCP_SEED;
  delete process.env.SPECFORGE_ENTERPRISE_ID;
  vi.restoreAllMocks();
});

describe("resolveWritableScope", () => {
  it("rejects a missing architecture scope", () => {
    expect(() => resolveWritableScope(defaultHuaweiActor, undefined)).toThrow("Architecture scope is required.");
  });

  it("rejects a sibling application service without write permission", () => {
    expect(() => resolveWritableScope(defaultHuaweiActor, { applicationServiceId: "com.huawei.celon.runtime", scopePath: "client-supplied" })).toThrow("Scope write is not authorized.");
  });

  it("keeps rendered zh source json canonical while leaving localized narratives in the markdown body", async () => {
    mockSchemaSetup();
    const findUnique = vi.spyOn(prisma.designAsset, "findUnique").mockResolvedValue(persistedAssetRow(bilingualApi) as never);

    const markdown = await renderPersistedAssetAsMarkdown("api", "api-upsert-design-asset", writableScope.applicationServiceId, "zh");
    const [, sourceJsonBlock = ""] = markdown.split("## Source JSON\n");
    const canonicalJson = JSON.parse(sourceJsonBlock.replace(/^```json\s*/u, "").replace(/\s*```$/u, ""));

    expect(markdown).not.toContain("# Upsert design asset API");
    expect(markdown).not.toContain("## Agent Summary\nWrites design assets through the MCP boundary.");
    expect(canonicalJson.name).toBe("Upsert design asset API");
    expect(canonicalJson.description).toBe("Writes design assets through the MCP boundary.");
    expect(canonicalJson.localizedContent.zh.name).toBe(bilingualApi.localizedContent?.zh?.name);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        applicationServiceId_scopePath_id: {
          applicationServiceId: writableScope.applicationServiceId,
          scopePath: writableScope.scopePath,
          id: bilingualApi.id
        }
      }
    });
  });

  it("preserves strict zh read behavior for non-context-pack assets without localization overlays", async () => {
    mockSchemaSetup();
    vi.spyOn(prisma.designAsset, "findMany").mockResolvedValue([
      {
        ...persistedAssetRow(bilingualApi),
        payload: JSON.stringify({ ...bilingualApi, localizedContent: undefined })
      }
    ] as never);
    vi.spyOn(prisma.proposal, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.contextPack, "findMany").mockResolvedValue([] as never);

    await expect(
      searchPersistedDesignAssets({
        applicationServiceId: writableScope.applicationServiceId,
        assetTypes: ["api"],
        query: "Upsert",
        locale: "zh"
      })
    ).rejects.toMatchObject({
      code: "ASSET_TRANSLATION_REQUIRED",
      assetType: "api",
      assetId: "api-upsert-design-asset",
      path: "localizedContent.zh"
    });
  });
});

describe("scoped seed cleanup", () => {
  it("rejects cleanup outside the seed actor's authorized application services before database access", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const executeSpy = vi.spyOn(prisma, "$executeRawUnsafe");

    await expect(
      deletePersistedDesignData({
        architectureScope: {
          applicationServiceId: "com.huawei.unauthorized",
          scopePath: "pf-huawei/unauthorized/com.huawei.unauthorized"
        },
        assetIds: ["shared-id"]
      })
    ).rejects.toThrow("Scope write is not authorized.");

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("rejects direct cleanup execution when the MCP process is not in seed mode", async () => {
    const executeSpy = vi.spyOn(prisma, "$executeRawUnsafe");

    await expect(deletePersistedDesignData({
      architectureScope: writableScope,
      assetIds: ["shared-id"]
    })).rejects.toThrow("Seed cleanup is not enabled.");

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("deletes matching ids only inside the authorized application service scope", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    mockSchemaSetup();
    const contextDelete = vi.spyOn(prisma.contextPack, "deleteMany").mockResolvedValue({ count: 1 });
    const proposalDelete = vi.spyOn(prisma.proposal, "deleteMany").mockResolvedValue({ count: 1 });
    const assetDelete = vi.spyOn(prisma.designAsset, "deleteMany").mockResolvedValue({ count: 1 });

    await deletePersistedDesignData({
      architectureScope: writableScope,
      assetIds: ["shared-id"],
      proposalIds: ["shared-proposal"],
      contextPackIds: ["shared-pack"]
    });

    const scopedWhere = {
      applicationServiceId: writableScope.applicationServiceId,
      scopePath: writableScope.scopePath
    };
    expect(assetDelete).toHaveBeenCalledWith({
      where: { ...scopedWhere, id: { in: ["shared-id"] } }
    });
    expect(proposalDelete).toHaveBeenCalledWith({
      where: { ...scopedWhere, id: { in: ["shared-proposal"] } }
    });
    expect(contextDelete).toHaveBeenCalledWith({
      where: { ...scopedWhere, id: { in: ["shared-pack"] } }
    });

    const linkDeleteCall = vi.mocked(prisma.$executeRawUnsafe).mock.calls.at(-1);
    expect(linkDeleteCall?.[0]).toContain('"applicationServiceId" = $1');
    expect(linkDeleteCall?.[0]).toContain('"scopePath" = $2');
    expect(linkDeleteCall?.slice(1, 3)).toEqual([
      writableScope.applicationServiceId,
      writableScope.scopePath
    ]);
  });

  it("uses scope-aware composite identities for every persisted upsert", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    const assetUpsert = harness.transaction.designAsset.upsert;
    const proposalUpsert = vi.spyOn(prisma.proposal, "upsert").mockResolvedValue({} as never);
    const contextPackUpsert = vi.spyOn(prisma.contextPack, "upsert").mockResolvedValue({} as never);

    await upsertDesignAsset({ assetType: "api", asset: bilingualApi });
    await upsertProposal({ proposal: bilingualProposal });
    await upsertContextPack({ contextPack: bilingualContextPack });

    const composite = (id: string) => ({
      applicationServiceId: writableScope.applicationServiceId,
      scopePath: writableScope.scopePath,
      id
    });
    expect(assetUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { applicationServiceId_scopePath_id: composite(bilingualApi.id) }
    }));
    expect(proposalUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { applicationServiceId_scopePath_id: composite(bilingualProposal.id) }
    }));
    expect(contextPackUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { applicationServiceId_scopePath_id: composite(bilingualContextPack.id) }
    }));
  });
});

describe("legacy AssetLink ledger synchronization", () => {
  it("routes normal dataModel and API writes through the graph ledger in the aggregate transaction", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();

    await upsertDesignAsset({ assetType: "dataModel", asset: bilingualDataModel });
    await upsertDesignAsset({ assetType: "api", asset: bilingualApi });

    expect(harness.state.designAssets).toHaveLength(2);
    expect(harness.state.nodes).toHaveLength(5);
    expect(harness.state.current).toHaveLength(2);
    expect(harness.state.events).toHaveLength(7);
    expect(harness.state.outbox).toHaveLength(7);
    expect(harness.state.events.filter((event) => event.assetNodeId != null)).toHaveLength(5);
    expect(harness.state.events.filter((event) => event.relationshipId != null)).toHaveLength(2);
  });

  it("uses canonical asset content in the automatic idempotency key when updatedAt is unchanged", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();

    await upsertDesignAsset({ assetType: "dataModel", asset: bilingualDataModel });
    await upsertDesignAsset({ assetType: "dataModel", asset: { ...bilingualDataModel, entities: ["Customer", "Account"] } });

    expect(harness.state.receipts).toHaveLength(2);
    expect(harness.state.receipts.map((receipt) => receipt.graphVersion)).toEqual([1n, 2n]);
    expect(harness.state.current.filter((row) => row.lifecycleStatus === "ACTIVE").length).toBeGreaterThan(2);
  });

  it("rolls back a normal aggregate write when graph projection persistence fails", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness({ failOnEvent: true });

    await expect(upsertDesignAsset({ assetType: "api", asset: bilingualApi })).rejects.toThrow("FORCED_EVENT_FAILURE");

    expect(harness.state.designAssets).toHaveLength(0);
    expect(harness.state.nodes).toHaveLength(0);
    expect(harness.state.events).toHaveLength(0);
    expect(harness.state.outbox).toHaveLength(0);
  });

  it("creates a legacy AssetLink and one normalized current/event/outbox ledger record", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();

    await expect(upsertAssetLink(legacyLinkInput())).resolves.toMatchObject({ relationType: "emits" });

    expect(harness.state.assetLinks).toHaveLength(1);
    expect(harness.state.current).toHaveLength(1);
    expect(harness.state.current[0]).toMatchObject({ relationType: "EMITS", source: "legacy-asset-link", lifecycleStatus: "ACTIVE" });
    expect(harness.state.events).toHaveLength(1);
    expect(harness.state.outbox).toHaveLength(1);
    expect(harness.state.calls.indexOf("lock")).toBeLessThan(harness.state.calls.indexOf("assetLink.upsert"));
  });

  it("updates a backfilled legacy relationship in its recorded enterprise instead of duplicating it", async () => {
    process.env.SPECFORGE_ENTERPRISE_ID = "configured-enterprise";
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    await seedBackfilledLegacyRelationship(harness);

    await upsertAssetLink({ ...legacyLinkInput(), description: "Updated migrated evidence." });

    expect(harness.state.current).toHaveLength(1);
    expect(harness.state.current[0]).toMatchObject({ enterpriseId: "legacy-enterprise", lifecycleStatus: "ACTIVE", version: 2n, metadata: { description: "Updated migrated evidence." } });
    expect(harness.state.current.find((row) => row.enterpriseId === "configured-enterprise")).toBeUndefined();
  });

  it("invalidates a backfilled legacy relationship in its recorded enterprise during cleanup", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    process.env.SPECFORGE_ENTERPRISE_ID = "configured-enterprise";
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    await seedBackfilledLegacyRelationship(harness);

    await deletePersistedDesignData({ architectureScope: writableScope, assetIds: [legacyLinkInput().sourceId] });

    expect(harness.state.current).toHaveLength(1);
    expect(harness.state.current[0]).toMatchObject({ enterpriseId: "legacy-enterprise", lifecycleStatus: "DELETED" });
    expect(harness.state.current.find((row) => row.enterpriseId === "configured-enterprise")).toBeUndefined();
  });

  it("rejects ambiguous historical legacy relationship enterprises", async () => {
    process.env.SPECFORGE_ENTERPRISE_ID = "configured-enterprise";
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    await seedBackfilledLegacyRelationship(harness, "legacy-enterprise");
    await seedBackfilledLegacyRelationship(harness, "another-enterprise");

    await expect(upsertAssetLink(legacyLinkInput())).rejects.toThrow("LEGACY_RELATIONSHIP_AMBIGUOUS");
    expect(harness.state.assetLinks).toHaveLength(1);
  });

  it("updates the ledger current row when a legacy AssetLink description changes", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    await upsertAssetLink(legacyLinkInput());

    await upsertAssetLink({ ...legacyLinkInput(), description: "Updated relationship evidence." });

    expect(harness.state.assetLinks).toHaveLength(1);
    expect(harness.state.current).toHaveLength(1);
    expect(harness.state.current[0]).toMatchObject({ version: 2n, metadata: { description: "Updated relationship evidence." } });
    expect(harness.state.events).toHaveLength(2);
    expect(harness.state.outbox).toHaveLength(2);
  });

  it("invalidates the ledger relationship before deleting a legacy AssetLink", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    await upsertAssetLink(legacyLinkInput());

    await deletePersistedDesignData({ architectureScope: writableScope, assetIds: ["legacy-source-api"] });

    expect(harness.state.assetLinks).toHaveLength(0);
    expect(harness.state.current).toHaveLength(1);
    expect(harness.state.current[0]).toMatchObject({ lifecycleStatus: "DELETED" });
    expect(harness.state.events.at(-1)).toMatchObject({ action: "DELETE" });
    expect(harness.state.outbox.at(-1)).toMatchObject({ eventType: "RELATIONSHIP_DELETE" });
  });

  it("cleans an unsupported historical AssetLink without validating its obsolete relation code", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    const legacy = {
      ...legacyLinkInput(),
      relationType: "retired-custom-code"
    };
    harness.state.assetLinks.push({
      id: "api:legacy-source-api:retired-custom-code:event:legacy-target-event",
      ...legacy,
      applicationServiceId: writableScope.applicationServiceId,
      scopePath: writableScope.scopePath,
      createdAt: new Date(now)
    });
    const sourceNode = await harness.transaction.assetNode.create({ data: {
      enterpriseId: "legacy-enterprise", applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath,
      nodeType: "api", logicalId: legacy.sourceId, rootAssetType: "api", rootAssetId: legacy.sourceId,
      nodePath: `api/${legacy.sourceId}`, displayName: legacy.sourceId, metadata: {}, version: 1n, lifecycleStatus: "ACTIVE"
    } });
    const targetNode = await harness.transaction.assetNode.create({ data: {
      enterpriseId: "legacy-enterprise", applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath,
      nodeType: "event", logicalId: legacy.targetId, rootAssetType: "event", rootAssetId: legacy.targetId,
      nodePath: `event/${legacy.targetId}`, displayName: legacy.targetId, metadata: {}, version: 1n, lifecycleStatus: "ACTIVE"
    } });
    harness.state.current.push({
      enterpriseId: "legacy-enterprise", applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath,
      dbId: "relationship-historical", sourceNodeId: sourceNode.dbId, targetNodeId: targetNode.dbId,
      relationType: legacy.relationType, strength: "weak", confidence: 0, source: "legacy-asset-link",
      sourceReference: `legacy-asset-link:${harness.state.assetLinks[0]!.id}`, lifecycleStatus: "ACTIVE", metadata: {}, version: 1n
    });

    await deletePersistedDesignData({ architectureScope: writableScope, assetIds: [legacy.sourceId] });

    expect(harness.state.assetLinks).toHaveLength(0);
    expect(harness.state.current[0]).toMatchObject({ lifecycleStatus: "DELETED" });
  });

  it("rejects an unsupported new legacy relation code before writing either store", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();

    await expect(upsertAssetLink({ ...legacyLinkInput(), relationType: "depends-on" })).rejects.toThrow("LEGACY_RELATIONSHIP_CODE_UNSUPPORTED");

    expect(harness.state.assetLinks).toHaveLength(0);
    expect(harness.state.current).toHaveLength(0);
    expect(harness.state.events).toHaveLength(0);
  });

  it("replays an unchanged legacy retry without duplicate ledger events or outbox rows", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();

    await upsertAssetLink(legacyLinkInput());
    await upsertAssetLink(legacyLinkInput());

    expect(harness.state.current).toHaveLength(1);
    expect(harness.state.events).toHaveLength(1);
    expect(harness.state.outbox).toHaveLength(1);
  });

  it("rolls back the AssetLink and ledger state when event persistence fails", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness({ failOnEvent: true });

    await expect(upsertAssetLink(legacyLinkInput())).rejects.toThrow("FORCED_EVENT_FAILURE");

    expect(harness.state.assetLinks).toHaveLength(0);
    expect(harness.state.current).toHaveLength(0);
    expect(harness.state.events).toHaveLength(0);
    expect(harness.state.outbox).toHaveLength(0);
  });
});

function legacyLinkInput() {
  return {
    sourceType: "api",
    sourceId: "legacy-source-api",
    targetType: "event",
    targetId: "legacy-target-event",
    relationType: "emits",
    description: "Legacy relationship evidence.",
    architectureScope: writableScope
  };
}

async function seedBackfilledLegacyRelationship(harness: ReturnType<typeof installLegacyLedgerHarness>, enterpriseId = "legacy-enterprise") {
  const link = legacyLinkInput();
  const id = "api:legacy-source-api:emits:event:legacy-target-event";
  if (!harness.state.assetLinks.some((row) => row.id === id)) {
    harness.state.assetLinks.push({ id, ...link, applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath, createdAt: new Date(now) });
  }
  const sourceNode = await harness.transaction.assetNode.create({ data: {
    enterpriseId, applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath,
    nodeType: "api", logicalId: link.sourceId, rootAssetType: "api", rootAssetId: link.sourceId,
    nodePath: `api/${link.sourceId}`, displayName: link.sourceId, metadata: {}, version: 1n, lifecycleStatus: "ACTIVE"
  } });
  const targetNode = await harness.transaction.assetNode.create({ data: {
    enterpriseId, applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath,
    nodeType: "event", logicalId: link.targetId, rootAssetType: "event", rootAssetId: link.targetId,
    nodePath: `event/${link.targetId}`, displayName: link.targetId, metadata: {}, version: 1n, lifecycleStatus: "ACTIVE"
  } });
  harness.state.current.push({
    enterpriseId, applicationServiceId: writableScope.applicationServiceId, scopePath: writableScope.scopePath,
    dbId: `relationship-backfilled-${enterpriseId}`, sourceNodeId: sourceNode.dbId, targetNodeId: targetNode.dbId,
    relationType: "EMITS", strength: "strong", confidence: 1, source: "legacy-asset-link",
    sourceReference: `legacy-asset-link:${id}`, lifecycleStatus: "ACTIVE", metadata: { description: "Backfilled evidence." }, version: 1n
  });
}

function installLegacyLedgerHarness(options: { failOnEvent?: boolean } = {}) {
  const state = {
    designAssets: [] as Array<Record<string, unknown>>,
    assetLinks: [] as Array<Record<string, unknown>>,
    nodes: [] as Array<Record<string, unknown>>,
    current: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    outbox: [] as Array<Record<string, unknown>>,
    receipts: [] as Array<Record<string, unknown>>,
    calls: [] as string[]
  };
  const scopeMatches = (row: Record<string, unknown>, where: Record<string, unknown>) => (
    row.enterpriseId === where.enterpriseId && row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath
  );
  const transaction = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_xact_lock")) state.calls.push("lock");
      if (sql.includes('DELETE FROM "AssetLink"')) state.assetLinks.splice(0);
      return 0;
    }),
    assetLink: {
      upsert: vi.fn(async ({ where, create, update }) => {
        state.calls.push("assetLink.upsert");
        const identity = where.applicationServiceId_scopePath_id;
        const existing = state.assetLinks.find((row) => row.id === identity.id && row.applicationServiceId === identity.applicationServiceId && row.scopePath === identity.scopePath);
        if (existing) Object.assign(existing, update);
        else state.assetLinks.push({ ...create, createdAt: new Date("2026-07-14T00:00:00.000Z") });
        return existing ?? state.assetLinks.at(-1);
      }),
      findMany: vi.fn(async ({ where }) => state.assetLinks.filter((row) => (
        row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath &&
        (where.OR ?? []).some((condition: { sourceId?: { in: string[] }; targetId?: { in: string[] } }) =>
          condition.sourceId?.in.includes(row.sourceId as string) || condition.targetId?.in.includes(row.targetId as string)
        )
      ))),
      deleteMany: vi.fn(async ({ where }) => {
        const removed = state.assetLinks.filter((row) => row.id === where.id && row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath);
        state.assetLinks.splice(0, state.assetLinks.length, ...state.assetLinks.filter((row) => !removed.includes(row)));
        return { count: removed.length };
      })
    },
    contextPack: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    proposal: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    designAsset: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const identity = where.applicationServiceId_scopePath_id;
        const existing = state.designAssets.find((row) => row.id === identity.id && row.applicationServiceId === identity.applicationServiceId && row.scopePath === identity.scopePath);
        if (existing) Object.assign(existing, update);
        else state.designAssets.push({ ...create, createdAt: create.createdAt ?? new Date(), updatedAt: create.updatedAt ?? new Date() });
        return existing ?? state.designAssets.at(-1);
      }),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    assetNode: {
      findUnique: vi.fn(async ({ where }) => state.nodes.find((row) => {
        const identity = where.enterpriseId_applicationServiceId_scopePath_nodeType_logicalId;
        return scopeMatches(row, identity) && row.nodeType === identity.nodeType && row.logicalId === identity.logicalId;
      })),
      create: vi.fn(async ({ data }) => {
        const row = { ...data, dbId: `node-${state.nodes.length + 1}`, createdAt: new Date(), updatedAt: new Date() };
        state.nodes.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = state.nodes.find((node) => node.dbId === where.dbId)!;
        Object.assign(row, data, { version: (row.version as bigint) + 1n });
        return row;
      })
    },
    relationshipCurrent: {
      findUnique: vi.fn(async ({ where }) => state.current.find((row) => {
        const identity = where.enterpriseId_applicationServiceId_scopePath_sourceNodeId_targetNodeId_relationType_source_sourceReference;
        return scopeMatches(row, identity) && row.sourceNodeId === identity.sourceNodeId && row.targetNodeId === identity.targetNodeId && row.relationType === identity.relationType && row.source === identity.source && row.sourceReference === identity.sourceReference;
      })),
      upsert: vi.fn(async ({ where, create, update }) => {
        const identity = where.enterpriseId_applicationServiceId_scopePath_sourceNodeId_targetNodeId_relationType_source_sourceReference;
        const existing = state.current.find((row) => scopeMatches(row, identity) && row.sourceNodeId === identity.sourceNodeId && row.targetNodeId === identity.targetNodeId && row.relationType === identity.relationType && row.source === identity.source && row.sourceReference === identity.sourceReference);
        if (existing) Object.assign(existing, update);
        else state.current.push({ ...create, dbId: `relationship-${state.current.length + 1}`, createdAt: new Date(), updatedAt: new Date() });
        return existing ?? state.current.at(-1);
      }),
      findMany: vi.fn(async ({ where }) => {
        if (where.source === "legacy-asset-link" && where.sourceReference) {
          return state.current.filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath && row.source === where.source && row.sourceReference === where.sourceReference);
        }
        return [];
      })
    },
    relationshipEvent: {
      findUnique: vi.fn(async ({ where }) => state.events.find((row) => {
        const identity = where.enterpriseId_applicationServiceId_scopePath_idempotencyKey;
        return scopeMatches(row, identity) && row.idempotencyKey === identity.idempotencyKey;
      })),
      aggregate: vi.fn(async ({ where }) => ({
        _max: { graphVersion: state.events.filter((row) => scopeMatches(row, where)).reduce<bigint | null>((max, row) => max === null || (row.graphVersion as bigint) > max ? row.graphVersion as bigint : max, null) }
      })),
      create: vi.fn(async ({ data }) => {
        if (options.failOnEvent) throw new Error("FORCED_EVENT_FAILURE");
        const row = { ...data, dbId: `event-${state.events.length + 1}`, createdAt: new Date() };
        state.events.push(row);
        return row;
      })
    },
    relationshipCommandReceipt: {
      findUnique: vi.fn(async ({ where }) => state.receipts.find((row) => {
        const identity = where.enterpriseId_applicationServiceId_scopePath_idempotencyKey;
        return scopeMatches(row, identity) && row.idempotencyKey === identity.idempotencyKey;
      })),
      create: vi.fn(async ({ data }) => {
        const row = { ...data, dbId: `receipt-${state.receipts.length + 1}`, createdAt: new Date(), updatedAt: new Date() };
        state.receipts.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }) => {
        const identity = where.enterpriseId_applicationServiceId_scopePath_dbId;
        const row = state.receipts.find((receipt) => receipt.dbId === identity.dbId && scopeMatches(receipt, identity))!;
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      })
    },
    relationshipOutbox: {
      create: vi.fn(async ({ data }) => {
        const row = { ...data, dbId: `outbox-${state.outbox.length + 1}`, createdAt: new Date(), updatedAt: new Date() };
        state.outbox.push(row);
        return row;
      })
    }
  };
  vi.spyOn(prisma.assetLink, "upsert").mockImplementation(transaction.assetLink.upsert as never);
  vi.spyOn(prisma.assetLink, "findMany").mockImplementation(transaction.assetLink.findMany as never);
  vi.spyOn(prisma.assetLink, "deleteMany").mockImplementation(transaction.assetLink.deleteMany as never);
  vi.spyOn(prisma.contextPack, "deleteMany").mockImplementation(transaction.contextPack.deleteMany as never);
  vi.spyOn(prisma.proposal, "deleteMany").mockImplementation(transaction.proposal.deleteMany as never);
  vi.spyOn(prisma.designAsset, "upsert").mockImplementation(transaction.designAsset.upsert as never);
  vi.spyOn(prisma.designAsset, "deleteMany").mockImplementation(transaction.designAsset.deleteMany as never);
  vi.spyOn(prisma, "$transaction").mockImplementation(async (operation) => {
    const snapshot = structuredClone(state);
    try {
      return await operation(transaction as never);
    } catch (error) {
      state.designAssets.splice(0, state.designAssets.length, ...snapshot.designAssets);
      state.assetLinks.splice(0, state.assetLinks.length, ...snapshot.assetLinks);
      state.nodes.splice(0, state.nodes.length, ...snapshot.nodes);
      state.current.splice(0, state.current.length, ...snapshot.current);
      state.events.splice(0, state.events.length, ...snapshot.events);
      state.outbox.splice(0, state.outbox.length, ...snapshot.outbox);
      state.receipts.splice(0, state.receipts.length, ...snapshot.receipts);
      throw error;
    }
  });
  return { state, transaction };
}

describe("Task 2 MCP bilingual enforcement", () => {
  it("rejects invalid design assets before schema setup or prisma writes", async () => {
    const executeSpy = vi.spyOn(prisma, "$executeRawUnsafe");
    const upsertSpy = vi.spyOn(prisma.designAsset, "upsert");

    await expect(
      upsertDesignAsset({
        assetType: "api",
        asset: { ...bilingualApi, localizedContent: undefined }
      })
    ).rejects.toMatchObject({
      code: "ASSET_TRANSLATION_REQUIRED",
      assetType: "api",
      assetId: "api-upsert-design-asset",
      path: "localizedContent.zh"
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("preserves stable localization metadata for rejected proposal writes", async () => {
    const executeSpy = vi.spyOn(prisma, "$executeRawUnsafe");
    const upsertSpy = vi.spyOn(prisma.proposal, "upsert");

    await expect(
      upsertProposal({
        proposal: {
          ...bilingualProposal,
          localizedContent: {
            zh: {
              ...bilingualProposal.localizedContent!.zh!,
              status: "评审中"
            }
          }
        } as Proposal
      })
    ).rejects.toMatchObject({
      code: "TRANSLATION_TECHNICAL_FIELD_MUTATION",
      assetType: "proposal",
      assetId: "proposal-bilingual-assets",
      path: "localizedContent.zh.status"
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("accepts valid bilingual asset and proposal payloads", async () => {
    mockSchemaSetup();
    const harness = installLegacyLedgerHarness();
    const assetUpsertSpy = harness.transaction.designAsset.upsert;
    const proposalUpsertSpy = vi.spyOn(prisma.proposal, "upsert").mockResolvedValue({} as never);

    await expect(upsertDesignAsset({ assetType: "api", asset: bilingualApi })).resolves.toEqual({
      id: "api-upsert-design-asset",
      type: "api",
      status: "upserted"
    });
    await expect(upsertProposal({ proposal: bilingualProposal })).resolves.toEqual({
      id: "proposal-bilingual-assets",
      status: "upserted"
    });

    expect(assetUpsertSpy).toHaveBeenCalledOnce();
    expect(proposalUpsertSpy).toHaveBeenCalledOnce();
  });

  it("rejects invalid context packs before schema setup or prisma writes", async () => {
    const executeSpy = vi.spyOn(prisma, "$executeRawUnsafe");
    const upsertSpy = vi.spyOn(prisma.contextPack, "upsert");

    await expect(
      upsertContextPack({
        contextPack: {
          ...bilingualContextPack,
          localizedContent: undefined
        }
      })
    ).rejects.toMatchObject({
      code: "ASSET_TRANSLATION_REQUIRED",
      assetType: "contextPack",
      assetId: "ctx-bilingual-assets",
      path: "localizedContent.zh"
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("stores and reads complete context pack payloads before falling back to legacy columns", async () => {
    mockSchemaSetup();
    const upsertSpy = vi.spyOn(prisma.contextPack, "upsert").mockResolvedValue({} as never);
    vi.spyOn(prisma.designAsset, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.proposal, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.contextPack, "findMany").mockResolvedValue([
      persistedContextPackRow(bilingualContextPack, JSON.stringify(bilingualContextPack)),
      persistedContextPackRow({ ...bilingualContextPack, id: "ctx-legacy-pack" }, null)
    ] as never);
    vi.spyOn(prisma.contextPack, "findUnique").mockResolvedValue(
      persistedContextPackRow({ ...bilingualContextPack, id: "ctx-legacy-pack" }, null) as never
    );

    await expect(upsertContextPack({ contextPack: bilingualContextPack })).resolves.toEqual({
      id: "ctx-bilingual-assets",
      proposalId: "proposal-bilingual-assets",
      status: "upserted"
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ payload: JSON.stringify(bilingualContextPack) }),
        update: expect.objectContaining({ payload: JSON.stringify(bilingualContextPack) })
      })
    );

    await expect(searchPersistedDesignAssets({ applicationServiceId: writableScope.applicationServiceId, query: "中文覆盖层", locale: "zh" })).resolves.toEqual({
      results: [
        expect.objectContaining({
          id: "ctx-bilingual-assets",
          type: "contextPack",
          name: "双语资产实现上下文",
          summary: "用于实现规范英文设计资产和中文覆盖层的上下文说明。"
        })
      ]
    });

    await expect(getPersistedAsset("contextPack", "ctx-legacy-pack", writableScope.applicationServiceId)).resolves.toMatchObject({
      id: "ctx-legacy-pack",
      name: bilingualContextPack.name,
      summary: bilingualContextPack.summary,
      constraints: bilingualContextPack.constraints,
      instructions: bilingualContextPack.instructions,
      generatedMarkdown: bilingualContextPack.generatedMarkdown
    });
  });

  it("updates every persisted Context Pack projection when the canonical proposal changes", async () => {
    mockSchemaSetup();
    const upsertSpy = vi.spyOn(prisma.contextPack, "upsert").mockResolvedValue({} as never);
    const changedPack: ContextPack = {
      ...bilingualContextPack,
      proposalId: "proposal-bilingual-assets-v2",
      name: "Updated bilingual assets context",
      summary: "Updated implementation guidance.",
      targetAgent: "claude-code",
      includedAssets: [{ type: "proposal", id: "proposal-bilingual-assets-v2", label: "Updated proposal" }],
      constraints: ["Use the updated proposal.", "Keep all projections aligned."],
      instructions: ["Refresh all persisted projections.", "Verify the legacy reader."],
      generatedMarkdown: "# Updated context"
    };

    await upsertContextPack({ contextPack: changedPack });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          proposalId: changedPack.proposalId,
          name: changedPack.name,
          targetAgent: changedPack.targetAgent,
          summary: changedPack.summary,
          includedAssets: JSON.stringify(changedPack.includedAssets),
          constraints: JSON.stringify(changedPack.constraints),
          instructions: JSON.stringify(changedPack.instructions),
          generatedMarkdown: changedPack.generatedMarkdown,
          payload: JSON.stringify(changedPack),
          applicationServiceId: writableScope.applicationServiceId,
          scopePath: writableScope.scopePath
        }
      })
    );
  });

  it("falls back to legacy context pack columns when persisted payload JSON is invalid or incomplete", async () => {
    mockSchemaSetup();
    vi.spyOn(prisma.contextPack, "findUnique")
      .mockResolvedValueOnce(persistedContextPackRow({ ...bilingualContextPack, id: "ctx-invalid-json-pack" }, "{") as never)
      .mockResolvedValueOnce(persistedContextPackRow({ ...bilingualContextPack, id: "ctx-empty-object-pack" }, "{}") as never);

    await expect(getPersistedAsset("contextPack", "ctx-invalid-json-pack", writableScope.applicationServiceId)).resolves.toMatchObject({
      id: "ctx-invalid-json-pack",
      name: bilingualContextPack.name,
      summary: bilingualContextPack.summary,
      constraints: bilingualContextPack.constraints,
      instructions: bilingualContextPack.instructions,
      generatedMarkdown: bilingualContextPack.generatedMarkdown
    });

    await expect(getPersistedAsset("contextPack", "ctx-empty-object-pack", writableScope.applicationServiceId)).resolves.toMatchObject({
      id: "ctx-empty-object-pack",
      name: bilingualContextPack.name,
      summary: bilingualContextPack.summary,
      constraints: bilingualContextPack.constraints,
      instructions: bilingualContextPack.instructions,
      generatedMarkdown: bilingualContextPack.generatedMarkdown
    });
  });

  it("matches Chinese semantic search terms and returns localized results for the requested locale", async () => {
    mockSchemaSetup();
    vi.spyOn(prisma.designAsset, "findMany").mockResolvedValue([persistedAssetRow(bilingualApi)] as never);
    vi.spyOn(prisma.proposal, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.contextPack, "findMany").mockResolvedValue([] as never);

    await expect(
      searchPersistedDesignAssets({
        applicationServiceId: writableScope.applicationServiceId,
        query: "设计资产",
        locale: "zh"
      })
    ).resolves.toEqual({
      results: [
        expect.objectContaining({
          id: "api-upsert-design-asset",
          type: "api",
          name: "设计资产写入接口",
          summary: "通过 MCP 边界写入设计资产。"
        })
      ]
    });
  });

  it("keeps raw reads canonical while locale-aware renders use localized narratives", async () => {
    mockSchemaSetup();
    vi.spyOn(prisma.designAsset, "findUnique").mockResolvedValue(persistedAssetRow(bilingualApi) as never);

    await expect(
      getPersistedAsset("api", "api-upsert-design-asset", writableScope.applicationServiceId)
    ).resolves.toMatchObject({
      id: "api-upsert-design-asset",
      name: "Upsert design asset API",
      description: "Writes design assets through the MCP boundary.",
      localizedContent: {
        zh: {
          name: "设计资产写入接口"
        }
      }
    });

    await expect(
      renderPersistedAssetAsMarkdown("api", "api-upsert-design-asset", writableScope.applicationServiceId, "zh")
    ).resolves.toContain("# 设计资产写入接口");
  });
});
