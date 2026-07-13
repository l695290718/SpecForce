import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  designAssets: vi.fn(), proposals: vi.fn(), proposal: vi.fn(), contextPacks: vi.fn(), contextPack: vi.fn(), assetLinks: vi.fn()
}));

vi.mock("../db", () => ({ prisma: {
  designAsset: { findMany: db.designAssets },
  proposal: { findMany: db.proposals, findFirst: db.proposal },
  contextPack: { findMany: db.contextPacks, findFirst: db.contextPack },
  assetLink: { findMany: db.assetLinks }
} }));

import {
  generateScopedContextPack,
  getContextPacksWithDatabase,
  getProposalsWithDatabase,
  getRouteAssetsWithDatabase,
  getScopedAssetDetail,
  getScopedAssetGraph,
  getScopedProposalImpact,
  searchScopedAssets
} from "../assets";
import { safeLocalizeAssetForRead } from "../read-localization";

const scope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
};
const zhCompleteApi = "\u5b8c\u6574\u7b56\u7565\u63a5\u53e3";

function row<T extends object>(payload: T, extra: Record<string, unknown> = {}) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, payload: JSON.stringify(payload), ...extra };
}

function legacyDomain() {
  return {
    id: "legacy-domain", code: "LEGACY", name: "Legacy Domain", description: "Canonical domain description.",
    boundedContext: "Legacy", entities: ["Policy"], valueObjects: [], domainServices: [], upstreamDomains: [], downstreamDomains: [],
    businessCapabilities: ["Evaluate policy"], glossaryTerms: ["Policy"], owner: "Policy Team",
    createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope
  };
}

function legacyApi(id = "legacy-api") {
  return {
    id, name: "Legacy Policy API", description: "Canonical API description.", domainId: "legacy-domain",
    method: "POST" as const, path: "/legacy/policies", providerSystem: "policyhub", consumers: [], requestSchema: {}, responseSchema: {},
    errorCodes: [], openapiSpec: "3.1.0", exposure: "internal" as const, createdAt: "2026-07-13", updatedAt: "2026-07-13",
    architectureScope: scope
  };
}

function completeApi() {
  return {
    ...legacyApi("complete-api"),
    name: "Complete Policy API",
    localizedContent: { zh: { name: zhCompleteApi, description: "\u5b8c\u6574\u4e2d\u6587\u63cf\u8ff0\u3002" } }
  };
}

function incompleteApi() {
  return {
    ...legacyApi("incomplete-api"),
    name: "Incomplete Policy API",
    localizedContent: { zh: { name: "\u4e0d\u5b8c\u6574\u7b56\u7565\u63a5\u53e3" } }
  };
}

function legacyProposal() {
  return {
    id: "legacy-proposal", name: "Legacy Proposal", title: "Legacy Proposal", description: "Canonical proposal description.",
    background: "Canonical background.", goal: "Improve the legacy API.", nonGoal: "No endpoint changes.", scope: "Policy Hub only.",
    domainId: "legacy-domain", impactedAssets: [{ type: "api", id: "legacy-api", label: "Legacy Policy API" }],
    specChanges: ["Update legacy validation."], risks: ["Compatibility risk."], rolloutPlan: "Progressive rollout.", status: "draft",
    createdAt: "2026-07-13", updatedAt: "2026-07-13", architectureScope: scope
  };
}

function legacyContextPack() {
  return {
    id: "ctx-legacy", name: "Legacy Context Pack", proposalId: "legacy-proposal", targetAgent: "codex",
    summary: "Canonical context summary.", includedAssets: [{ type: "api", id: "legacy-api", label: "Legacy Policy API" }],
    constraints: ["Keep identifiers stable."], instructions: ["Update legacy validation."], generatedMarkdown: "# Legacy Context Pack",
    createdAt: "2026-07-13", architectureScope: scope
  };
}

function contextRow(payload = legacyContextPack()) {
  return {
    ...row(payload), id: payload.id, name: payload.name, proposalId: payload.proposalId, targetAgent: payload.targetAgent,
    summary: payload.summary, includedAssets: JSON.stringify(payload.includedAssets), constraints: JSON.stringify(payload.constraints),
    instructions: JSON.stringify(payload.instructions), generatedMarkdown: payload.generatedMarkdown, createdAt: new Date("2026-07-13T00:00:00Z")
  };
}

describe("legacy translation read fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.designAssets.mockResolvedValue([]);
    db.proposals.mockResolvedValue([]);
    db.proposal.mockResolvedValue(null);
    db.contextPacks.mockResolvedValue([]);
    db.contextPack.mockResolvedValue(null);
    db.assetLinks.mockResolvedValue([]);
  });

  it("falls back to canonical English for legacy assets while complete assets still localize", async () => {
    db.designAssets.mockResolvedValue([
      row(legacyApi(), { type: "api" }), row(incompleteApi(), { type: "api" }), row(completeApi(), { type: "api" })
    ]);
    const assets = await getRouteAssetsWithDatabase("apis", scope.applicationServiceId, "zh");
    expect(assets.map((asset) => asset.name)).toEqual(["Legacy Policy API", "Incomplete Policy API", zhCompleteApi]);
  });

  it("does not mask invalid canonical English content", () => {
    const invalid = { ...completeApi(), name: "" };
    expect(() => safeLocalizeAssetForRead("api", invalid, "zh")).toThrow("CANONICAL_CONTENT_REQUIRED");
  });

  it("falls back for legacy proposals and persisted Context Packs", async () => {
    db.proposals.mockResolvedValue([row(legacyProposal())]);
    db.contextPacks.mockResolvedValue([contextRow()]);
    const proposals = await getProposalsWithDatabase(scope.applicationServiceId, "zh");
    const packs = await getContextPacksWithDatabase(scope.applicationServiceId, "zh");
    expect(proposals[0]?.title).toBe("Legacy Proposal");
    expect(packs[0]?.name).toBe("Legacy Context Pack");
    expect(packs[0]?.generatedMarkdown).toBe("# Legacy Context Pack");
  });

  it("keeps zh search and derived reads available for an incomplete legacy catalog", async () => {
    db.designAssets.mockResolvedValue([
      row(legacyDomain(), { type: "domain" }), row(legacyApi(), { type: "api" }), row(completeApi(), { type: "api" })
    ]);
    db.proposals.mockResolvedValue([row(legacyProposal())]);
    db.contextPacks.mockResolvedValue([contextRow()]);

    const search = await searchScopedAssets("api", scope.applicationServiceId, "Policy", "zh", { limit: 20 });
    const graph = await getScopedAssetGraph(scope.applicationServiceId, undefined, undefined, "zh");
    const impact = await getScopedProposalImpact("legacy-proposal", scope.applicationServiceId, "zh");
    const pack = await generateScopedContextPack("legacy-proposal", scope.applicationServiceId, "zh");
    const detail = await getScopedAssetDetail("api", "legacy-api", scope.applicationServiceId, "zh");

    expect(search.items.map((item) => item.asset.name)).toContain("Legacy Policy API");
    expect(search.items.map((item) => item.asset.name)).toContain(zhCompleteApi);
    expect(graph.nodes.find((node) => node.logicalId === "legacy-api")?.label).toBe("Legacy Policy API");
    expect(impact.proposalId).toBe("legacy-proposal");
    expect(pack.name).toContain("Legacy Proposal");
    expect(detail.asset.name).toBe("Legacy Policy API");
    expect(detail.governance).toContainEqual(expect.objectContaining({ ruleCode: "ASSET_BILINGUAL_COMPLETENESS", status: "fail" }));
  });
});
