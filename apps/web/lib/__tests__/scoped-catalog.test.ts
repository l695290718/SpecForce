import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  designAssets: vi.fn(), proposals: vi.fn(), contextPacks: vi.fn(), assetLinks: vi.fn()
}));

vi.mock("../db", () => ({ prisma: {
  designAsset: { findMany: db.designAssets }, proposal: { findMany: db.proposals },
  contextPack: { findMany: db.contextPacks }, assetLink: { findMany: db.assetLinks }
} }));

import {
  buildScopedGraphAssetHref,
  generateScopedContextPack,
  getScopedAssetDetail,
  getScopedAssetCatalog,
  getScopedAssetGraph,
  getScopedProposalImpact,
  getRouteAssetWithDatabase,
  getRouteAssetsWithDatabase,
  searchScopedAssets
} from "../assets";

const scope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
};

function apiPayload(name: string, chineseName: string, id = "shared-api") {
  return {
    id, name, description: `${name} canonical description`, domainId: "policy-domain",
    method: "POST", path: "/policies", providerSystem: "policyhub", consumers: [], requestSchema: {},
    responseSchema: {}, errorCodes: [], openapiSpec: "3.1.0", exposure: "internal",
    createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope,
    localizedContent: { zh: { name: chineseName, description: "策略契约中文说明" } }
  };
}

function domainPayload() {
  return {
    id: "policy-domain", code: "POLICY", name: "Policy Domain", description: "Policy decisions.",
    boundedContext: "Policy", entities: ["Policy"], valueObjects: [], domainServices: [],
    upstreamDomains: [], downstreamDomains: [], businessCapabilities: ["Evaluate policies"], glossaryTerms: ["Policy"],
    owner: "Policy Team", createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope,
    localizedContent: { zh: { name: "策略领域", description: "策略决策。", entities: ["策略"], valueObjects: [],
      domainServices: [], businessCapabilities: ["评估策略"], glossaryTerms: ["策略"] } }
  };
}

function proposalPayload() {
  return {
    id: "proposal-db-only", name: "Database-only proposal", title: "Database-only proposal",
    description: "Change policy creation.", background: "Existing policy flow.", goal: "Improve policy creation.",
    nonGoal: "No endpoint change.", scope: "Policy Hub only.", domainId: "policy-domain",
    impactedAssets: [{ type: "api", id: "shared-api", label: "Policy API" }],
    specChanges: ["Update policy validation."], risks: ["Compatibility risk."], rolloutPlan: "Progressively.",
    status: "draft", createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope,
    localizedContent: { zh: { name: "数据库独有提案", title: "数据库独有提案", description: "变更策略创建。",
      background: "现有策略流程。", goal: "改进策略创建。", nonGoal: "不变更端点。", scope: "仅策略中心。",
      specChanges: ["更新策略校验。"], risks: ["兼容性风险。"], rolloutPlan: "渐进发布。" } }
  };
}

