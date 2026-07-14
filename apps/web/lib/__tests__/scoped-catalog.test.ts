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
  getRouteAssetWithDatabase,
  getRouteAssetsWithDatabase,
  getScopedAssetCatalog,
  getScopedAssetDetail,
  getScopedAssetGraph,
  getScopedProposalImpact,
  searchScopedAssets
} from "../assets";

const scope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
};
const zhPolicyApi = "\u7b56\u7565\u63a5\u53e3";
const zhProvidesApi = "\u63d0\u4f9b API";

function persistedRow<T extends object>(payload: T, extra: Record<string, unknown> = {}) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, payload: JSON.stringify(payload), ...extra };
}

function apiPayload(name: string, chineseName: string, id = "shared-api") {
  return {
    id, name, description: `${name} canonical description`, domainId: "policy-domain",
    method: "POST", path: "/policies", providerSystem: "policyhub", consumers: [], requestSchema: {},
    responseSchema: {}, errorCodes: [], openapiSpec: "3.1.0", exposure: "internal",
    createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope,
    localizedContent: { zh: { name: chineseName, description: "\u7b56\u7565\u5951\u7ea6\u4e2d\u6587\u8bf4\u660e" } }
  };
}

function domainPayload() {
  return {
    id: "policy-domain", code: "POLICY", name: "Policy Domain", description: "Policy decisions.",
    boundedContext: "Policy", entities: ["Policy"], valueObjects: [], domainServices: [], upstreamDomains: [], downstreamDomains: [],
    businessCapabilities: ["Evaluate policies"], glossaryTerms: ["Policy"], owner: "Policy Team",
    createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope,
    localizedContent: { zh: { name: "\u7b56\u7565\u9886\u57df", description: "\u7b56\u7565\u51b3\u7b56\u3002", entities: ["\u7b56\u7565"],
      valueObjects: [], domainServices: [], businessCapabilities: ["\u8bc4\u4f30\u7b56\u7565"], glossaryTerms: ["\u7b56\u7565"] } }
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
    localizedContent: { zh: { name: "\u6570\u636e\u5e93\u72ec\u6709\u63d0\u6848", title: "\u6570\u636e\u5e93\u72ec\u6709\u63d0\u6848",
      description: "\u53d8\u66f4\u7b56\u7565\u521b\u5efa\u3002", background: "\u73b0\u6709\u7b56\u7565\u6d41\u7a0b\u3002", goal: "\u6539\u8fdb\u7b56\u7565\u521b\u5efa\u3002",
      nonGoal: "\u4e0d\u53d8\u66f4\u7aef\u70b9\u3002", scope: "\u4ec5\u7b56\u7565\u4e2d\u5fc3\u3002", specChanges: ["\u66f4\u65b0\u7b56\u7565\u6821\u9a8c\u3002"],
      risks: ["\u517c\u5bb9\u6027\u98ce\u9669\u3002"], rolloutPlan: "\u6e10\u8fdb\u53d1\u5e03\u3002" } }
  };
}

