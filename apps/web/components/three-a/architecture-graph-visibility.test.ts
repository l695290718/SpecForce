import { describe, expect, it } from "vitest";
import type { GraphSemanticEdge, GraphSemanticNode } from "./architecture-graph-store";
import { defaultExpandedClusterIds, deriveVisibleArchitectureGraph } from "./architecture-graph-visibility";

function cluster(id: string, layer: "BIZ" | "SYS" | "TECH"): GraphSemanticNode {
  return { id: `cluster:${id}`, attributes: { stableId: `cluster:${id}`, kind: "cluster", label: id, layer, clusterId: id, memberCount: 1, degree: 1, criticality: 0, x: 0, y: 0 } };
}

function member(id: string, clusterId: string, layer: "BIZ" | "SYS" | "TECH"): GraphSemanticNode {
  return { id: `fact:${id}`, attributes: { stableId: `fact:${id}`, kind: "fact", label: id, layer, clusterId, memberCount: 1, degree: 1, criticality: 0, x: 0, y: 0 } };
}

function edge(id: string, source: string, target: string, relationCode = "CALLS"): GraphSemanticEdge {
  return { id, source, target, attributes: { stableId: id, relationCode, confidence: 1, bridge: false, weight: 1 } };
}

describe("architecture graph visibility", () => {
  it("selects one relation-bearing cluster per 3A layer before deterministic tie-breaking", () => {
    const nodes = [
      cluster("biz-orders", "BIZ"), member("biz-orders-rule", "biz-orders", "BIZ"),
      cluster("biz-catalog", "BIZ"), member("biz-catalog-rule", "biz-catalog", "BIZ"),
      cluster("sys-orders", "SYS"), member("sys-orders-api", "sys-orders", "SYS"),
      cluster("tech-events", "TECH"), member("tech-events-topic", "tech-events", "TECH")
    ];
    const edges = [
      edge("member:biz-orders", "cluster:biz-orders", "fact:biz-orders-rule", "ARCHITECTURE_MEMBERSHIP"),
      edge("member:biz-catalog", "cluster:biz-catalog", "fact:biz-catalog-rule", "ARCHITECTURE_MEMBERSHIP"),
      edge("member:sys-orders", "cluster:sys-orders", "fact:sys-orders-api", "ARCHITECTURE_MEMBERSHIP"),
      edge("member:tech-events", "cluster:tech-events", "fact:tech-events-topic", "ARCHITECTURE_MEMBERSHIP"),
      edge("rel:biz-catalog", "fact:biz-catalog-rule", "fact:sys-orders-api"),
      edge("rel:sys-orders", "fact:sys-orders-api", "fact:tech-events-topic"),
      edge("rel:tech-events", "fact:tech-events-topic", "fact:sys-orders-api")
    ];

    expect(defaultExpandedClusterIds(nodes, edges, 3)).toEqual(new Set(["biz-catalog", "sys-orders", "tech-events"]));
  });

  it("caps expanded member facts and makes the visible graph endpoint-safe", () => {
    const nodes = [
      cluster("biz", "BIZ"), member("biz-a", "biz", "BIZ"), member("biz-b", "biz", "BIZ"),
      cluster("sys", "SYS"), member("sys-a", "sys", "SYS"), member("sys-b", "sys", "SYS"),
      { id: "fact:unclustered", attributes: { stableId: "fact:unclustered", kind: "fact" as const, label: "unclustered", layer: "SYS" as const, memberCount: 1, degree: 0, criticality: 0, x: 0, y: 0 } }
    ];
    const edges = [
      edge("member:biz-a", "cluster:biz", "fact:biz-a", "ARCHITECTURE_MEMBERSHIP"),
      edge("member:biz-b", "cluster:biz", "fact:biz-b", "ARCHITECTURE_MEMBERSHIP"),
      edge("member:sys-a", "cluster:sys", "fact:sys-a", "ARCHITECTURE_MEMBERSHIP"),
      edge("member:sys-b", "cluster:sys", "fact:sys-b", "ARCHITECTURE_MEMBERSHIP"),
      edge("rel:visible", "fact:biz-a", "fact:biz-b"),
      edge("rel:hidden", "fact:biz-a", "fact:sys-a")
    ];
    const expanded = defaultExpandedClusterIds(nodes, edges, 2);
    const visible = deriveVisibleArchitectureGraph({ nodes, edges }, expanded);

    expect([...expanded]).toEqual(["biz"]);
    expect([...visible.nodeIds].filter((id) => id.startsWith("fact:") && id !== "fact:unclustered")).toHaveLength(2);
    expect(visible.nodeIds).toEqual(new Set(["cluster:biz", "cluster:sys", "fact:biz-a", "fact:biz-b", "fact:unclustered"]));
    expect(visible.edgeIds).toEqual(new Set(["member:biz-a", "member:biz-b", "rel:visible"]));
  });
});
