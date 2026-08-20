import { describe, expect, it } from "vitest";
import {
  extractAssetGraph,
  localizeAsset,
  type DataModel,
  type DataRelation,
  upgradeLegacyDataModel,
  validateAssetLocalization,
  validateDataModelV2
} from "../index";

const scope = {
  applicationServiceId: "com.example.customer",
  scopePath: "/family/customer/com.example.customer"
};

function field(input: Partial<DataModel["fields"][number]> & { id: string; entityId: string; ordinal: number; fieldName: string; dataType: string; nullable: boolean }): DataModel["fields"][number] {
  return {
    displayName: input.fieldName,
    owner: "Customer Team",
    ...input
  };
}

function physicalModel(overrides: Partial<DataModel> = {}): DataModel {
  const model: DataModel = {
    id: "order-model",
    name: "Order model",
    description: "Orders and accounts.",
    code: "ORDER_MODEL",
    modelType: "physical",
    domainId: "commerce-domain",
    tables: ["orders", "accounts"],
    entities: ["Order", "Account"],
    fields: [
      field({ id: "entity-order", entityId: "entity-order", ordinal: 0, fieldName: "id", dataType: "uuid", nullable: false, primaryKey: true }),
      field({ id: "field-order-account-region", entityId: "entity-order", ordinal: 1, fieldName: "account_region", dataType: "string", nullable: false }),
      field({ id: "field-order-account-number", entityId: "entity-order", ordinal: 2, fieldName: "account_number", dataType: "string", nullable: false }),
      field({ id: "field-account-region", entityId: "entity-account", ordinal: 0, fieldName: "region", dataType: "string", nullable: false, primaryKey: true }),
      field({ id: "field-account-number", entityId: "entity-account", ordinal: 1, fieldName: "number", dataType: "string", nullable: false, primaryKey: true })
    ],
    relationships: [],
    constraints: [],
    dataClassification: "internal",
    lifecycle: "active",
    lineage: "Order service",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    architectureScope: scope,
    schemaVersion: 2,
    entityDefinitions: [
      { id: "entity-order", name: "Order", ordinal: 0 },
      { id: "entity-account", name: "Account", ordinal: 1 }
    ],
    dataRelations: [
      {
        id: "rel-order-account",
        kind: "REFERENCE",
        sourceEntityId: "entity-order",
        targetModelId: "order-model",
        targetEntityId: "entity-account",
        sourceCardinality: { min: 0, max: "many" },
        targetCardinality: { min: 1, max: 1 },
        fieldMappings: [
          { sourceFieldId: "field-order-account-region", targetFieldId: "field-account-region" },
          { sourceFieldId: "field-order-account-number", targetFieldId: "field-account-number" }
        ],
        identifying: false,
        constraintName: "fk_order_account",
        onUpdate: "NO_ACTION",
        onDelete: "RESTRICT",
        description: "An order references its account.",
        evidenceRefs: ["schema:orders"]
      }
    ],
    ...overrides
  };
  return model;
}

