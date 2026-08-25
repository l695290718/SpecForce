import { describe, expect, it } from "vitest";
import { compileGovernanceBriefing, renderGovernanceBriefingMarkdown } from "./briefing";

const rules = [
  { id: "rule-b", name: "Rule B", description: "Second rule" },
  { id: "rule-a", name: "Rule A", description: "First rule" }
];
const adrs = [
  { id: "adr-b", name: "ADR B", status: "accepted" },
  { id: "adr-a", name: "ADR A", status: "accepted" },
  { id: "adr-c", name: "ADR C", status: "superseded" },
  { id: "adr-a", name: "ADR A duplicate", status: "accepted" } // duplicate id must be dropped
];

describe("compileGovernanceBriefing", () => {
  it("deduplicates, sorts by id, and splits accepted from other statuses", () => {
    const briefing = compileGovernanceBriefing({ rules, adrs });
    expect(briefing.rules.map((rule) => rule.id)).toEqual(["rule-a", "rule-b"]);
    expect(briefing.acceptedAdrs.map((adr) => adr.id)).toEqual(["adr-a", "adr-b"]);
    expect(briefing.otherAdrs).toHaveLength(1);
    expect(briefing.otherAdrs[0]!.status).toBe("superseded");
  });

  it("produces a stable digest for identical inputs", () => {
    const first = compileGovernanceBriefing({ rules, adrs });
    const second = compileGovernanceBriefing({ rules: [...rules].reverse(), adrs });
    expect(first.digest).toBe(second.digest);
  });

  it("renders bilingual markdown with checklist and counts", () => {
    const markdown = renderGovernanceBriefingMarkdown(compileGovernanceBriefing({ rules, adrs }), "2026-08-25T00:00:00Z");
    expect(markdown).toContain("## Business rules in force (2)");
    expect(markdown).toContain("## Accepted ADRs (2)");
    expect(markdown).toContain("入职清单");
    expect(markdown).toContain("**rule-a** — Rule A");
  });
});
