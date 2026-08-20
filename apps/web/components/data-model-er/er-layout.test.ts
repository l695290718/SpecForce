import { describe, expect, it } from "vitest";
import type { DataModelGraphNode } from "@specforge/core";
import type { ErEntityCard, ErFieldRow, ErRelationGroup } from "./er-diagram-projection";
import { erCardSize, fromElkGraph, layoutErDiagram, layoutErDiagramWithFallback, toElkGraph } from "./er-layout";

const scope = { applicationServiceId: "svc", scopePath: "scope" };

function graphNode(id: string, nodeType: DataModelGraphNode["nodeType"], displayName = id, metadata: Record<string, unknown> = {}): DataModelGraphNode {
  return { id, nodeType, logicalId: id, rootModelId: "model:accounts", displayName, scope, metadata };
}

function field(id: string, entityId: string, ordinal: number, dataType = "uuid"): ErFieldRow {
  return {
    id,
    entityId,
    rootModelId: "model:accounts",
    logicalId: id,
    fieldName: id.split(":").at(-1) ?? id,
    displayName: id.split(":").at(-1) ?? id,
    dataType,
    ordinal,
    primaryKey: id.endsWith(".id"),
    foreignKey: id.endsWith(".accountId"),
    unique: false,
    nullable: !id.endsWith(".id"),
    generated: false,
    node: graphNode(id, "dataField", id, { ordinal, dataType })
  };
}

function entity(id: string, ordinal: number, fields: ErFieldRow[]): ErEntityCard {
  return { id, rootModelId: "model:accounts", logicalId: id, displayName: id, ordinal, external: false, fields, node: graphNode(id, "dataEntity", id, { ordinal }) };
}

function relation(id: string, sourceEntityId: string, targetEntityId: string, mappings: ErRelationGroup["mappings"] = []): ErRelationGroup {
  return { id, sourceEntityId, targetEntityId, mappingConfigured: mappings.length > 0, mappings, edgeIds: [`edge:${id}`], metadata: {} };
}

describe("field-aware er layout", () => {
  it("places fields in ordinal order and returns exact source and target ports", () => {
    const account = entity("entity:account", 0, [field("field:account.id", "entity:account", 0), field("field:account.createdAt", "entity:account", 1, "timestamp")]);
    const order = entity("entity:order", 1, [field("field:order.createdAt", "entity:order", 1, "timestamp"), field("field:order.accountId", "entity:order", 0)]);
    const mapped = { id: "mapping:account-order", sourceFieldId: "field:order.accountId", targetFieldId: "field:account.id", sourceEdgeId: "edge:account-order", mappingIndex: 0, metadata: {} };
    const result = layoutErDiagram({ entities: [order, account], relations: [relation("relation:account-order", order.id, account.id, [mapped])] });

    expect(result.entities.map((item) => item.id)).toEqual(["entity:account", "entity:order"]);
    expect(result.entities.find((item) => item.id === order.id)?.fields.map((item) => item.fieldId)).toEqual(["field:order.accountId", "field:order.createdAt"]);
    expect(result.fieldPorts["field:order.accountId"]?.center.y).toBeLessThan(result.fieldPorts["field:order.createdAt"]?.center.y ?? 0);
    expect(result.routes[0]?.points[0]).toEqual(result.fieldPorts["field:order.accountId"]?.source);
    expect(result.routes[0]?.points.at(-1)).toEqual(result.fieldPorts["field:account.id"]?.target);
    expect(result.routes[0]?.points.length).toBeGreaterThan(2);
  });

  it("uses header ports for entity-only relations", () => {
    const source = entity("entity:source", 0, [field("field:source.id", "entity:source", 0)]);
    const target = entity("entity:target", 1, [field("field:target.id", "entity:target", 0)]);
    const result = layoutErDiagram({ entities: [source, target], relations: [relation("relation:entity-only", source.id, target.id)] });
    const route = result.routes[0]!;

    expect(route.mappingConfigured).toBe(false);
    expect(route.sourceFieldId).toBeUndefined();
    expect(route.targetFieldId).toBeUndefined();
    expect(route.points[0]).toEqual(result.headerPorts[source.id]?.source);
    expect(route.points.at(-1)).toEqual(result.headerPorts[target.id]?.target);
  });

  it("keeps measured card dimensions and field rows deterministic through ELK", () => {
    const account = entity("entity:account", 0, [field("field:account.id", "entity:account", 0)]);
    const request = { entities: [account], relations: [], dimensions: { [account.id]: { width: 360, height: 190 } } };
    const elk = toElkGraph(request);
    const result = fromElkGraph(request, { children: [{ id: account.id, x: 120, y: 80, width: 360, height: 190 }] });

    expect(elk.children).toEqual([{ id: account.id, width: 360, height: 190 }]);
    expect(result.entities[0]).toMatchObject({ id: account.id, x: 120, y: 80, width: 360, height: 190 });
    expect(result.fieldRows["field:account.id"]?.width).toBe(360);
  });

  it("keeps fallback field-aware and deterministic", () => {
    const source = entity("entity:source", 0, [field("field:source.id", "entity:source", 0)]);
    const target = entity("entity:target", 1, [field("field:target.id", "entity:target", 0)]);
    const mapped = { id: "mapping:source-target", sourceFieldId: "field:source.id", targetFieldId: "field:target.id", sourceEdgeId: "edge:source-target", metadata: {} };
    const request = { entities: [source, target], relations: [relation("relation:source-target", source.id, target.id, [mapped])] };
    const first = layoutErDiagramWithFallback(request);
    const second = layoutErDiagramWithFallback(request);

    expect(first).toEqual(second);
    expect(first.fieldPorts["field:source.id"]).toBeDefined();
    expect(first.routes[0]?.points[0]).toEqual(first.fieldPorts["field:source.id"]?.source);
    expect(first.routes[0]?.points.at(-1)).toEqual(first.fieldPorts["field:target.id"]?.target);
    expect(first.routes[0]?.points).not.toEqual([
      first.entities[0]!.x + first.entities[0]!.width / 2,
      first.entities[0]!.y + first.entities[0]!.height / 2,
      first.entities[1]!.x + first.entities[1]!.width / 2,
      first.entities[1]!.y + first.entities[1]!.height / 2
    ]);
  });

  it("retains the legacy graph layout adapter while the workspace migrates", () => {
    const node = { id: "entity:legacy", nodeType: "dataEntity" as const, logicalId: "entity:legacy", rootModelId: "model:legacy", displayName: "Legacy", label: "Legacy", scope, metadata: { fieldCount: 1 }, fieldCount: 1 };
    const result = fromElkGraph({ nodes: [node], edges: [] }, { children: [{ id: node.id, x: 10, y: 20 }] });
    expect(result.nodes[0]).toMatchObject({ id: node.id, x: 10, y: 20 });
    expect(erCardSize(node).height).toBeGreaterThan(48);
  });
});