describe("data model v2", () => {
  it("accepts a physical model with a composite reference and extracts stable graph identities", () => {
    const model = physicalModel();

    expect(() => validateDataModelV2(model)).not.toThrow();

    const graph = extractAssetGraph("dataModel", model);
    expect(graph.relationships.filter((item) => item.code === "REFERENCES")).toHaveLength(3);
    expect(graph.relationships.find((item) => item.mappingIndex === 0)?.metadata).toMatchObject({
      relationId: "rel-order-account",
      mappingIndex: 0,
      mappingCount: 2,
      sourceCardinality: { min: 0, max: "many" },
      targetCardinality: { min: 1, max: 1 }
    });
    expect(graph.nodes.map((node) => node.logicalId)).toContain("order-model.entity.entity-order.field.field-order-account-region");
  });

  it("rejects a field whose stable owner does not exist", () => {
    expect(() => validateDataModelV2(physicalModel({
      fields: [
        ...physicalModel().fields,
        field({ id: "field-unknown-owner", entityId: "missing-entity", ordinal: 0, fieldName: "orphan", dataType: "string", nullable: true })
      ]
    }))).toThrow("DATA_FIELD_ENTITY_NOT_FOUND");
  });

  it("rejects duplicate field ownership, incompatible mappings, and invalid physical actions", () => {
    expect(() => validateDataModelV2(physicalModel({
      fields: physicalModel().fields.map((item) => item.id === "field-order-account-number" ? { ...item, ordinal: 1 } : item)
    }))).toThrow("DATA_FIELD_ORDINAL_DUPLICATE");

    expect(() => validateDataModelV2(physicalModel({
      fields: physicalModel().fields.map((item) => item.id === "field-order-account-region" ? { ...item, dataType: "integer" } : item)
    }))).toThrow("DATA_RELATION_FIELD_TYPE_INCOMPATIBLE");

    expect(() => validateDataModelV2(physicalModel({
      fields: physicalModel().fields.map((item) => item.id === "field-order-account-region" ? { ...item, nullable: false } : item),
      dataRelations: physicalModel().dataRelations!.map((relation) => ({ ...relation, onDelete: "SET_NULL" as const }))
    }))).toThrow("DATA_RELATION_SET_NULL_REQUIRES_NULLABLE");
  });

  it("enforces model-type rules for conceptual and physical relationships", () => {
    expect(() => validateDataModelV2(physicalModel({ modelType: "conceptual", dataRelations: physicalModel().dataRelations! }))).toThrow("DATA_RELATION_MAPPING_NOT_ALLOWED");
    expect(() => validateDataModelV2(physicalModel({
      dataRelations: physicalModel().dataRelations!.map((relation) => ({ ...relation, fieldMappings: [] }))
    }))).toThrow("DATA_RELATION_MAPPING_REQUIRED");
  });

  it("upgrades a single-entity v1 model deterministically and rejects ambiguous ownership", () => {
    const legacy: DataModel = {
      ...physicalModel(),
      id: "legacy-model",
      modelType: "logical",
      entities: ["Customer"],
      fields: [{ fieldName: "email", displayName: "Email", dataType: "string", nullable: false, owner: "Customer Team" }],
      schemaVersion: undefined,
      entityDefinitions: undefined,
      dataRelations: undefined
    };
    const upgraded = upgradeLegacyDataModel(legacy);
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.entityDefinitions).toEqual([{ id: "entity:legacy-model:Customer", name: "Customer", ordinal: 0 }]);
    expect(upgraded.fields[0]).toMatchObject({ id: "field:legacy-model:Customer:email", entityId: "entity:legacy-model:Customer", ordinal: 0 });

    expect(() => upgradeLegacyDataModel({ ...legacy, entities: ["Customer", "Profile"] })).toThrow("FIELD_OWNERSHIP_AMBIGUOUS");
  });

  it("uses stable IDs for v2 bilingual field and entity overlays", () => {
    const model = physicalModel({
      localizedContent: {
        zh: {
          name: "订单模型",
          description: "订单与账户。",
          relationships: [],
          constraints: [],
          lifecycle: "有效",
          lineage: "订单服务",
          entities: {
            "entity-order": { displayName: "订单" },
            "entity-account": { displayName: "账户" }
          },
          fields: {
            "field-order-account-region": { displayName: "账户区域" },
            "field-order-account-number": { displayName: "账户编号" },
            "field-account-region": { displayName: "区域" },
            "field-account-number": { displayName: "编号" },
            "entity-order": { displayName: "订单 ID" }
          }
        }
      }
    });

    expect(() => validateAssetLocalization("dataModel", model)).not.toThrow();
    expect(localizeAsset("dataModel", model, "zh").entityDefinitions?.[0]?.name).toBe("订单");
    expect(localizeAsset("dataModel", model, "zh").fields.find((item) => item.id === "field-order-account-region")?.displayName).toBe("账户区域");
    expect(() => validateAssetLocalization("dataModel", {
      ...model,
      localizedContent: { zh: { ...model.localizedContent!.zh!, fields: { email: { displayName: "错误" } } } }
    })).toThrow("TRANSLATION_STRUCTURE_MISMATCH");
  });

  it("does not infer references from legacy narrative strings and extracts v2 input deterministically", () => {
    const legacy = physicalModel({ schemaVersion: undefined, entityDefinitions: undefined, dataRelations: undefined, relationships: ["Order references Account"] });
    expect(extractAssetGraph("dataModel", legacy).relationships.filter((item) => item.code === "REFERENCES")).toHaveLength(0);

    const model = physicalModel();
    const reversed = { ...model, entityDefinitions: [...model.entityDefinitions!].reverse(), fields: [...model.fields].reverse(), dataRelations: [...model.dataRelations!].reverse() };
    expect(extractAssetGraph("dataModel", reversed)).toEqual(extractAssetGraph("dataModel", model));
  });
});
