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

  it("localizes the three explanatory platform concepts in both locales", () => {
    const conceptKeys = [
      "overview.authoringTitle",
      "overview.authoringDescription",
      "overview.ownershipTitle",
      "overview.ownershipDescription",
      "overview.projectionTitle",
      "overview.projectionDescription",
    ] as const;

    expect(conceptKeys.every((key) => key in messages.en)).toBe(true);
    expect(conceptKeys.every((key) => key in messages.zh)).toBe(true);
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

  it("renders three localized explanation sections for the core platform model", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

    expect(source).toContain("overview.authoringTitle");
    expect(source).toContain("overview.ownershipTitle");
    expect(source).toContain("overview.projectionTitle");
  });

  it("models typed relationships with directional labels and local highlighting hooks", async () => {
    const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const css = await readFile(new URL("../../app/styles/globals.css", import.meta.url), "utf8");

    expect(source).toContain("const relationshipEdges = [");
    expect(source).toContain('aria-label="Architecture relationship constellation"');
    expect(source).toContain('data-testid="typed-relationship-list"');
    expect(source).toContain("typeKey:");
    expect(source).toContain("setActiveHighlight");
    expect(css).toContain('.sf-relationship-node[data-highlighted="true"]');
    expect(css).toContain('.sf-relationship-edge-button[data-highlighted="true"]');
  });
});
