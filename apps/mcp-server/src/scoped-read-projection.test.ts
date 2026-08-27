import { describe, expect, it } from "vitest";
import {
  digestCanonicalAsset,
  filterAssetSearchProjectionsByScope,
  mapAssetSearchProjection,
  normalizeSearchDocument
} from "./scoped-read-projection";

const scopeA = {
  applicationServiceId: "com.example.orders",
  scopePath: "tenant/orders/service"
};

const scopeB = {
  applicationServiceId: "com.example.billing",
  scopePath: "tenant/billing/service"
};

function asset(scope = scopeA) {
  return {
    id: "shared-api",
    name: "Create order",
    description: "Creates an order.",
    domainId: "orders",
    status: "active",
    updatedAt: "2026-08-27T00:00:00.000Z",
    architectureScope: scope,
    requestSchema: { password: "must-not-be-projected" },
    localizedContent: {
      zh: {
        name: "创建订单",
        description: "创建订单。"
      }
    }
  } as unknown as Parameters<typeof mapAssetSearchProjection>[0]["asset"];
}

describe("scoped bilingual asset search projection", () => {
  it("maps canonical English and Chinese localized summary fields", () => {
    const projection = mapAssetSearchProjection({
      architectureScope: scopeA,
      assetType: "api",
      asset: asset(),
      catalogVersion: "7"
    });

    expect(projection).toMatchObject({
      applicationServiceId: scopeA.applicationServiceId,
      scopePath: scopeA.scopePath,
      assetType: "api",
      assetId: "shared-api",
      canonicalName: "Create order",
      canonicalSummary: "Creates an order.",
      localizedNameZh: "创建订单",
      localizedSummaryZh: "创建订单。",
      domainId: "orders",
      status: "active",
      catalogVersion: 7n,
      searchDocument: "create order creates an order. 创建订单 创建订单。"
    });
    expect(projection.searchDocument).not.toContain("must-not-be-projected");
    expect(Object.keys(projection)).not.toContain("requestSchema");
  });

  it("uses a deterministic canonical digest independent of object key order", () => {
    const first = digestCanonicalAsset(asset());
    const second = digestCanonicalAsset({
      ...asset(),
      localizedContent: { zh: { description: "创建订单。", name: "创建订单" } }
    } as unknown as Parameters<typeof digestCanonicalAsset>[0]);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      digestCanonicalAsset({ ...asset(), description: "Updates an order." } as unknown as Parameters<
        typeof digestCanonicalAsset
      >[0])
    ).not.toBe(first);
  });

  it("filters rows by both Scope dimensions so identical IDs cannot leak", () => {
    const rows = [
      mapAssetSearchProjection({
        architectureScope: scopeA,
        assetType: "api",
        asset: asset(scopeA),
        catalogVersion: 1
      }),
      mapAssetSearchProjection({ architectureScope: scopeB, assetType: "api", asset: asset(scopeB), catalogVersion: 1 })
    ];

    expect(filterAssetSearchProjectionsByScope(rows, scopeA)).toEqual([rows[0]]);
    expect(filterAssetSearchProjectionsByScope(rows, scopeB)).toEqual([rows[1]]);
    expect(
      filterAssetSearchProjectionsByScope(rows, scopeA).every(
        (row) => row.applicationServiceId === scopeA.applicationServiceId && row.scopePath === scopeA.scopePath
      )
    ).toBe(true);
  });

  it("rejects a source asset from a different Scope", () => {
    expect(() =>
      mapAssetSearchProjection({
        architectureScope: scopeA,
        assetType: "api",
        asset: asset(scopeB),
        catalogVersion: 1
      })
    ).toThrow("PROJECTION_SCOPE_MISMATCH");
  });

  it("normalizes whitespace without dropping Chinese text", () => {
    expect(normalizeSearchDocument(["  Create   order ", "创建订单", "", "创建订单"])).toBe("create order 创建订单");
  });
});
