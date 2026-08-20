import { describe, expect, it } from "vitest";
import type { DataModelGraphResponse } from "@specforge/core";
import { createErGraphState, deriveErLod, mergeErGraphResponses, relationGroups, selectErGraph } from "./er-graph-store";

const response = (overrides: Partial<DataModelGraphResponse> = {}): DataModelGraphResponse => ({ architectureScope: { applicationServiceId: "svc", scopePath: "scope" }, mode: "MODEL", nodes: [{ id: "dataEntity:e", nodeType: "dataEntity", logicalId: "e", rootModelId: "m", displayName: "Orders", scope: { applicationServiceId: "svc", scopePath: "scope" }, metadata: {} }], edges: [], waterlines: { catalogVersion: "1", catalogDigest: "c", relationshipVersion: "2", relationshipDigest: "r" }, hasMore: false, partial: false, errors: [], ...overrides });

describe("er graph store", () => {
  it("merges pages deterministically and groups composite mappings", () => {
    const first = response({ edges: [{ id: "b", source: "a", target: "b", relationshipCode: "REFERENCES", metadata: { relationId: "rel", mappingIndex: 1, mappingCount: 2 } }] });
    const second = response({ nodes: [...first.nodes, { id: "dataField:f", nodeType: "dataField", logicalId: "f", rootModelId: "m", displayName: "id", scope: first.architectureScope, metadata: {} }], edges: [{ id: "a", source: "a", target: "b", relationshipCode: "REFERENCES", metadata: { relationId: "rel", mappingIndex: 0, mappingCount: 2 } }] });
    const merged = mergeErGraphResponses([first, second]);
    expect(merged.nodes.map((node) => node.id)).toEqual(["dataEntity:e", "dataField:f"]);
    expect(relationGroups(merged.edges).get("relation:rel")?.map((edge) => edge.mappingIndex)).toEqual([0, 1]);
  });

  it("filters without mutating the source snapshot", () => {
    const state = createErGraphState(mergeErGraphResponses([response({ nodes: [...response().nodes, { id: "dataField:f", nodeType: "dataField", logicalId: "f", rootModelId: "m", displayName: "Customer ID", scope: response().architectureScope, metadata: {} }] })]));
    const filtered = selectErGraph({ ...state, search: "customer" });
    expect(filtered.nodes).toHaveLength(1);
    expect(state.snapshot.nodes).toHaveLength(2);
  });

  it("downgrades to semantic skeleton above the declared capacity", () => {
    expect(deriveErLod(501, 0, 1, 500).lod).toBe("SKELETON");
    expect(deriveErLod(2, 1, 0.4).showFields).toBe(true);
    expect(deriveErLod(2, 1, 0.2).showFields).toBe(false);
  });
});
