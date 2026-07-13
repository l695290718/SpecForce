import { beforeEach, describe, expect, it, vi } from "vitest";

const readers = vi.hoisted(() => ({
  detail: vi.fn(), impact: vi.fn(), generate: vi.fn(), governance: vi.fn(), graph: vi.fn(), search: vi.fn(), list: vi.fn()
}));

vi.mock("../assets", () => ({
  routeToAssetType: (route: string) => route === "apis" ? "api" : route,
  getScopedAssetDetail: readers.detail,
  getScopedProposalImpact: readers.impact,
  generateScopedContextPack: readers.generate,
  getScopedGovernanceOverview: readers.governance,
  getAssetGraphWithDatabase: readers.graph,
  searchScopedAssets: readers.search,
  getRouteAssetsWithDatabase: readers.list
}));

import { GET as getAssetList } from "../../app/api/assets/[type]/route";
import { GET as getAssetDetail } from "../../app/api/assets/[type]/[id]/route";
import { GET as getProposalImpact } from "../../app/api/proposals/[id]/impact/route";
import { POST as generateContextPack } from "../../app/api/context-packs/generate/route";
import { GET as getGovernance } from "../../app/api/governance/checks/route";
import { GET as getGraph } from "../../app/api/graph/route";

describe("scoped derived API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const reader of Object.values(readers)) reader.mockResolvedValue({ ok: true });
  });

  it("passes validated locale and exact scope to asset detail and proposal impact", async () => {
    const request = new Request("http://localhost/api/read?scope=com.huawei.celon.policyhub&locale=zh");
    await getAssetDetail(request, { params: Promise.resolve({ type: "apis", id: "db-only-api" }) });
    await getProposalImpact(request, { params: Promise.resolve({ id: "db-only-proposal" }) });

    expect(readers.detail).toHaveBeenCalledWith("api", "db-only-api", "com.huawei.celon.policyhub", "zh");
    expect(readers.impact).toHaveBeenCalledWith("db-only-proposal", "com.huawei.celon.policyhub", "zh");
  });

  it("uses bilingual scoped search for asset list API queries", async () => {
    readers.search.mockResolvedValue([{ asset: { id: "db-only-api", name: "策略接口" } }]);
    const response = await getAssetList(
      new Request("http://localhost/api/assets/apis?scope=com.huawei.celon.policyhub&q=Policy%20API&locale=zh"),
      { params: Promise.resolve({ type: "apis" }) }
    );

    expect(readers.search).toHaveBeenCalledWith("api", "com.huawei.celon.policyhub", "Policy API", "zh");
    await expect(response.json()).resolves.toEqual([{ id: "db-only-api", name: "策略接口" }]);
  });

  it("uses the request locale for generated Context Packs", async () => {
    const request = new Request("http://localhost/api/context-packs/generate", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "specforge-locale=zh" },
      body: JSON.stringify({ proposalId: "db-only-proposal", scope: "com.huawei.celon.policyhub" })
    });
    await generateContextPack(request);
    expect(readers.generate).toHaveBeenCalledWith("db-only-proposal", "com.huawei.celon.policyhub", "zh");
  });

  it("passes locale and filters through governance and graph APIs", async () => {
    await getGovernance(new Request("http://localhost/api/governance/checks?scope=com.huawei.celon.policyhub&locale=zh"));
    await getGraph(new Request("http://localhost/api/graph?scope=com.huawei.celon.policyhub&domainId=policy-domain&assetType=api&locale=zh"));

    expect(readers.governance).toHaveBeenCalledWith("com.huawei.celon.policyhub", "zh");
    expect(readers.graph).toHaveBeenCalledWith("com.huawei.celon.policyhub", "policy-domain", "api", "zh");
  });
});
