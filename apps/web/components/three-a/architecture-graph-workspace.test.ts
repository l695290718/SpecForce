import { describe, expect, it } from "vitest";
import type { ArchitectureUnitNeighborhoodResult, OverviewArchitectureResult } from "@specforge/knowledge-query";
import { graphFocusLoadKey, graphProjectionCounts, selectOverviewResult, unitNeighborhoodOverview } from "./architecture-graph-workspace";

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

describe("graphFocusLoadKey", () => {
  it("keeps overview and explore selection changes in the loaded graph", () => {
    expect(graphFocusLoadKey("overview", "assertion-1")).toBeUndefined();
    expect(graphFocusLoadKey("explore", "assertion-1")).toBeUndefined();
  });

  it("reloads impact analysis when its focus changes", () => {
    expect(graphFocusLoadKey("impact", "assertion-1")).toBe("assertion-1");
  });
});

describe("governed unit graph expansion", () => {
  it("keeps projection measures semantically distinct", () => {
    const result = overview(8, 6);
    result.nodes.forEach((node, index) => { node.kind = "cluster"; node.memberCount = index === 0 ? 7 : 5; });
    result.nodes.push(
      { ...envelope, id: "fact:api", kind: "fact", label: "orders.api", memberCount: 1, degree: 1, criticality: 0, positionSeed: { x: 0, y: 0 }, assertionId: "api" },
      { ...envelope, id: "fact:model", kind: "fact", label: "orders.model", memberCount: 1, degree: 1, criticality: 0, positionSeed: { x: 1, y: 0 }, assertionId: "model" }
    );
    result.edges.push({ ...envelope, id: "relationship:api:model", sourceId: "fact:api", targetId: "fact:model", relationCode: "CALLS", confidence: 1, bridge: false });
    expect(graphProjectionCounts(result, 307)).toEqual({ units: 8, directMembers: 42, coveredAssets: 307, mappings: 6 });
  });

  it("converts authoritative members into typed unit membership edges", () => {
    const unit = { applicationServiceId: envelope.applicationServiceId, scopePath: envelope.scopePath, generationId: "generation-1", baselineId: envelope.baselineId, projectionManifestId: envelope.projectionManifestId, unitIdentity: "unit:sys:design", layer: "SYS" as const, kind: "SERVICE" as const, canonicalName: "Design service", aliases: [], memberCount: 2, criticality: 0.8, completeness: 1, evidenceCount: 2, unclassifiedMemberCount: 0, contentDigest: "unit-digest" };
    const result: ArchitectureUnitNeighborhoodResult = { ...envelope, generationId: "generation-1", unit, adjacentUnits: [], members: ["api-1", "data-1"].map((assertionId) => ({ applicationServiceId: envelope.applicationServiceId, scopePath: envelope.scopePath, generationId: "generation-1", baselineId: envelope.baselineId, projectionManifestId: envelope.projectionManifestId, unitIdentity: unit.unitIdentity, assertionId, assetType: "api", semanticIdentity: assertionId, contentDigest: `digest-${assertionId}` })), mappings: [], sameLayerDependencies: [], evidenceRefs: [] };
    const converted = unitNeighborhoodOverview(result);
    expect(converted.nodes.filter((node) => node.kind === "cluster")).toHaveLength(1);
    expect(converted.nodes.filter((node) => node.kind === "fact").map((node) => [node.assertionId, node.layer])).toEqual([["api-1", "SYS"], ["data-1", "SYS"]]);
    expect(converted.edges.map((edge) => [edge.sourceId, edge.targetId, edge.relationCode])).toEqual([[unit.unitIdentity, "api-1", "ARCHITECTURE_MEMBERSHIP"], [unit.unitIdentity, "data-1", "ARCHITECTURE_MEMBERSHIP"]]);
  });
});
