import { describe, expect, it } from "vitest";
import type { DataModelGraphEdge, DataModelGraphNode, DataModelGraphResponse } from "@specforge/core";
import { projectErDiagram } from "./er-diagram-projection";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const waterlines = { catalogVersion: "7", catalogDigest: "catalog-7", relationshipVersion: "11", relationshipDigest: "relations-11" };

function node(id: string, nodeType: DataModelGraphNode["nodeType"], displayName: string, metadata: Record<string, unknown> = {}, rootModelId = "model:orders"): DataModelGraphNode {
  return { id, nodeType, logicalId: id.replace(`${nodeType}:`, ""), rootModelId, displayName, scope, metadata };
}

function edge(id: string, source: string, target: string, relationshipCode: string, metadata: Record<string, unknown> = {}): DataModelGraphEdge {
  return { id, source, target, relationshipCode, metadata };
}

function response(nodes: DataModelGraphNode[], edges: DataModelGraphEdge[]): DataModelGraphResponse {
  return { architectureScope: scope, mode: "MODEL", rootModelId: "model:orders", nodes, edges, waterlines, hasMore: false, partial: false, errors: [] };
}

const account = node("dataEntity:account", "dataEntity", "Account", { physicalName: "accounts", ordinal: 0 });
const order = node("dataEntity:order", "dataEntity", "Order", { physicalName: "orders", ordinal: 1 });
const accountId = node("dataField:account.id", "dataField", "id", { entityId: "account", dataType: "uuid", ordinal: 0, primaryKey: true, nullable: false });
const orderId = node("dataField:order.id", "dataField", "id", { entityId: "order", dataType: "uuid", ordinal: 0, primaryKey: true, nullable: false });
const orderAccountId = node("dataField:order.accountId", "dataField", "accountId", { entityId: "order", dataType: "uuid", ordinal: 1, nullable: false });

const contains = [
  edge("contains:account-id", account.id, accountId.id, "CONTAINS"),
  edge("contains:order-id", order.id, orderId.id, "CONTAINS"),
  edge("contains:order-account-id", order.id, orderAccountId.id, "CONTAINS")
];

describe("projectErDiagram", () => {
  it("groups fields into ordered entity cards and derives FK markers from mappings", () => {
    const projection = projectErDiagram(response(
      [account, order, accountId, orderId, orderAccountId],
      [...contains, edge("relation:account-order:entity", order.id, account.id, "REFERENCES", { relationId: "account-order", mappingCount: 1 }), edge("relation:account-order:field:0", orderAccountId.id, accountId.id, "REFERENCES", { relationId: "account-order", mappingIndex: 0, mappingCount: 1 })]
    ));

    expect(projection.entities.map((entity) => entity.id)).toEqual(["dataEntity:account", "dataEntity:order"]);
    expect(projection.entities[1]?.fields.map((field) => field.id)).toEqual(["dataField:order.id", "dataField:order.accountId"]);
    expect(projection.entities[1]?.fields[1]?.foreignKey).toBe(true);
    expect(projection.entities[0]?.physicalName).toBe("accounts");
  });

  it("keeps composite mappings in one relation group", () => {
    const orderAccountRegion = node("dataField:order.accountRegion", "dataField", "accountRegion", { entityId: "order", dataType: "text", ordinal: 2, nullable: false });
    const accountRegion = node("dataField:account.region", "dataField", "region", { entityId: "account", dataType: "text", ordinal: 1, nullable: false, unique: true });
    const projection = projectErDiagram(response(
      [account, order, accountId, orderId, orderAccountId, orderAccountRegion, accountRegion],
      [...contains, edge("contains:account-region", account.id, accountRegion.id, "CONTAINS"), edge("contains:order-account-region", order.id, orderAccountRegion.id, "CONTAINS"), edge("relation:account-order:entity", order.id, account.id, "REFERENCES", { relationId: "account-order", mappingCount: 2 }), edge("relation:account-order:field:0", orderAccountId.id, accountId.id, "REFERENCES", { relationId: "account-order", mappingIndex: 0, mappingCount: 2 }), edge("relation:account-order:field:1", orderAccountRegion.id, accountRegion.id, "REFERENCES", { relationId: "account-order", mappingIndex: 1, mappingCount: 2 })]
    ));

    expect(projection.relations.find((relation) => relation.id === "relation:account-order")?.mappings).toHaveLength(2);
    expect(projection.relations.find((relation) => relation.id === "relation:account-order")?.mappingConfigured).toBe(true);
  });

  it("does not infer a field edge from names or narrative text", () => {
    const projection = projectErDiagram(response(
      [account, order, accountId, orderId, orderAccountId],
      [...contains, edge("relation:narrative", order.id, account.id, "REFERENCES", { relationId: "narrative", description: "accountId references account.id by convention" })]
    ));

    expect(projection.relations[0]).toMatchObject({ id: "relation:narrative", mappingConfigured: false, mappings: [] });
    expect(projection.qualityIssues).toEqual([]);
    expect(projection.entities[1]?.fields[1]?.foreignKey).toBe(false);
  });

  it("reports a missing mapped endpoint instead of inventing a table edge", () => {
    const projection = projectErDiagram(response(
      [account, order, accountId, orderId, orderAccountId],
      [...contains, edge("relation:missing:entity", order.id, account.id, "REFERENCES", { relationId: "missing", mappingCount: 1 }), edge("relation:missing:field:0", orderAccountId.id, "dataField:account.missing", "REFERENCES", { relationId: "missing", mappingIndex: 0, mappingCount: 1 })]
    ));

    expect(projection.relations).toHaveLength(0);
    expect(projection.qualityIssues[0]).toMatchObject({ code: "ENDPOINT_NOT_FOUND", relationId: "missing", targetId: "dataField:account.missing" });
  });
});
