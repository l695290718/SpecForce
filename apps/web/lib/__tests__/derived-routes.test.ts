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
import { POST as generateContextPack } from "../../app/api/context-packs/generate/route";
import { GET as getGovernance } from "../../app/api/governance/checks/route";
import { GET as getGraph } from "../../app/api/graph/route";
import { GET as getProposalImpact } from "../../app/api/proposals/[id]/impact/route";

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

  it("uses explicitly paginated bilingual scoped search for API queries", async () => {
    const localizedName = "\u7b56\u7565\u63a5\u53e3";
    readers.search.mockResolvedValue({ items: [{ asset: { id: "db-only-api", name: localizedName } }], total: 1, limit: 20, offset: 0 });
    const response = await getAssetList(
      new Request("http://localhost/api/assets/apis?scope=com.huawei.celon.policyhub&q=Policy%20API&locale=zh&limit=20&offset=0"),
      { params: Promise.resolve({ type: "apis" }) }
    );
    expect(readers.search).toHaveBeenCalledWith("api", "com.huawei.celon.policyhub", "Policy API", "zh", { limit: 20, offset: 0 });
    await expect(response.json()).resolves.toEqual({ items: [{ id: "db-only-api", name: localizedName }], total: 1, limit: 20, offset: 0 });
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
