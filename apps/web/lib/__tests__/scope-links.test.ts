import { describe, expect, it } from "vitest";
import { buildScopedHref } from "../scope";

describe("scoped internal links", () => {
  it("adds the application-service Scope to a plain path", () => {
    expect(buildScopedHref("/workspace", "com.huawei.celon.desiner"))
      .toBe("/workspace?scope=com.huawei.celon.desiner");
  });

  it("preserves filters and replaces an existing Scope", () => {
    const href = buildScopedHref("/graph?scope=old-scope&assetType=api#canvas", "com.huawei.celon.desiner");
    const url = new URL(href, "http://specforge.local");

    expect(url.pathname).toBe("/graph");
    expect(url.searchParams.get("scope")).toBe("com.huawei.celon.desiner");
    expect(url.searchParams.getAll("scope")).toHaveLength(1);
    expect(url.searchParams.get("assetType")).toBe("api");
    expect(url.hash).toBe("#canvas");
  });

  it("round-trips reserved Scope characters", () => {
    const scope = "pf-huawei/product-celon/module?designer";
    const href = buildScopedHref("/assets/apis?q=write", scope);
    const url = new URL(href, "http://specforge.local");

    expect(url.searchParams.get("q")).toBe("write");
    expect(url.searchParams.get("scope")).toBe(scope);
  });
});
