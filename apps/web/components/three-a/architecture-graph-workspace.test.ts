import { describe, expect, it } from "vitest";
import type { OverviewArchitectureResult } from "@specforge/knowledge-query";
import { selectOverviewResult } from "./architecture-graph-workspace";

const envelope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner", baselineId: "baseline-1", projectionManifestId: "projection-1", profileId: "profile", profileVersion: "v1", relationshipVersion: "r1", resultDigest: "digest" };
const overview = (nodes: number, edges: number): OverviewArchitectureResult => ({ ...envelope, nodes: Array.from({ length: nodes }, (_, index) => ({ ...envelope, id: `fact:${index}`, kind: "fact", label: `fact-${index}`, memberCount: 1, degree: edges ? 1 : 0, criticality: 0, positionSeed: { x: index, y: 0 }, assertionId: `assertion-${index}` })), edges: Array.from({ length: edges }, (_, index) => ({ ...envelope, id: `edge:${index}`, sourceId: "fact:0", targetId: "fact:1", relationCode: "REALIZED_BY", confidence: 1, bridge: true })) });

describe("selectOverviewResult", () => {
  it("keeps the bounded PostgreSQL graph when derived analysis is unavailable", () => {
    const fallback = overview(2, 1);
    expect(selectOverviewResult(undefined, fallback)).toEqual({ result: fallback, source: "postgres-fallback" });
  });

  it("uses the fallback when a derived result disconnects a known relationship graph", () => {
    const fallback = overview(2, 1);
    const derived = overview(2, 0);
    expect(selectOverviewResult(derived, fallback)).toEqual({ result: fallback, source: "postgres-fallback" });
  });

  it("uses a usable derived projection", () => {
    const derived = overview(2, 1);
    expect(selectOverviewResult(derived, overview(2, 0))).toEqual({ result: derived, source: "projection" });
  });
});
