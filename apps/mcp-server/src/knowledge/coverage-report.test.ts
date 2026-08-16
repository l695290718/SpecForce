import { describe, expect, it } from "vitest";
import { get3aCoverageReport } from "./coverage-report";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };

describe("bounded 3A coverage report", () => {
  it("returns exact-Scope rows with a continuation cursor", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ ...scope, generationId: "generation-1", assetType: "api", assetId: `api-${index + 1}`, role: "MEMBERSHIP", status: "COVERED", pathEvidence: [], rowDigest: `row-${index + 1}` }));
    const fake = { architectureCoverageManifest: { findFirst: async () => ({ ...scope, id: "manifest-1", generationId: "generation-1", inputDigest: "input", contentDigest: "content", catalogVersion: 2n, relationshipVersion: 4n, rowCount: 3, coveredCount: 3, blockedCount: 0, notEvaluatedCount: 0, publicationState: "PUBLISHED" }) }, architectureAssetCoverageProjection: { findMany: async ({ take }: { take: number }) => rows.slice(0, take) }, authoredCatalogCursor: { findUnique: async () => ({ nextVersion: 2n }) }, relationshipEvent: { aggregate: async () => ({ _max: { graphVersion: 4n } }) } };
    const result = await get3aCoverageReport({ architectureScope: scope, limit: 2 }, fake as never, async () => undefined);
    expect(result.freshness).toBe("CURRENT");
    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).toBeTruthy();
  });

  it("rejects a mismatched Scope before reading data", async () => {
    await expect(get3aCoverageReport({ architectureScope: { ...scope, scopePath: "other" } })).rejects.toThrow();
  });
});
