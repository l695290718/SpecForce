import { defaultHuaweiActor, type ApiContract, type ContextPack, type Proposal } from "@specforge/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deletePersistedDesignData,
  getPersistedAsset,
  prisma,
  renderPersistedAssetAsMarkdown,
  resolveWritableScope,
  searchPersistedDesignAssets,
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
  vi.spyOn(prisma.architectureScope, "upsert").mockResolvedValue({} as never);
  vi.spyOn(prisma.actorScopeGrant, "upsert").mockResolvedValue({} as never);
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
    const assetUpsert = vi.spyOn(prisma.designAsset, "upsert").mockResolvedValue({} as never);
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
    const assetUpsertSpy = vi.spyOn(prisma.designAsset, "upsert").mockResolvedValue({} as never);
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
