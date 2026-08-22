import { describe, expect, it } from "vitest";
import { relationColor, relationRgb, summarizeRelations, toggleRelationCode } from "./architecture-graph-relations";

describe("architecture relation palette", () => {
  it("maps relation codes deterministically into the fixed palette", () => {
    expect(relationRgb("CALLS")).toBe(relationRgb("CALLS"));
    expect(relationRgb("CALLS")).toMatch(/^(\d{1,3},){2}\d{1,3}$/);
    expect(relationRgb("CALLS")).not.toBe(relationRgb("READS"));
    expect(relationColor("CALLS", 2)).toBe(`rgba(${relationRgb("CALLS")},1)`);
    expect(relationColor("CALLS", -1)).toBe(`rgba(${relationRgb("CALLS")},0.08)`);
  });

  it("summarizes distinct relation codes by descending count with a stable cap", () => {
    const summary = summarizeRelations(["CALLS", "CALLS", "READS", "CALLS", "WRITES", "READS", "A", "B", "C"], 3);
    expect(summary.map((item) => item.code)).toEqual(["CALLS", "READS", "A"]);
    expect(summary[0]).toMatchObject({ count: 3, rgb: relationRgb("CALLS") });
  });

  it("toggles relation filter membership without mutating the source set", () => {
    const source = new Set(["CALLS"]);
    expect([...toggleRelationCode(source, "CALLS")]).toEqual([]);
    expect([...toggleRelationCode(source, "READS")]).toEqual(["CALLS", "READS"]);
    expect([...source]).toEqual(["CALLS"]);
  });
});
