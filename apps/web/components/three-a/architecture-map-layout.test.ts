import { describe, expect, it } from "vitest";
import type { ArchitectureMapQueryResult } from "@specforge/knowledge-query";
import { layoutArchitectureMap } from "./architecture-map-layout";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const unit = (unitIdentity: string, layer: "BIZ" | "SYS" | "TECH", canonicalName: string, criticality: number) => ({ ...scope, generationId: "generation-1", baselineId: "baseline-1", projectionManifestId: "projection-1", unitIdentity, layer, kind: layer === "BIZ" ? "CAPABILITY" as const : layer === "SYS" ? "SERVICE" as const : "RUNTIME" as const, canonicalName, aliases: [], memberCount: 1, criticality, completeness: .8, evidenceCount: 1, unclassifiedMemberCount: 0, contentDigest: unitIdentity + "-digest" });
const result: ArchitectureMapQueryResult = { ...scope, baselineId: "baseline-1", projectionManifestId: "projection-1", profileId: "profile", profileVersion: "1", relationshipVersion: "r1", resultDigest: "result-digest", generationId: "generation-1", availability: "READY", units: [unit("unit:tech:runtime", "TECH", "Runtime", .2), unit("unit:biz:orders", "BIZ", "Orders", .9), unit("unit:sys:orders", "SYS", "Order Service", .7)], mappings: [{ ...scope, generationId: "generation-1", baselineId: "baseline-1", projectionManifestId: "projection-1", mappingIdentity: "mapping-1", sourceUnitIdentity: "unit:biz:orders", targetUnitIdentity: "unit:sys:orders", sourceLayer: "BIZ", targetLayer: "SYS", mappingFamily: "realizes", relationshipCount: 1, evidenceCount: 1, confidence: .9, contentDigest: "mapping-digest" }], totalByLayer: { BIZ: 1, SYS: 1, TECH: 1 }, returnedByLayer: { BIZ: 1, SYS: 1, TECH: 1 }, unclassifiedCount: 0, mappingCompleteness: 1, evidenceCoverage: 1 };

describe("architecture map layout", () => {
  it("is deterministic and groups layers in fixed columns", () => {
    const first = layoutArchitectureMap(result, { width: 1200, height: 620 });
    expect(first).toEqual(layoutArchitectureMap(result, { width: 1200, height: 620 }));
    expect(first.units.map((item) => [item.unit.layer, item.x])).toEqual([["BIZ", 16], ["SYS", first.units[1]!.x], ["TECH", first.units[2]!.x]]);
    expect(first.mappings[0]).toMatchObject({ x1: expect.any(Number), x2: expect.any(Number) });
  });

  it("uses stacked transition slices on narrow viewports", () => {
    const layout = layoutArchitectureMap(result, { width: 390, height: 620 });
    expect(layout.mobile).toBe(true);
    expect(new Set(layout.units.map((item) => item.x))).toEqual(new Set([16]));
    expect(layout.units[0]!.y).not.toBe(layout.units[1]!.y);
  });
});
