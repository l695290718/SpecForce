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

import { getGovernanceTargetsWithDatabase, getRouteAssetsWithDatabase } from "../assets";

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
});
