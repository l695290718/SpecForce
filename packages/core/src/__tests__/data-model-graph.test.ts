import { describe, expect, it } from "vitest";
import {
  graphError,
  normalizeDataModelGraphFilters,
  normalizeDataModelGraphPaging,
  stableEdgeKey,
  stableNodeKey
} from "../data-model-graph";

describe("data model graph contract", () => {
  it("normalizes filters for cursor bindings deterministically", () => {
    expect(normalizeDataModelGraphFilters({ nodeTypes: ["dataField", "dataModel", "dataField"], relationshipCodes: ["REFERENCES", "CONTAINS"], search: "  Order  " })).toEqual({
      nodeTypes: ["dataField", "dataModel"],
      relationshipCodes: ["CONTAINS", "REFERENCES"],
      search: "order"
    });
  });

  it("keeps stable node and edge sort keys", () => {
    expect(stableNodeKey({ nodeType: "dataField", logicalId: "model.entity.order.field.id" })).toBe("dataField:model.entity.order.field.id");
    expect(stableEdgeKey({ id: "r:0", source: "a", target: "b", relationshipCode: "REFERENCES" })).toBe("REFERENCES:a:b:r:0");
  });

  it("rejects invalid capacity and exposes bilingual errors", () => {
    expect(() => normalizeDataModelGraphPaging({ pageSize: 201, clientCapacity: 10 })).toThrow("CLIENT_CAPACITY_EXCEEDED");
    expect(graphError("SNAPSHOT_CHANGED")).toEqual(expect.objectContaining({ code: "SNAPSHOT_CHANGED", message: expect.objectContaining({ en: expect.any(String), zh: expect.any(String) }) }));
  });
});