describe("scoped AssetCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.designAssets.mockResolvedValue([{ type: "api", payload: JSON.stringify(apiPayload("Policy API", "策略接口")) }]);
    db.proposals.mockResolvedValue([]);
    db.contextPacks.mockResolvedValue([]);
    db.assetLinks.mockResolvedValue([]);
  });

  it("loads every catalog collection and links with an exact service scope", async () => {
    const catalog = await getScopedAssetCatalog(scope.applicationServiceId);
    expect(catalog.apis).toHaveLength(1);
    expect(catalog.domains).toEqual([]);
    expect(catalog.proposals).toEqual([]);
    expect(catalog.contextPacks).toEqual([]);
    expect(catalog.assetLinks).toEqual([]);
    for (const query of [db.designAssets, db.proposals, db.contextPacks, db.assetLinks]) {
      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }
      }));
    }
  });

  it("searches canonical English and Chinese overlay but displays the requested locale", async () => {
    const english = await searchScopedAssets("api", scope.applicationServiceId, "策略接口", "en");
    const chinese = await searchScopedAssets("api", scope.applicationServiceId, "Policy API", "zh");
    expect(english.map((result) => result.asset.name)).toEqual(["Policy API"]);
    expect(chinese.map((result) => result.asset.name)).toEqual(["策略接口"]);
    expect(english[0]?.asset.path).toBe("/policies");
    expect(chinese[0]?.asset.path).toBe("/policies");
  });

  it("keeps duplicate logical IDs independent between application services", async () => {
    db.designAssets.mockImplementation(async ({ where }: { where: { applicationServiceId: string } }) => [{
      type: "api",
      payload: JSON.stringify(apiPayload(
        where.applicationServiceId === scope.applicationServiceId ? "Policy API" : "Studio API",
        where.applicationServiceId === scope.applicationServiceId ? "策略接口" : "规约接口"
      ))
    }]);

    const policy = await searchScopedAssets("api", scope.applicationServiceId, "", "en");
    const studio = await searchScopedAssets("api", "com.huawei.celon.specstudio", "", "en");

    expect(policy[0]?.asset.name).toBe("Policy API");
    expect(studio[0]?.asset.name).toBe("Studio API");
  });

  it("derives graph, impact, and Context Pack from database-only scoped assets", async () => {
    db.designAssets.mockResolvedValue([
      { type: "domain", payload: JSON.stringify(domainPayload()) },
      { type: "api", payload: JSON.stringify(apiPayload("Policy API", "策略接口")) }
    ]);
    db.proposals.mockResolvedValue([{ payload: JSON.stringify(proposalPayload()) }]);

    const graph = await getScopedAssetGraph(scope.applicationServiceId, undefined, undefined, "zh");
    const detail = await getScopedAssetDetail("api", "shared-api", scope.applicationServiceId, "zh");
    const impact = await getScopedProposalImpact("proposal-db-only", scope.applicationServiceId, "zh");
    const pack = await generateScopedContextPack("proposal-db-only", scope.applicationServiceId, "zh");

    expect(graph.nodes.find((node) => node.logicalId === "shared-api")?.label).toBe("策略接口");
    expect(graph.edges.find((edge) => edge.targetLogicalId === "shared-api")?.label).toBe("提供 API");
    expect(detail.asset.name).toBe("策略接口");
    expect(detail.summary).toContain("策略接口");
    expect(detail.markdown).toContain("策略接口");
    expect(impact.proposalId).toBe("proposal-db-only");
    expect(impact.impactedAssets[0]?.label).toBe("策略接口");
    expect(pack.proposalId).toBe("proposal-db-only");
    expect(pack.name).toContain("数据库独有提案");
  });

  it("keeps the selected scope in graph detail navigation", () => {
    expect(buildScopedGraphAssetHref({ id: "scoped::api", logicalId: "shared-api", type: "api" }, scope.applicationServiceId))
      .toBe("/assets/apis/shared-api?scope=com.huawei.celon.policyhub");
  });

  it("excludes near-prefix scope paths from list, detail, graph, and catalog readers", async () => {
    const selected = { type: "api", payload: JSON.stringify(apiPayload("Policy API", "策略接口")) };
    const shadow = { type: "api", payload: JSON.stringify(apiPayload("Shadow API", "影子接口", "shadow-api")) };
    db.designAssets.mockImplementation(async ({ where }: { where: { scopePath: unknown } }) =>
      typeof where.scopePath === "string" ? [selected] : [selected, shadow]
    );

    const list = await getRouteAssetsWithDatabase("apis", scope.applicationServiceId, "en");
    const detail = await getRouteAssetWithDatabase("apis", "shared-api", scope.applicationServiceId, "en");
    const graph = await getScopedAssetGraph(scope.applicationServiceId, undefined, undefined, "en");
    const catalog = await getScopedAssetCatalog(scope.applicationServiceId);

    expect(list.map((asset) => asset.id)).toEqual(["shared-api"]);
    expect(detail.id).toBe("shared-api");
    expect(graph.nodes.map((node) => node.logicalId ?? node.id)).not.toContain("shadow-api");
    expect(catalog.apis.map((asset) => asset.id)).toEqual(["shared-api"]);
  });
});
