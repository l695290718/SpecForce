import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchitectureGraphLegend } from "./architecture-graph-legend";

vi.mock("../language-provider", () => ({ T: ({ k }: { k: string }) => k }));

const relations = [
  { code: "CALLS", count: 12, rgb: "125,211,252" },
  { code: "READS", count: 4, rgb: "253,224,71" }
];

describe("architecture graph legend", () => {
  it("renders one color-chip row per relation with its count", () => {
    const markup = renderToStaticMarkup(<ArchitectureGraphLegend relations={relations} hiddenCodes={new Set()} onToggle={() => undefined} />);
    expect(markup).toContain('data-testid="architecture-graph-legend"');
    expect(markup).toContain('data-testid="architecture-graph-legend-CALLS"');
    expect(markup).toContain('data-testid="architecture-graph-legend-READS"');
    expect(markup).toContain("rgba(125,211,252,0.95)");
    expect(markup).toContain("12");
  });

  it("marks filtered relations as pressed and dimmed", () => {
    const markup = renderToStaticMarkup(<ArchitectureGraphLegend relations={relations} hiddenCodes={new Set(["READS"])} onToggle={() => undefined} />);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("renders nothing when no relations are summarized", () => {
    const markup = renderToStaticMarkup(<ArchitectureGraphLegend relations={[]} hiddenCodes={new Set()} onToggle={() => undefined} />);
    expect(markup).not.toContain('data-testid="architecture-graph-legend"');
  });
});
