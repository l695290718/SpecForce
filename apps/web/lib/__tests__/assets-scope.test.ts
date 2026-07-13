import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([]),
  findUnique: vi.fn().mockResolvedValue(null),
  count: vi.fn().mockResolvedValue(1)
}));

vi.mock("../db", () => ({
  prisma: {
    designAsset: { findMany: db.findMany },
    proposal: { findMany: db.findMany, findUnique: db.findUnique, count: db.count },
    contextPack: { findMany: db.findMany, findUnique: db.findUnique, count: db.count },
    $queryRawUnsafe: vi.fn().mockResolvedValue([])
  }
}));

import { getContextPacksWithDatabase, getGovernanceTargetsWithDatabase, getRouteAssetsWithDatabase } from "../assets";

describe("scoped asset repository", () => {
  it("rejects an unknown scope instead of falling back to Designer assets", async () => {
    await expect(getRouteAssetsWithDatabase("apis", "missing-service")).rejects.toThrow("Application-service scope is required");
  });

  it("queries a readable service with an exact service predicate", async () => {
    await getRouteAssetsWithDatabase("apis", "com.huawei.celon.policyhub");

    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ applicationServiceId: "com.huawei.celon.policyhub" })
    }));
  });

  it("localizes human-facing database asset fields without changing technical identifiers", async () => {
    db.findMany.mockResolvedValueOnce([{
      id: "policy-api",
      type: "api",
      payload: JSON.stringify({
        id: "policy-api",
        name: "Policy API",
        description: "Writes policy specifications.",
        method: "POST",
        path: "/policies",
        domainId: "policy-domain",
        providerSystem: "policyhub",
        consumers: [],
        requestSchema: {},
        responseSchema: {},
        errorCodes: [],
        openapiSpec: "3.1.0",
        exposure: "internal",
        createdAt: "2026-07-13",
        updatedAt: "2026-07-13",
        localizedContent: {
          zh: { name: "策略接口", description: "写入策略规格。" }
        }
      })
    }]);

    const [asset] = await getRouteAssetsWithDatabase("apis", "com.huawei.celon.policyhub", "zh");

    expect(asset).toMatchObject({
      name: "策略接口",
      description: "写入策略规格。",
      method: "POST",
      path: "/policies"
    });
  });

  it("builds governance targets only from the selected service", async () => {
    db.findMany.mockResolvedValueOnce([
      { id: "policy-api", type: "api", payload: JSON.stringify({ id: "policy-api", name: "Policy API", description: "Scoped", createdAt: "2026-07-13", updatedAt: "2026-07-13" }) }
    ]);

    const targets = await getGovernanceTargetsWithDatabase("com.huawei.celon.policyhub");

    expect(targets).toContainEqual({ type: "api", id: "policy-api" });
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ applicationServiceId: "com.huawei.celon.policyhub" })
    }));
  });

  it("keeps legacy Context Pack rows readable when a Chinese overlay was never persisted", async () => {
    db.findMany.mockResolvedValueOnce([{
      id: "ctx-legacy",
      name: "Legacy Context Pack",
      proposalId: "proposal-legacy",
      targetAgent: "codex",
      summary: "Canonical fallback",
      includedAssets: "[]",
      constraints: "[]",
      instructions: "[]",
      generatedMarkdown: "# Legacy",
      payload: null,
      createdAt: new Date("2026-07-13T00:00:00Z")
    }]);

    const [pack] = await getContextPacksWithDatabase("com.huawei.celon.policyhub", "zh");

    expect(pack).toBeDefined();
    if (!pack) throw new Error("Expected a legacy Context Pack row");
    expect(pack.name).toBe("Legacy Context Pack");
    expect(pack.proposalId).toBe("proposal-legacy");
  });
});
