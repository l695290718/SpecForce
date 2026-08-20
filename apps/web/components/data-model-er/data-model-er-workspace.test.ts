import { describe, expect, it } from "vitest";
import type { DataModelGraphResponse } from "@specforge/core";
import { buildFieldCatalogRows, buildSemanticRows, getErWorkspaceStatus } from "./data-model-er-workspace";
import { projectErDiagram } from "./er-diagram-projection";

const graph: DataModelGraphResponse = { architectureScope: { applicationServiceId: "svc", scopePath: "scope" }, mode: "SCOPE", nodes: [{ id: "dataEntity:orders", nodeType: "dataEntity", logicalId: "orders", rootModelId: "m", displayName: "Orders", scope: { applicationServiceId: "svc", scopePath: "scope" }, metadata: {} }, { id: "dataEntity:customers", nodeType: "dataEntity", logicalId: "customers", rootModelId: "m", displayName: "Customers", scope: { applicationServiceId: "svc", scopePath: "scope" }, metadata: {} }], edges: [{ id: "r", source: "dataEntity:orders", target: "dataEntity:customers", relationshipCode: "REFERENCES", metadata: {} }], waterlines: { catalogVersion: "1", catalogDigest: "c", relationshipVersion: "1", relationshipDigest: "r" }, hasMore: false, partial: false, errors: [] };

describe("data model er workspace", () => {
  it("always exposes a semantic list for accessibility and fallback", () => {
    expect(buildSemanticRows([graph], "zh")).toEqual([{ id: "dataEntity:customers", label: "Customers", type: "数据实体", relationCount: 1 }, { id: "dataEntity:orders", label: "Orders", type: "数据实体", relationCount: 1 }]);
  });

  it("classifies empty and partial reads without hiding the semantic fallback", () => {
    expect(getErWorkspaceStatus([])).toBe("SCOPE_UNAVAILABLE");
    expect(getErWorkspaceStatus([{ ...graph, nodes: [], edges: [] }])).toBe("EMPTY");
    expect(getErWorkspaceStatus([{ ...graph, partial: true }], projectErDiagram(graph))).toBe("PARTIAL");
  });

  it("keeps field catalog rows and field-aware mappings derived from the projection", () => {
    const account = { ...graph.nodes[1]!, id: "dataEntity:account", logicalId: "account", displayName: "Account", metadata: { ordinal: 0 } };
    const order = { ...graph.nodes[0]!, id: "dataEntity:order", logicalId: "order", displayName: "Order", metadata: { ordinal: 1 } };
    const accountId = { ...account, id: "dataField:account.id", nodeType: "dataField" as const, logicalId: "account.id", displayName: "id", metadata: { entityId: "account", fieldName: "id", ordinal: 0, primaryKey: true, dataType: "uuid" } };
    const orderAccountId = { ...order, id: "dataField:order.accountId", nodeType: "dataField" as const, logicalId: "order.accountId", displayName: "accountId", metadata: { entityId: "order", fieldName: "accountId", ordinal: 0, dataType: "uuid" } };
    const response = { ...graph, mode: "MODEL" as const, rootModelId: "m", nodes: [account, order, accountId, orderAccountId], edges: [
      { id: "contains:account", source: account.id, target: accountId.id, relationshipCode: "CONTAINS", metadata: {} },
      { id: "contains:order", source: order.id, target: orderAccountId.id, relationshipCode: "CONTAINS", metadata: {} },
      { id: "relation:account-order:entity", source: order.id, target: account.id, relationshipCode: "REFERENCES", metadata: { relationId: "account-order" } },
      { id: "relation:account-order:field", source: orderAccountId.id, target: accountId.id, relationshipCode: "REFERENCES", metadata: { relationId: "account-order", mappingIndex: 0 } }
    ] };
    const projection = projectErDiagram(response);
    expect(buildFieldCatalogRows(projection).map((row) => row.field)).toEqual(["id", "accountId"]);
    expect(projection.relations[0]?.mappings[0]).toMatchObject({ sourceFieldId: orderAccountId.id, targetFieldId: accountId.id });
  });
});
