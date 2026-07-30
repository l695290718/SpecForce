import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { messages } from "../i18n";
import { overviewDestinations } from "../overview";

const requiredLocalizedOverviewKeys = [
  "overview.flowAriaLabel",
  "overview.flowLegend",
  "overview.relationshipAriaLabel",
  "overview.relationshipEyebrow"
] as const;

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
  it("keeps every overview key mirrored across English and Chinese", () => {
    const englishOverviewKeys = Object.keys(messages.en)
      .filter((key) => key.startsWith("overview."))
      .sort();
    const chineseOverviewKeys = Object.keys(messages.zh)
      .filter((key) => key.startsWith("overview."))
      .sort();

    expect(englishOverviewKeys).toEqual(chineseOverviewKeys);
    expect(englishOverviewKeys).toEqual(expect.arrayContaining(requiredLocalizedOverviewKeys));
  });

  it("keeps the product-introduction copy localized in both locales", () => {
    const requiredKeys = [
      "overview.change",
      "overview.governance",
      "overview.flowCaption",
      "overview.conceptsTitle",
      "overview.ownershipTitle",
      "overview.projectionTitle",
      ...requiredLocalizedOverviewKeys
    ];

    expect(requiredKeys.every((key) => messages.en[key] && messages.zh[key])).toBe(true);
  });
});

describe("overview route isolation", () => {
  it("keeps the root route free of scoped data loaders", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("getScopedAssetCatalog");
    expect(source).not.toContain("getAgentServiceWorkspace");
    expect(source).not.toContain("getScopedGovernanceOverview");
  });

  it("keeps the overview visual explanatory and scope-data-free", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

    expect(source).toContain('data-testid="architecture-introduction-canvas"');
    expect(source).toContain('data-testid="architecture-asset-constellation"');
    expect(source).not.toContain("getScopedAssetCatalog");
    expect(source).not.toContain("getAgentServiceWorkspace");
    expect(source).not.toContain("getScopedGovernanceOverview");
  });

  it("localizes overview-only visible and aria labels", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-label={t("overview.flowAriaLabel")}');
    expect(source).toContain('{t("overview.flowLegend")}');
    expect(source).toContain('aria-label={t("overview.relationshipAriaLabel")}');
    expect(source).toContain('{t("overview.relationshipEyebrow")}');
    expect(source).not.toContain("Architecture concept map");
    expect(source).not.toContain("MCP -&gt; PG -&gt; GRAPH");
    expect(source).not.toContain("Architecture relationship map");
    expect(source).not.toContain("TYPED LINKS");
  });

  it("uses an eight-column desktop flow whenever rightward connectors are visible", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const css = await readFile(new URL("../../app/styles/globals.css", import.meta.url), "utf8");

    expect(source).toContain('className="sf-overview-flow"');
    expect(source).toContain('sf-overview-flow-connector');
    expect(source).toContain("xl:block");
    expect(css).toContain("@media (min-width: 1280px)");
    expect(css).toContain("grid-template-columns: repeat(8, minmax(0, 1fr));");
    expect(css).not.toContain("grid-template-columns: repeat(6, minmax(0, 1fr));");
  });

  it("uses staged canvas motion with an explicit reduced-motion fallback", async () => {
    const css = await readFile(new URL("../../app/styles/globals.css", import.meta.url), "utf8");

    expect(css).toContain(".sf-overview-canvas");
    expect(css).toContain(".sf-overview-stage");
    expect(css).toContain(".sf-overview-asset-node");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".sf-overview-canvas [data-motion]");
  });
});
