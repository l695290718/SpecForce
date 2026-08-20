import { describe, expect, it } from "vitest";
import { erCardSize, fromElkGraph, layoutErGraph, toElkGraph } from "./er-layout";
import type { ErGraphNode } from "./er-graph-store";

const node = (id: string, fieldCount = 2): ErGraphNode => ({ id, nodeType: "dataEntity", logicalId: id, rootModelId: "m", displayName: id, label: id, scope: { applicationServiceId: "svc", scopePath: "scope" }, metadata: { fieldCount }, fieldCount });

describe("er layout", () => {
  it("keeps card sizing and positions deterministic", () => {
    const request = { nodes: [node("b"), node("a", 3)], edges: [] };
    expect(layoutErGraph(request)).toEqual(layoutErGraph(request));
    expect(erCardSize(node("a", 3)).height).toBeGreaterThan(erCardSize(node("b")).height);
  });

  it("models fields as card content and relation mappings as edges", () => {
    const request = { nodes: [node("a"), node("b")], edges: [{ id: "rel:0", source: "a", target: "b", relationshipCode: "REFERENCES", relationGroupId: "relation:r", mappingIndex: 0, mappingCount: 2, metadata: {} }] };
    const elk = toElkGraph(request);
    expect(elk.children.every((child) => child.id !== "dataField:a")).toBe(true);
    expect(fromElkGraph(request, { children: elk.children.map((child, index) => ({ ...child, x: index * 300, y: 0 })) }).edges).toHaveLength(1);
  });
});
