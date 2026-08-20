import { describe, expect, it } from "vitest";
import type { DataModel } from "@specforge/core";
import { DataModelGraphReadError, encodeDataModelGraphCursor, getDataModelGraph } from "./data-model-graph";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const model = (id: string, name: string): DataModel => ({ id, type: "dataModel", name, title: name, description: `${name} model`, owner: "team", status: "active", createdAt: "2026-08-20", updatedAt: "2026-08-20", architectureScope: scope, code: id, modelType: "logical", domainId: "domain-1", tables: [name], entities: [name], fields: [{ fieldName: "id", displayName: "ID", dataType: "uuid", nullable: false, owner: "team", entityId: "entity-1", id: `${id}-field-id`, ordinal: 0, primaryKey: true, unique: true, generated: true, classification: "identifier", sensitiveLevel: "internal", example: "00000000-0000-0000-0000-000000000001" }], relationships: [], constraints: [], dataClassification: "internal", lifecycle: "active", lineage: "system", schemaVersion: 2, entityDefinitions: [{ id: "entity-1", name, physicalName: `${name.toLowerCase()}s`, ordinal: 0 }], dataRelations: [], localizedContent: { en: { title: name, description: `${name} model`, fields: { [`${id}-field-id`]: { displayName: "ID" } }, entities: { "entity-1": { displayName: name } }, relationships: [], constraints: [], lifecycle: "active", lineage: "system", name }, zh: { title: `${name}模型`, description: `${name}模型`, fields: { [`${id}-field-id`]: { displayName: "编号" } }, entities: { "entity-1": { displayName: name } }, relationships: [], constraints: [], lifecycle: "active", lineage: "system", name } } } as unknown as DataModel);

const repository = (assets: DataModel[], nodes: unknown[] = [], relationships: unknown[] = []) => ({ readSnapshot: async () => ({ assets, nodes, relationships, waterlines: { catalogVersion: "1", catalogDigest: "c", relationshipVersion: "1", relationshipDigest: "r" } }) });

describe("scoped data model graph", () => {
  it("keeps MODEL mode bounded to the selected model", async () => {
    const result = await getDataModelGraph({ architectureScope: scope, subject: "tester", mode: "MODEL", rootModelId: "model-a" }, undefined, repository([model("model-a", "Order"), model("model-b", "Payment")]));
    expect(result.nodes.every((node) => node.rootModelId === "model-a")).toBe(true);
  });

  it("exposes structured entity and field metadata for the ER projection", async () => {
    const result = await getDataModelGraph({ architectureScope: scope, subject: "tester", mode: "MODEL", rootModelId: "model-a" }, undefined, repository([model("model-a", "Order")]));
    const entity = result.nodes.find((node) => node.nodeType === "dataEntity");
    const field = result.nodes.find((node) => node.nodeType === "dataField");
    expect(entity?.metadata).toMatchObject({ physicalName: "orders", ordinal: 0 });
    expect(field?.metadata).toMatchObject({ entityId: "entity-1", displayName: "ID", dataType: "uuid", ordinal: 0, primaryKey: true, unique: true, nullable: false, generated: true, classification: "identifier", sensitiveLevel: "internal", example: "00000000-0000-0000-0000-000000000001", owner: "team" });
  });

  it("rejects a cursor signed for another subject", async () => {
    const first = await getDataModelGraph({ architectureScope: scope, subject: "tester", mode: "SCOPE", pageSize: 1 }, undefined, repository([model("model-a", "Order")]));
    const cursor = first.nextCursor;
    if (!cursor) throw new Error("expected cursor");
    await expect(getDataModelGraph({ architectureScope: scope, subject: "other", mode: "SCOPE", pageSize: 1, cursor }, undefined, repository([model("model-a", "Order")]))).rejects.toBeInstanceOf(DataModelGraphReadError);
  });

  it("rejects a tampered cursor", async () => {
    await expect(getDataModelGraph({ architectureScope: scope, subject: "tester", mode: "SCOPE", cursor: `${encodeDataModelGraphCursor({ version: 1, subject: "tester", architectureScope: scope, mode: "SCOPE", filters: { nodeTypes: [], relationshipCodes: [], search: "" }, pageSize: 1, clientCapacity: 10, waterlines: { catalogVersion: "0", catalogDigest: "x", relationshipVersion: "0", relationshipDigest: "y" } })}x` }, undefined, repository([]))).rejects.toMatchObject({ code: "CURSOR_INVALID" });
  });
});
