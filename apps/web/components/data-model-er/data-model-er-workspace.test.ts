import { describe, expect, it } from "vitest";
import type { DataModelGraphResponse } from "@specforge/core";
import { buildSemanticRows } from "./data-model-er-workspace";

const graph: DataModelGraphResponse = { architectureScope: { applicationServiceId: "svc", scopePath: "scope" }, mode: "SCOPE", nodes: [{ id: "dataEntity:orders", nodeType: "dataEntity", logicalId: "orders", rootModelId: "m", displayName: "Orders", scope: { applicationServiceId: "svc", scopePath: "scope" }, metadata: {} }, { id: "dataEntity:customers", nodeType: "dataEntity", logicalId: "customers", rootModelId: "m", displayName: "Customers", scope: { applicationServiceId: "svc", scopePath: "scope" }, metadata: {} }], edges: [{ id: "r", source: "dataEntity:orders", target: "dataEntity:customers", relationshipCode: "REFERENCES", metadata: {} }], waterlines: { catalogVersion: "1", catalogDigest: "c", relationshipVersion: "1", relationshipDigest: "r" }, hasMore: false, partial: false, errors: [] };

describe("data model er workspace", () => {
  it("always exposes a semantic list for accessibility and fallback", () => {
    expect(buildSemanticRows([graph], "zh")).toEqual([{ id: "dataEntity:customers", label: "Customers", type: "数据实体", relationCount: 1 }, { id: "dataEntity:orders", label: "Orders", type: "数据实体", relationCount: 1 }]);
  });
});
