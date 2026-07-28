import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { messages } from "../i18n";
import { overviewDestinations } from "../overview";

describe("overviewDestinations", () => {
  it("returns unscoped overview destinations", () => {
    expect(overviewDestinations()).toEqual({
      workspace: "/workspace",
      graph: "/graph",
      governance: "/governance/checks",
    });
  });

  it("preserves the supplied scope across overview destinations", () => {
    expect(overviewDestinations("com.huawei.celon.policyhub")).toEqual({
      workspace: "/workspace?scope=com.huawei.celon.policyhub",
      graph: "/graph?scope=com.huawei.celon.policyhub",
      governance: "/governance/checks?scope=com.huawei.celon.policyhub",
    });
  });
});

describe("overview localization", () => {
  it("keeps every English overview key localized in Chinese", () => {
    const overviewKeys = Object.keys(messages.en).filter((key) => key.startsWith("overview."));

    expect(overviewKeys.length).toBeGreaterThan(12);
    expect(overviewKeys.every((key) => key in messages.zh)).toBe(true);
  });
});

describe("overview route isolation", () => {
  it("keeps the root route free of scoped data loaders", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("getScopedAssetCatalog");
    expect(source).not.toContain("getAgentServiceWorkspace");
    expect(source).not.toContain("getScopedGovernanceOverview");
  });

  it("uses a responsive, optional-motion conceptual fact flow", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="sf-overview-flow"');
    expect(source).toContain("data-motion");
  });
});
