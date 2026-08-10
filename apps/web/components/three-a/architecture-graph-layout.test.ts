import { describe, expect, it } from "vitest";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { layoutArchitectureGraph } from "./architecture-graph-layout";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };

function node(assertionId: string, layer: KnowledgeProjectionNode["layer"]): KnowledgeProjectionNode {
  return { ...scope, generationId: "generation-1", baselineId: "baseline-1", assertionId, semanticIdentity: assertionId, layer, sortKey: `${layer}|${assertionId}`, contentDigest: `digest-${assertionId}` };
}

function edge(relationshipIdentity: string, sourceAssertionId: string, targetAssertionId: string): KnowledgeProjectionEdge {
  return { ...scope, generationId: "generation-1", baselineId: "baseline-1", relationshipIdentity, sourceAssertionId, targetAssertionId, sourceSemanticIdentity: sourceAssertionId, targetSemanticIdentity: targetAssertionId, relationCode: "REALIZED_BY", confidence: 1, relationshipVersion: "rv-1", contentDigest: `digest-${relationshipIdentity}` };
}

describe("architecture graph layout", () => {
  it("places upstream left, focus center, downstream right, and layers in stable bands", () => {
    const biz1 = node("biz-1", "BIZ");
    const sys1 = node("sys-1", "SYS");
    const tech1 = node("tech-1", "TECH");
    const realizedBy = edge("realized-by", "biz-1", "sys-1");
    const dependsOn = edge("depends-on", "sys-1", "tech-1");
    const layout = layoutArchitectureGraph({ focusId: "sys-1", nodes: [biz1, sys1, tech1], edges: [realizedBy, dependsOn] });
    const byId = new Map(layout.nodes.map((item) => [item.id, item.position]));

    expect(byId.get("biz-1")!.x).toBeLessThan(byId.get("sys-1")!.x);
    expect(byId.get("tech-1")!.x).toBeGreaterThan(byId.get("sys-1")!.x);
    expect(byId.get("biz-1")!.y).toBeLessThan(byId.get("sys-1")!.y);
    expect(byId.get("sys-1")!.y).toBeLessThan(byId.get("tech-1")!.y);
    expect(layoutArchitectureGraph({ focusId: "sys-1", nodes: [tech1, biz1, sys1], edges: [dependsOn, realizedBy] })).toEqual(layout);
  });

  it("uses the shorter direction and prefers downstream on an equal-distance tie", () => {
    const focus = node("sys-1", "SYS");
    const upstream = node("biz-1", "BIZ");
    const downstream = node("tech-1", "TECH");
    const tie = node("tie-1", "SYS");
    const edges = [edge("upstream", "biz-1", "sys-1"), edge("downstream", "sys-1", "tech-1"), edge("tie-upstream", "tie-1", "sys-1"), edge("tie-downstream", "sys-1", "tie-1")];
    const layout = layoutArchitectureGraph({ focusId: "sys-1", nodes: [focus, upstream, downstream, tie], edges });

    expect(layout.nodes.find((item) => item.id === "biz-1")?.role).toBe("upstream");
    expect(layout.nodes.find((item) => item.id === "tech-1")?.role).toBe("downstream");
    expect(layout.nodes.find((item) => item.id === "tie-1")?.role).toBe("downstream");
  });
});
