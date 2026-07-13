import { defaultHuaweiActor, type ApiContract, type Proposal } from "@specforge/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPersistedAsset,
  prisma,
  renderPersistedAssetAsMarkdown,
  resolveWritableScope,
  searchPersistedDesignAssets,
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

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
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
    vi.spyOn(prisma.designAsset, "findFirst").mockResolvedValue(persistedAssetRow(bilingualApi) as never);

    const markdown = await renderPersistedAssetAsMarkdown("api", "api-upsert-design-asset", writableScope.applicationServiceId, "zh");
    const [, sourceJsonBlock = ""] = markdown.split("## Source JSON\n");
    const canonicalJson = JSON.parse(sourceJsonBlock.replace(/^```json\s*/u, "").replace(/\s*```$/u, ""));

    expect(markdown).not.toContain("# Upsert design asset API");
    expect(markdown).not.toContain("## Agent Summary\nWrites design assets through the MCP boundary.");
    expect(canonicalJson.name).toBe("Upsert design asset API");
    expect(canonicalJson.description).toBe("Writes design assets through the MCP boundary.");
    expect(canonicalJson.localizedContent.zh.name).toBe(bilingualApi.localizedContent?.zh?.name);
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
    vi.spyOn(prisma.designAsset, "findFirst").mockResolvedValue(persistedAssetRow(bilingualApi) as never);

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
