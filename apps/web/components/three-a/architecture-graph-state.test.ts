import { describe, expect, it } from "vitest";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { expansionKey, graphStateFromInitial, mergeGraphExpansion, type GraphExpansionPage, type GraphFilters } from "./architecture-graph-state";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const filters: GraphFilters = { relationTypes: ["DEPENDS_ON"], layers: ["SYS", "TECH"] };

function node(assertionId: string, layer: KnowledgeProjectionNode["layer"], sortKey = `${layer}|${assertionId}`): KnowledgeProjectionNode {
  return { ...scope, generationId: "generation-1", baselineId: "baseline-1", assertionId, semanticIdentity: assertionId, layer, sortKey, contentDigest: `digest-${assertionId}` };
}

function edge(relationshipIdentity: string, sourceAssertionId: string, targetAssertionId: string, relationCode = "DEPENDS_ON"): KnowledgeProjectionEdge {
  return { ...scope, generationId: "generation-1", baselineId: "baseline-1", relationshipIdentity, sourceAssertionId, targetAssertionId, sourceSemanticIdentity: sourceAssertionId, targetSemanticIdentity: targetAssertionId, relationCode, confidence: 1, relationshipVersion: "rv-1", contentDigest: `digest-${relationshipIdentity}` };
}

function page(nodes: KnowledgeProjectionNode[], edges: KnowledgeProjectionEdge[], continuation?: string): GraphExpansionPage {
  return { nodes, edges, ...(continuation ? { continuation } : {}) };
}

describe("architecture graph state", () => {
  it("merges expansion pages by stable identity without losing the root focus", () => {
    const sys1 = node("sys-1", "SYS");
    const tech1 = node("tech-1", "TECH");
    const tech2 = node("tech-2", "TECH");
    const depends = edge("depends", "sys-1", "tech-1");
    const calls = edge("calls", "tech-1", "tech-2", "CALLS");
    const first = graphStateFromInitial("sys-1", page([sys1, tech1], [depends], "continue-1"));
    const next = mergeGraphExpansion(first, expansionKey("tech-1", "downstream", filters), page([tech1, tech2], [calls]));

    expect([...next.nodesById.keys()].sort()).toEqual(["sys-1", "tech-1", "tech-2"]);
    expect([...next.edgesById.keys()].sort()).toEqual([calls.relationshipIdentity, depends.relationshipIdentity].sort());
    expect(next.rootFocusId).toBe("sys-1");
    expect(next.selectedId).toBe("sys-1");
  });

  it("stores continuations per selected node direction and filter key", () => {
    const firstKey = expansionKey("sys-1", "upstream", { relationTypes: ["REALIZED_BY"], layers: ["BIZ", "SYS"] });
    const secondKey = expansionKey("sys-1", "downstream", { relationTypes: ["DEPENDS_ON"], layers: ["SYS", "TECH"] });
    expect(firstKey).not.toBe(secondKey);

    let state = graphStateFromInitial("sys-1", page([node("sys-1", "SYS")], []));
    state = mergeGraphExpansion(state, firstKey, page([], [], "upstream-page-2"));
    state = mergeGraphExpansion(state, secondKey, page([], [], "downstream-page-2"));
    expect(state.continuations.get(firstKey)).toBe("upstream-page-2");
    expect(state.continuations.get(secondKey)).toBe("downstream-page-2");

    state = mergeGraphExpansion(state, firstKey, page([], []));
    expect(state.continuations.has(firstKey)).toBe(false);
    expect(state.continuations.get(secondKey)).toBe("downstream-page-2");
  });

  it("preserves the previous state when a merge would exceed the client node cap", () => {
    const first = graphStateFromInitial("sys-1", page([node("sys-1", "SYS")], []));
    const expansion = Array.from({ length: 501 }, (_, index) => node(`tech-${index}`, "TECH"));
    const next = mergeGraphExpansion(first, expansionKey("sys-1", "downstream", filters), page(expansion, []));

    expect(next.nodesById).toBe(first.nodesById);
    expect(next.partialReasons).toContain("MAX_NODES");
    expect(next.continuations.size).toBe(0);
  });
});
