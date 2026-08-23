import { describe, expect, it } from "vitest";
import type { ThreeACoverageReport } from "../../lib/3a/workspace-loader";
import { COVERAGE_PAGE_SIZE, paginateCoverageRows } from "./coverage-detail";

const rows: ThreeACoverageReport["rows"] = Array.from({ length: 26 }, (_, index) => ({
  assetType: "api",
  assetId: `asset-${index + 1}`,
  role: "TRACE",
  status: "COVERED",
  rowDigest: `digest-${index + 1}`
}));

describe("coverage detail pagination", () => {
  it("bounds the first page to 25 rows", () => {
    const result = paginateCoverageRows(rows, 1);
    expect(result.pageCount).toBe(2);
    expect(result.rows).toHaveLength(COVERAGE_PAGE_SIZE);
    expect(result.rows.at(0)?.assetId).toBe("asset-1");
    expect(result.rows.at(-1)?.assetId).toBe("asset-25");
  });

  it("clamps page input and returns the final row", () => {
    const result = paginateCoverageRows(rows, 99);
    expect(result.page).toBe(2);
    expect(result.rows.map((row) => row.assetId)).toEqual(["asset-26"]);
  });
});
