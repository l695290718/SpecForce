import { describe, expect, it } from "vitest";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import type { GraphSummaryEdge, GraphSummaryNode, ImpactArchitectureItem, ImpactArchitectureResult, OverviewArchitectureResult, TraceArchitecturePathResult } from "@specforge/knowledge-query";
import { ARCHITECTURE_GRAPH_EDGE_LIMIT, ARCHITECTURE_GRAPH_NODE_LIMIT, createArchitectureGraphStore, edgeOpacity, highlightNeighborhood, isHighlighted, nodeColor, nodeSize, stableFactAssertionId, stableSummaryNodeId, visibleLabel, type GraphStoreIdentity } from "./architecture-graph-store";
import { createArchitectureGraphSemanticState, reduceArchitectureGraphSemanticState } from "./architecture-graph-state";

const identity: GraphStoreIdentity = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner", baselineId: "baseline-1", projectionManifestId: "manifest-1" };
const scope = { applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath };

function node(assertionId: string, layer: KnowledgeProjectionNode["layer"] = "SYS", semanticIdentity = assertionId): KnowledgeProjectionNode {
  return { ...scope, generationId: "generation-1", baselineId: identity.baselineId, assertionId, semanticIdentity, layer, sortKey: `${layer}|${assertionId}`, contentDigest: `digest:${assertionId}` };
}

function edge(relationshipIdentity: string, sourceAssertionId: string, targetAssertionId: string, relationCode = "DEPENDS_ON"): KnowledgeProjectionEdge {
  return { ...scope, generationId: "generation-1", baselineId: identity.baselineId, relationshipIdentity, sourceAssertionId, targetAssertionId, sourceSemanticIdentity: sourceAssertionId, targetSemanticIdentity: targetAssertionId, relationCode, confidence: 0.9, relationshipVersion: "rv-1", contentDigest: `digest:${relationshipIdentity}` };
}

function envelope<T extends object>(value: T): T & { applicationServiceId: string; scopePath: string; baselineId: string; projectionManifestId: string; profileId: string; profileVersion: string; relationshipVersion: string; resultDigest: string } {
  return { ...scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, profileId: "profile-1", profileVersion: "1", relationshipVersion: "rv-1", resultDigest: "result-1", ...value };
}

function summary(id: string, kind: GraphSummaryNode["kind"], assertionId?: string): GraphSummaryNode {
  return { ...scope, id, kind, label: id, ...(assertionId ? { assertionId } : {}), layer: "SYS", memberCount: kind === "cluster" ? 4 : 1, degree: 3, criticality: 2, positionSeed: { x: 10, y: 20 } };
}

function overview(nodes: GraphSummaryNode[], edges: GraphSummaryEdge[] = [], continuation?: string): OverviewArchitectureResult {
  return envelope({ nodes, edges, ...(continuation ? { continuation } : {}) });
}

function neighborhood(nodes: KnowledgeProjectionNode[], edges: KnowledgeProjectionEdge[] = [], continuation?: string): TraceArchitecturePathResult {
  return envelope({ nodes, edges, paths: [], ...(continuation ? { continuation } : {}) });
}

function impact(items: ImpactArchitectureItem[], paths: ImpactArchitectureResult["paths"] = []): ImpactArchitectureResult {
  return envelope({ focusAssertionId: items[0]?.assertionId ?? "focus", policyVersion: "impact-v1", items, paths, cutPointAssertionIds: [], countsByBand: { DIRECT: 0, LIKELY: items.length, EXTENDED: 0, UNRESOLVED: 0 } });
}

function impactItem(fact: KnowledgeProjectionNode, score: number): ImpactArchitectureItem {
  return { ...fact, depth: 2, band: "LIKELY", score, factors: { relationWeight: 80, confidence: 0.9, criticalityWeight: 1, depthDecay: 0.72 } };
}