describe("scoped AssetCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.designAssets.mockResolvedValue([persistedRow(apiPayload("Policy API", zhPolicyApi), { type: "api" })]);
    db.proposals.mockResolvedValue([]);
    db.contextPacks.mockResolvedValue([]);
    db.assetLinks.mockResolvedValue([]);
  });

  it("loads every collection and links with an exact service scope", async () => {
    const catalog = await getScopedAssetCatalog(scope.applicationServiceId);
    expect(catalog.apis).toHaveLength(1);
    expect(catalog.domains).toEqual([]);
    expect(catalog.proposals).toEqual([]);
    expect(catalog.contextPacks).toEqual([]);
    expect(catalog.assetLinks).toEqual([]);
    for (const query of [db.designAssets, db.proposals, db.contextPacks, db.assetLinks]) {
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: scope }));
    }
  });

  it("searches English and Chinese but displays the requested locale", async () => {
    const english = await searchScopedAssets("api", scope.applicationServiceId, zhPolicyApi, "en", { limit: 20 });
    const chinese = await searchScopedAssets("api", scope.applicationServiceId, "Policy API", "zh", { limit: 20 });
    expect(english.items.map((result) => result.asset.name)).toEqual(["Policy API"]);
    expect(chinese.items.map((result) => result.asset.name)).toEqual([zhPolicyApi]);
    expect(english.items[0]?.asset.path).toBe("/policies");
    expect(chinese.items[0]?.asset.path).toBe("/policies");
  });

  it("keeps duplicate logical IDs independent between application services", async () => {
    db.designAssets.mockImplementation(async ({ where }: { where: { applicationServiceId: string; scopePath: string } }) => [{
      type: "api", applicationServiceId: where.applicationServiceId, scopePath: where.scopePath,
      payload: JSON.stringify(apiPayload(where.applicationServiceId === scope.applicationServiceId ? "Policy API" : "Studio API", zhPolicyApi))
    }]);
    const policy = await searchScopedAssets("api", scope.applicationServiceId, "", "en", { limit: 1 });
    const studio = await searchScopedAssets("api", "com.huawei.celon.specstudio", "", "en", { limit: 1 });
    expect(policy.items[0]?.asset.name).toBe("Policy API");
    expect(studio.items[0]?.asset.name).toBe("Studio API");
  });

  it("derives graph, impact, and Context Pack from database-only scoped assets", async () => {
    db.designAssets.mockResolvedValue([
      persistedRow(domainPayload(), { type: "domain" }),
      persistedRow(apiPayload("Policy API", zhPolicyApi), { type: "api" })
    ]);
    db.proposals.mockResolvedValue([persistedRow(proposalPayload())]);
    const graph = await getScopedAssetGraph(scope.applicationServiceId, undefined, undefined, "zh");
    const detail = await getScopedAssetDetail("api", "shared-api", scope.applicationServiceId, "zh");
    const impact = await getScopedProposalImpact("proposal-db-only", scope.applicationServiceId, "zh");
    const pack = await generateScopedContextPack("proposal-db-only", scope.applicationServiceId, "zh");
    const apiEdge = graph.edges.find((edge) => edge.targetLogicalId === "shared-api") as typeof graph.edges[number] & { displayLabel?: string };
    expect(graph.nodes.find((node) => node.logicalId === "shared-api")?.label).toBe(zhPolicyApi);
    expect(apiEdge.label).toBe("provides api");
    expect(apiEdge.displayLabel).toBe(zhProvidesApi);
    expect(detail.asset.name).toBe(zhPolicyApi);
    expect(detail.summary).toContain(zhPolicyApi);
    expect(detail.markdown).toContain(zhPolicyApi);
    expect(impact.proposalId).toBe("proposal-db-only");
    expect(impact.impactedAssets[0]?.label).toBe(zhPolicyApi);
    expect(impact.implementationTasks.join(" ")).toContain("\u66f4\u65b0\u7b56\u7565\u6821\u9a8c");
    expect(pack.proposalId).toBe("proposal-db-only");
    expect(pack.instructions.join(" ")).toContain("\u66f4\u65b0\u7b56\u7565\u6821\u9a8c");
  });

  it("keeps the selected scope in graph detail navigation", () => {
    expect(buildScopedGraphAssetHref({ id: "scoped::api", logicalId: "shared-api", type: "api" }, scope.applicationServiceId))
      .toBe("/assets/apis/shared-api?scope=com.huawei.celon.policyhub");
  });

  it("excludes near-prefix scope paths from list, detail, graph, and catalog readers", async () => {
    const selected = persistedRow(apiPayload("Policy API", zhPolicyApi), { type: "api" });
    const shadow = persistedRow(apiPayload("Shadow API", "Shadow zh", "shadow-api"), { type: "api", scopePath: `${scope.scopePath}-shadow` });
    db.designAssets.mockImplementation(async ({ where }: { where: { scopePath: unknown } }) => typeof where.scopePath === "string" ? [selected] : [selected, shadow]);
    const list = await getRouteAssetsWithDatabase("apis", scope.applicationServiceId, "en");
    const detail = await getRouteAssetWithDatabase("apis", "shared-api", scope.applicationServiceId, "en");
    const graph = await getScopedAssetGraph(scope.applicationServiceId, undefined, undefined, "en");
    const catalog = await getScopedAssetCatalog(scope.applicationServiceId);
    expect(list.map((asset) => asset.id)).toEqual(["shared-api"]);
    expect(detail.id).toBe("shared-api");
    expect(graph.nodes.map((node) => node.logicalId ?? node.id)).not.toContain("shadow-api");
    expect(catalog.apis.map((asset) => asset.id)).toEqual(["shared-api"]);
  });

  it("normalizes untrusted payload scope from the exact persisted row", async () => {
    const payload = apiPayload("Policy API", zhPolicyApi);
    payload.architectureScope = { applicationServiceId: "attacker.service", scopePath: "attacker/path" };
    db.designAssets.mockResolvedValue([persistedRow(payload, { type: "api" })]);
    const catalog = await getScopedAssetCatalog(scope.applicationServiceId);
    expect(catalog.apis[0]?.architectureScope).toEqual(scope);
  });

  it("rejects a persisted row whose trusted columns violate the requested scope", async () => {
    db.designAssets.mockResolvedValue([persistedRow(apiPayload("Policy API", zhPolicyApi), { type: "api", scopePath: `${scope.scopePath}-shadow` })]);
    await expect(getScopedAssetCatalog(scope.applicationServiceId)).rejects.toThrow("Persisted row scope mismatch");
  });

  it("returns every asset for an empty query and explicitly paginates nonempty search", async () => {
    db.designAssets.mockResolvedValue(Array.from({ length: 60 }, (_, index) =>
      persistedRow(apiPayload(`Policy API ${index}`, `${zhPolicyApi} ${index}`, `api-${index}`), { type: "api" })
    ));
    const all = await searchScopedAssets("api", scope.applicationServiceId, "", "en", { limit: 10 });
    const firstPage = await searchScopedAssets("api", scope.applicationServiceId, "Policy", "en", { limit: 10, offset: 0 });
    expect(all.items).toHaveLength(60);
    expect(all.total).toBe(60);
    expect(firstPage.items).toHaveLength(10);
    expect(firstPage).toMatchObject({ total: 60, limit: 10, offset: 0 });
  });
});
