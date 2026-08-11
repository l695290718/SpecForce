import { describe, expect, it } from "vitest";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { DeterministicGraphAnalysisMaterializer } from "./graph-analysis-materializer.js";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const identity = { ...scope, generationId: "generation-1", baselineId: "baseline-1" };

function node(assertionId: string, semanticIdentity: string, layer: KnowledgeProjectionNode["layer"]): KnowledgeProjectionNode {
  return { ...identity, assertionId, semanticIdentity, layer, sortKey: `${layer}|${semanticIdentity}|${assertionId}`, contentDigest: `node:${assertionId}` };
}

function edge(relationshipIdentity: string, sourceAssertionId: string, targetAssertionId: string): KnowledgeProjectionEdge {
  const source = nodes.find((item) => item.assertionId === sourceAssertionId)!;
  const target = nodes.find((item) => item.assertionId === targetAssertionId)!;
  return { ...identity, relationshipIdentity, sourceAssertionId, targetAssertionId, sourceSemanticIdentity: source.semanticIdentity, targetSemanticIdentity: target.semanticIdentity, relationCode: "REALIZES", confidence: 0.9, relationshipVersion: "r1", contentDigest: `edge:${relationshipIdentity}` };
}

const nodes = [
  node("biz-order", "orders.intent", "BIZ"),
  node("sys-order", "orders.service", "SYS"),
  node("tech-store", "orders.store", "TECH")
];
const edges = [edge("intent-service", "biz-order", "sys-order"), edge("service-store", "sys-order", "tech-store")];

describe("deterministic graph analysis materializer", () => {
  it("produces stable clusters, bridge metrics, and summary edges regardless of source ordering", async () => {
    const materializer = new DeterministicGraphAnalysisMaterializer();
    const input = { scope, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: "projection-manifest:generation-1", analysisVersion: "3a.graph-analysis.v1" };

    const forward = await materializer.build({ ...input, nodes, edges });
    const reversed = await materializer.build({ ...input, nodes: [...nodes].reverse(), edges: [...edges].reverse() });

    expect(reversed).toEqual(forward);
    expect(forward.clusters).toHaveLength(3);
    expect(forward.nodeMetrics.find((metric) => metric.assertionId === "sys-order")).toMatchObject({ isBridge: true, degree: 2 });
    expect(forward.summaryEdges.map((item) => item.bridge)).toEqual([true, true]);
  });

  it("fails closed when a projection node belongs to another Scope", async () => {
    const materializer = new DeterministicGraphAnalysisMaterializer();
    await expect(materializer.build({ scope, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: "projection-manifest:generation-1", analysisVersion: "3a.graph-analysis.v1", nodes: [{ ...nodes[0]!, scopePath: "other/scope" }], edges: [] })).rejects.toThrow("GRAPH_ANALYSIS_SCOPE_MISMATCH");
  });

  it("fails closed when an edge has no published endpoint", async () => {
    const materializer = new DeterministicGraphAnalysisMaterializer();
    await expect(materializer.build({ scope, generationId: identity.generationId, baselineId: identity.baselineId, projectionManifestId: "projection-manifest:generation-1", analysisVersion: "3a.graph-analysis.v1", nodes: [nodes[0]!], edges: [edges[0]!] })).rejects.toThrow("GRAPH_ANALYSIS_ENDPOINT_UNRESOLVED");
  });
});
