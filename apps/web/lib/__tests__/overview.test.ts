import { describe, expect, it } from "vitest";

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