describe("architecture graph store", () => {
  it("merges overview summaries with isolated cluster and fact IDs", () => {
    const store = createArchitectureGraphStore(identity);
    const cluster = summary("shared", "cluster");
    const fact = summary("shared", "fact", "assertion-shared");
    const result = store.mergeOverview(overview([cluster, fact], [{ ...scope, id: "summary-1", sourceId: "shared", targetId: "assertion-shared", relationCode: "REALIZED_BY", confidence: 1, bridge: true }]));

    expect(result.addedNodeIds).toEqual(["cluster:shared", "fact:assertion-shared"]);
    expect(store.graph.order).toBe(2);
    expect(store.graph.hasNode(stableSummaryNodeId(cluster))).toBe(true);
    expect(store.graph.hasNode(stableSummaryNodeId(fact))).toBe(true);
    expect(store.graph.size).toBe(1);
    expect(store.graph.getEdgeAttributes("summary:summary-1").bridge).toBe(true);
  });

  it("deduplicates neighborhoods, replaces impact scores, and stores continuations", () => {
    const store = createArchitectureGraphStore(identity);
    const sys = node("sys-1");
    const tech = node("tech-1", "TECH");
    const calls = edge("calls-1", "sys-1", "tech-1", "CALLS");
    store.mergeNeighborhood(neighborhood([sys, tech], [calls], "page-2"), "downstream");
    store.mergeNeighborhood(neighborhood([sys, tech], [calls]), "downstream");
    store.mergeImpact(impact([impactItem(tech, 88)]));

    expect(store.graph.order).toBe(2);
    expect(store.graph.size).toBe(1);
    expect(store.graph.getNodeAttributes(stableFactAssertionId("tech-1")).score).toBe(88);
    expect(store.getContinuation("downstream")).toBeUndefined();
  });

  it("keeps focus and selected nodes during bounded retention", () => {
    const store = createArchitectureGraphStore(identity);
    const root = node("root");
    store.mergeNeighborhood(neighborhood([root, ...Array.from({ length: ARCHITECTURE_GRAPH_NODE_LIMIT + 20 }, (_, index) => node(`node-${index}`, "TECH"))]));
    store.select(stableFactAssertionId("node-19"));

    expect(store.graph.order).toBe(ARCHITECTURE_GRAPH_NODE_LIMIT);
    expect(store.graph.hasNode(stableFactAssertionId("root"))).toBe(true);
    expect(store.graph.hasNode(stableFactAssertionId("node-19"))).toBe(true);
  });

  it("retains only the strongest bounded edge set and resets on identity changes", () => {
    const store = createArchitectureGraphStore(identity);
    store.mergeNeighborhood(neighborhood([node("source"), node("target", "TECH")]));
    for (let index = 0; index < ARCHITECTURE_GRAPH_EDGE_LIMIT + 25; index += 1) store.graph.addDirectedEdgeWithKey(`edge-${index}`, stableFactAssertionId("source"), stableFactAssertionId("target"), { stableId: `edge-${index}`, kind: "relationship", relationCode: "CALLS", confidence: index === ARCHITECTURE_GRAPH_EDGE_LIMIT + 24 ? 1 : 0.1, bridge: false, weight: index === ARCHITECTURE_GRAPH_EDGE_LIMIT + 24 ? 10 : 0.1 });
    const retained = store.retainWithinBudget();
    expect(retained.partialReasons).toContain("CLIENT_MAX_EDGES");
    expect(store.graph.size).toBe(ARCHITECTURE_GRAPH_EDGE_LIMIT);
    const reset = store.resetForIdentity({ ...identity, projectionManifestId: "manifest-2" });
    expect(reset.removedNodeIds).toEqual([stableFactAssertionId("source"), stableFactAssertionId("target")]);
    expect(store.graph.order).toBe(0);
    expect(store.graph.size).toBe(0);
  });

  it("exposes semantic zoom and neighborhood reducers without removing edges", () => {
    const store = createArchitectureGraphStore(identity);
    store.mergeNeighborhood(neighborhood([node("focus"), node("neighbor", "TECH")], [edge("edge-1", "focus", "neighbor")]));
    const semantic = { ...createArchitectureGraphSemanticState(), selectedId: stableFactAssertionId("focus"), neighborhoodIds: new Set([stableFactAssertionId("focus"), stableFactAssertionId("neighbor")]) };
    const neighbor = store.graph.getNodeAttributes(stableFactAssertionId("neighbor"));
    const graphEdge = { source: stableFactAssertionId("focus"), target: stableFactAssertionId("neighbor"), attributes: store.graph.getEdgeAttributes("relationship:edge-1") };
    expect(isHighlighted(stableFactAssertionId("neighbor"), semantic)).toBe(true);
    expect(edgeOpacity(graphEdge, semantic)).toBe(0.9);
    expect(visibleLabel({ ...neighbor, stableId: stableFactAssertionId("neighbor") }, semantic, 0.2)).toBeUndefined();
    expect(visibleLabel({ ...neighbor, stableId: stableFactAssertionId("neighbor") }, { ...semantic, selectedId: stableFactAssertionId("neighbor") }, 0.5)).toContain("neighbor");
    expect(nodeSize(neighbor, semantic)).toBeGreaterThan(6);
    expect(nodeColor({ ...neighbor, layer: "BIZ" })).toBe("#d97706");
    expect(store.graph.hasEdge("relationship:edge-1")).toBe(true);
  });

  it("dims unrelated nodes through the semantic neighborhood without dropping graph data", () => {
    const store = createArchitectureGraphStore(identity);
    store.mergeNeighborhood(neighborhood([node("focus"), node("neighbor"), node("other", "TECH")], [edge("near", "focus", "neighbor"), edge("far", "neighbor", "other")]));
    const state = { ...createArchitectureGraphSemanticState(), selectedId: stableFactAssertionId("focus"), neighborhoodIds: highlightNeighborhood(store.graph, stableFactAssertionId("focus")) };
    const far = { source: stableFactAssertionId("neighbor"), target: stableFactAssertionId("other"), attributes: store.graph.getEdgeAttributes("relationship:far") };
    expect(state.neighborhoodIds.has(stableFactAssertionId("other"))).toBe(false);
    expect(edgeOpacity(far, { ...state, neighborhoodIds: new Set([stableFactAssertionId("focus")]) })).toBe(0.12);
    expect(store.graph.hasEdge("relationship:far")).toBe(true);
  });

  it("resets relation and layer filters before accepting a new neighborhood", () => {
    const initial = { ...createArchitectureGraphSemanticState(), neighborhoodIds: new Set(["fact:neighbor"]) };
    const filtered = reduceArchitectureGraphSemanticState(initial, { type: "filters", filters: { relationTypes: ["CALLS", "CALLS"], layers: ["TECH", "BIZ"] } });
    expect(filtered.filters).toEqual({ relationTypes: ["CALLS"], layers: ["BIZ", "TECH"] });
    expect(filtered.neighborhoodIds.size).toBe(0);
  });

  it("rejects a sibling Scope before mutating the Graphology graph", () => {
    const store = createArchitectureGraphStore(identity);
    const sibling = overview([summary("sibling", "cluster")]);
    sibling.applicationServiceId = "com.huawei.celon.policyhub";
    expect(() => store.mergeOverview(sibling)).toThrow("GRAPH_STORE_IDENTITY_MISMATCH");
    expect(store.graph.order).toBe(0);
  });
});
