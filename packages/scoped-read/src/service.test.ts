import { describe, expect, it } from "vitest";
import { createScopedAssetReadService } from "./service";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner" };
const context = { subject: "agent-1", architectureScope: scope, catalogVersion: "4", projectionVersion: "1" };

function row(id: string) {
  return { id, type: "api", name: id, summary: id, updatedAt: "2026-08-27T00:00:00.000Z", contentDigest: id, architectureScope: scope };
}

describe("scoped asset read service", () => {
  it("returns a bounded page and cursor without loading a catalog", async () => {
    const service = createScopedAssetReadService({
      searchSummaries: async () => ({ rows: [row("api-1")], hasMore: true }),
      findSummary: async () => row("api-1"),
      listRelationships: async () => ({ rows: [], hasMore: false })
    });
    const result = await service.search({ context, query: { assetTypes: ["api"], locale: "en", pageSize: 1, sort: "updatedAt" } });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeDefined();
    expect(result.catalogVersion).toBe("4");
  });

  it("rejects repository rows that escape the authorized Scope", async () => {
    const service = createScopedAssetReadService({
      searchSummaries: async () => ({ rows: [{ ...row("api-1"), architectureScope: { applicationServiceId: "other", scopePath: "other" } }], hasMore: false }),
      findSummary: async () => undefined,
      listRelationships: async () => ({ rows: [], hasMore: false })
    });
    await expect(service.search({ context, query: { locale: "en", pageSize: 1, sort: "updatedAt" } })).rejects.toThrow("READ_SCOPE_MISMATCH");
  });
});
