import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeatureWorkspace } from "./feature-workspace";

describe("FeatureWorkspace", () => {
  it("renders bilingual read-only navigation and preserves scope", () => {
    const scope = "com.huawei.celon.desiner";
    const html = renderToStaticMarkup(<FeatureWorkspace initialView="service" scope={scope} locale="zh" initialData={{ architectureScope: { applicationServiceId: scope, scopePath: `pf/p/sp/m/${scope}` }, items: [], hasMore: false }} />);
    expect(html).toContain("服务特性"); expect(html).toContain(`scope=${scope}`); expect(html).not.toMatch(/新建|编辑|保存/);
  });
});
