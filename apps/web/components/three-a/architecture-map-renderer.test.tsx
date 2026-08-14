import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ArchitectureMapQueryResult } from "@specforge/knowledge-query";
import { ArchitectureMapRenderer } from "./architecture-map-renderer";

vi.mock("../language-provider", () => ({ T: ({ k }: { k: string }) => k }));
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const empty: ArchitectureMapQueryResult = { ...scope, baselineId: "baseline-1", projectionManifestId: "projection-1", profileId: "profile", profileVersion: "1", relationshipVersion: "r1", resultDigest: "result-digest", generationId: "generation-1", availability: "NO_GOVERNED_ARCHITECTURE_UNITS", units: [], mappings: [], totalByLayer: { BIZ: 0, SYS: 0, TECH: 0 }, returnedByLayer: { BIZ: 0, SYS: 0, TECH: 0 }, unclassifiedCount: 0, mappingCompleteness: 0, evidenceCoverage: 0 };

describe("architecture map renderer", () => {
  it("renders an explicit governed-unit empty state", () => {
    expect(renderToStaticMarkup(<ArchitectureMapRenderer result={empty} onSelect={vi.fn()} />)).toContain("architecture-map-empty");
  });
});
