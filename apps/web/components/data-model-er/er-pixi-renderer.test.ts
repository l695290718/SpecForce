import { describe, expect, it } from "vitest";
import type { DataModelGraphNode } from "@specforge/core";
import type { ErDiagramProjection, ErEntityCard, ErFieldRow, ErRelationGroup } from "./er-diagram-projection";
import { buildErDrawModel, canUseWebgl, ErPixiRenderer } from "./er-pixi-renderer";
import { layoutErDiagram } from "./er-layout";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };

function node(id: string, nodeType: DataModelGraphNode["nodeType"], displayName = id, metadata: Record<string, unknown> = {}): DataModelGraphNode {
  return { id, nodeType, logicalId: id, rootModelId: "model:orders", displayName, scope, metadata };
}

function field(id: string, entityId: string, ordinal: number, foreignKey = false): ErFieldRow {
  return { id, entityId, rootModelId: "model:orders", logicalId: id, fieldName: id.split(":").at(-1) ?? id, displayName: id.split(":").at(-1) ?? id, dataType: "uuid", ordinal, primaryKey: id.endsWith(".id"), foreignKey, unique: false, nullable: !id.endsWith(".id"), generated: false, node: node(id, "dataField", id, { entityId, ordinal, dataType: "uuid" }) };
}

function entity(id: string, ordinal: number, fields: ErFieldRow[]): ErEntityCard {
  return { id, rootModelId: "model:orders", logicalId: id, displayName: id.split(":").at(-1) ?? id, ordinal, external: false, fields, node: node(id, "dataEntity", id, { ordinal }) };
}

function projection(): ErDiagramProjection {
  const account = entity("entity:account", 0, [field("field:account.id", "entity:account", 0)]);
  const order = entity("entity:order", 1, [field("field:order.id", "entity:order", 0), field("field:order.accountId", "entity:order", 1, true)]);
  const mapping = { id: "relation:account-order:edge:account-order-field", sourceFieldId: "field:order.accountId", targetFieldId: "field:account.id", sourceEdgeId: "edge:account-order-field", mappingIndex: 0, metadata: {} };
  const relation: ErRelationGroup = { id: "relation:account-order", sourceEntityId: order.id, targetEntityId: account.id, mappingConfigured: true, mappings: [mapping], edgeIds: [mapping.sourceEdgeId], metadata: {} };
  return {
    identity: { ...scope, mode: "SCOPE", catalogDigest: "catalog-1", relationshipDigest: "relationship-1", topologyDigest: "topology-1" },
    models: [{ id: "model:orders", displayName: "Orders", entities: [account, order], node: node("model:orders", "dataModel", "Orders") }],
    entities: [account, order],
    relations: [relation],
    qualityIssues: []
  };
}

describe("er pixi draw model", () => {
  it("draws entity cards with ordered field rows and exact mapped routes", () => {
    const data = projection();
    const layout = layoutErDiagram({ entities: data.entities, relations: data.relations });
    const model = buildErDrawModel(data, layout);

    expect(model.entities.map((item) => item.id)).toEqual(["entity:account", "entity:order"]);
    expect(model.entities.find((item) => item.id === "entity:order")?.fields.map((item) => item.id)).toEqual(["field:order.id", "field:order.accountId"]);
    expect(model.routes[0]).toMatchObject({ sourceFieldId: "field:order.accountId", targetFieldId: "field:account.id", mappingConfigured: true });
    expect(model.routes[0]?.points.length).toBeGreaterThan(2);
  });

  it("highlights the selected field and every route touching it", () => {
    const data = projection();
    const model = buildErDrawModel(data, layoutErDiagram({ entities: data.entities, relations: data.relations }), { selection: { fieldId: "field:order.accountId", entityId: "entity:order" } });
    expect(model.entities.find((item) => item.id === "entity:order")?.selected).toBe(true);
    expect(model.entities.find((item) => item.id === "entity:order")?.fields.find((item) => item.id === "field:order.accountId")?.selected).toBe(true);
    expect(model.routes[0]?.selected).toBe(true);
  });

  it("keeps the semantic fallback available when WebGL is unavailable", () => {
    expect(canUseWebgl()).toBe(false);
    expect(new ErPixiRenderer().getStatus().ready).toBe(false);
  });
});
