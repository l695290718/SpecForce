import type { DataField, DataModel } from "./types";

export interface DataEntityDefinition {
  id: string;
  name: string;
  physicalName?: string;
  description?: string;
  ordinal: number;
}

export interface DataFieldDefinition extends DataField {
  id: string;
  entityId: string;
  ordinal: number;
}

export interface DataRelationCardinality {
  min: 0 | 1;
  max: 1 | "many";
}

export interface DataFieldMapping {
  sourceFieldId: string;
  targetFieldId: string;
}

export type DataRelationKind = "REFERENCE" | "ASSOCIATION" | "INHERITANCE";
export type ReferentialAction = "NO_ACTION" | "RESTRICT" | "CASCADE" | "SET_NULL" | "SET_DEFAULT";

export interface DataRelation {
  id: string;
  kind: DataRelationKind;
  sourceEntityId: string;
  targetModelId: string;
  targetEntityId: string;
  sourceCardinality: DataRelationCardinality;
  targetCardinality: DataRelationCardinality;
  fieldMappings: DataFieldMapping[];
  identifying?: boolean;
  constraintName?: string;
  onUpdate?: ReferentialAction;
  onDelete?: ReferentialAction;
  description?: string;
  evidenceRefs: string[];
}

export interface DataModelV2 {
  schemaVersion: 2;
  entityDefinitions: DataEntityDefinition[];
  fields: DataFieldDefinition[];
  dataRelations: DataRelation[];
}

export type DataModelV2ValidationCode =
  | "DATA_MODEL_SCHEMA_VERSION_REQUIRED"
  | "DATA_MODEL_ENTITY_REQUIRED"
  | "DATA_ENTITY_ID_REQUIRED"
  | "DATA_ENTITY_ID_DUPLICATE"
  | "DATA_ENTITY_ORDINAL_DUPLICATE"
  | "DATA_ENTITY_NAME_DUPLICATE"
  | "DATA_FIELD_ID_REQUIRED"
  | "DATA_FIELD_ID_DUPLICATE"
  | "DATA_FIELD_ENTITY_NOT_FOUND"
  | "FIELD_OWNERSHIP_AMBIGUOUS"
  | "DATA_FIELD_ORDINAL_INVALID"
  | "DATA_FIELD_ORDINAL_DUPLICATE"
  | "DATA_RELATION_ID_REQUIRED"
  | "DATA_RELATION_ID_DUPLICATE"
  | "DATA_RELATION_SOURCE_ENTITY_NOT_FOUND"
  | "DATA_RELATION_TARGET_ENTITY_NOT_FOUND"
  | "DATA_RELATION_CARDINALITY_INVALID"
  | "DATA_RELATION_MAPPING_NOT_ALLOWED"
  | "DATA_RELATION_MAPPING_REQUIRED"
  | "DATA_RELATION_MAPPING_DUPLICATE"
  | "DATA_RELATION_SOURCE_FIELD_NOT_FOUND"
  | "DATA_RELATION_TARGET_FIELD_NOT_FOUND"
  | "DATA_RELATION_FIELD_TYPE_INCOMPATIBLE"
  | "DATA_RELATION_TARGET_NOT_UNIQUE"
  | "DATA_RELATION_PHYSICAL_CONTROL_NOT_ALLOWED"
  | "DATA_RELATION_SET_NULL_REQUIRES_NULLABLE"
  | "DATA_RELATION_SET_DEFAULT_REQUIRES_DEFAULT"
  | "DATA_RELATION_EVIDENCE_REQUIRED";

export class DataModelV2ValidationError extends Error {
  readonly code: DataModelV2ValidationCode;
  readonly path: string;

  constructor(code: DataModelV2ValidationCode, path: string) {
    super(`${code}: ${path}`);
    this.name = "DataModelV2ValidationError";
    this.code = code;
    this.path = path;
  }
}

export function isStructuredDataModel(asset: DataModel): boolean {
  return asset.schemaVersion === 2;
}

export function validateDataModelV2(asset: DataModel): asserts asset is DataModel & DataModelV2 {
  if (asset.schemaVersion !== 2) {
    throw new DataModelV2ValidationError("DATA_MODEL_SCHEMA_VERSION_REQUIRED", "schemaVersion");
  }

  const entities = asset.entityDefinitions;
  const fields = asset.fields as DataFieldDefinition[];
  const relations = asset.dataRelations;
  if (!entities || entities.length === 0) {
    throw new DataModelV2ValidationError("DATA_MODEL_ENTITY_REQUIRED", "entityDefinitions");
  }
  if (!relations) {
    throw new DataModelV2ValidationError("DATA_RELATION_EVIDENCE_REQUIRED", "dataRelations");
  }

  const entityById = new Map<string, DataEntityDefinition>();
  const entityByName = new Map<string, DataEntityDefinition>();
  const entityOrdinals = new Set<number>();
  for (const [index, entity] of entities.entries()) {
    requireIdentifier(entity.id, "DATA_ENTITY_ID_REQUIRED", `entityDefinitions.${index}.id`);
    if (entityById.has(entity.id)) throw new DataModelV2ValidationError("DATA_ENTITY_ID_DUPLICATE", `entityDefinitions.${index}.id`);
    if (entityByName.has(entity.name)) throw new DataModelV2ValidationError("DATA_ENTITY_NAME_DUPLICATE", `entityDefinitions.${index}.name`);
    if (!Number.isInteger(entity.ordinal) || entity.ordinal < 0) throw new DataModelV2ValidationError("DATA_ENTITY_ORDINAL_DUPLICATE", `entityDefinitions.${index}.ordinal`);
    if (entityOrdinals.has(entity.ordinal)) throw new DataModelV2ValidationError("DATA_ENTITY_ORDINAL_DUPLICATE", `entityDefinitions.${index}.ordinal`);
    entityById.set(entity.id, entity);
    entityByName.set(entity.name, entity);
    entityOrdinals.add(entity.ordinal);
  }

  const fieldById = new Map<string, DataFieldDefinition>();
  const fieldOrdinalsByEntity = new Map<string, Set<number>>();
  for (const [index, field] of fields.entries()) {
    requireIdentifier(field.id, "DATA_FIELD_ID_REQUIRED", `fields.${index}.id`);
    if (fieldById.has(field.id)) throw new DataModelV2ValidationError("DATA_FIELD_ID_DUPLICATE", `fields.${index}.id`);
    if (!entityById.has(field.entityId)) throw new DataModelV2ValidationError("DATA_FIELD_ENTITY_NOT_FOUND", `fields.${index}.entityId`);
    if (!Number.isInteger(field.ordinal) || field.ordinal < 0) throw new DataModelV2ValidationError("DATA_FIELD_ORDINAL_INVALID", `fields.${index}.ordinal`);
    const ordinals = fieldOrdinalsByEntity.get(field.entityId) ?? new Set<number>();
    if (ordinals.has(field.ordinal)) throw new DataModelV2ValidationError("DATA_FIELD_ORDINAL_DUPLICATE", `fields.${index}.ordinal`);
    ordinals.add(field.ordinal);
    fieldOrdinalsByEntity.set(field.entityId, ordinals);
    fieldById.set(field.id, field);
  }

  const relationIds = new Set<string>();
  for (const [index, relation] of relations.entries()) {
    requireIdentifier(relation.id, "DATA_RELATION_ID_REQUIRED", `dataRelations.${index}.id`);
    if (relationIds.has(relation.id)) throw new DataModelV2ValidationError("DATA_RELATION_ID_DUPLICATE", `dataRelations.${index}.id`);
    relationIds.add(relation.id);
    if (!entityById.has(relation.sourceEntityId)) throw new DataModelV2ValidationError("DATA_RELATION_SOURCE_ENTITY_NOT_FOUND", `dataRelations.${index}.sourceEntityId`);
    if (!isValidCardinality(relation.sourceCardinality) || !isValidCardinality(relation.targetCardinality)) {
      throw new DataModelV2ValidationError("DATA_RELATION_CARDINALITY_INVALID", `dataRelations.${index}.cardinality`);
    }

    const isLocalTarget = relation.targetModelId === asset.id;
    if (isLocalTarget && !entityById.has(relation.targetEntityId)) {
      throw new DataModelV2ValidationError("DATA_RELATION_TARGET_ENTITY_NOT_FOUND", `dataRelations.${index}.targetEntityId`);
    }
    if (asset.modelType === "conceptual" && relation.fieldMappings.length > 0) {
      throw new DataModelV2ValidationError("DATA_RELATION_MAPPING_NOT_ALLOWED", `dataRelations.${index}.fieldMappings`);
    }
    if (asset.modelType === "physical" && relation.fieldMappings.length === 0) {
      throw new DataModelV2ValidationError("DATA_RELATION_MAPPING_REQUIRED", `dataRelations.${index}.fieldMappings`);
    }
    if (asset.modelType !== "physical" && (relation.constraintName || relation.onUpdate || relation.onDelete)) {
      throw new DataModelV2ValidationError("DATA_RELATION_PHYSICAL_CONTROL_NOT_ALLOWED", `dataRelations.${index}`);
    }
    if (relation.evidenceRefs.some((reference) => !isNonEmptyString(reference))) {
      throw new DataModelV2ValidationError("DATA_RELATION_EVIDENCE_REQUIRED", `dataRelations.${index}.evidenceRefs`);
    }

    const mappingSources = new Set<string>();
    const mappingTargets = new Set<string>();
    for (const [mappingIndex, mapping] of sortMappings(relation, fieldById).entries()) {
      if (mappingSources.has(mapping.sourceFieldId) || mappingTargets.has(mapping.targetFieldId)) {
        throw new DataModelV2ValidationError("DATA_RELATION_MAPPING_DUPLICATE", `dataRelations.${index}.fieldMappings.${mappingIndex}`);
      }
      mappingSources.add(mapping.sourceFieldId);
      mappingTargets.add(mapping.targetFieldId);
      const sourceField = fieldById.get(mapping.sourceFieldId);
      if (!sourceField || sourceField.entityId !== relation.sourceEntityId) {
        throw new DataModelV2ValidationError("DATA_RELATION_SOURCE_FIELD_NOT_FOUND", `dataRelations.${index}.fieldMappings.${mappingIndex}.sourceFieldId`);
      }
      const targetField = isLocalTarget ? fieldById.get(mapping.targetFieldId) : undefined;
      if (isLocalTarget && (!targetField || targetField.entityId !== relation.targetEntityId)) {
        throw new DataModelV2ValidationError("DATA_RELATION_TARGET_FIELD_NOT_FOUND", `dataRelations.${index}.fieldMappings.${mappingIndex}.targetFieldId`);
      }
      if (targetField && !compatibleFieldTypes(sourceField.dataType, targetField.dataType)) {
        throw new DataModelV2ValidationError("DATA_RELATION_FIELD_TYPE_INCOMPATIBLE", `dataRelations.${index}.fieldMappings.${mappingIndex}`);
      }
      if (targetField && asset.modelType === "physical" && !(targetField.primaryKey || targetField.unique)) {
        throw new DataModelV2ValidationError("DATA_RELATION_TARGET_NOT_UNIQUE", `dataRelations.${index}.fieldMappings.${mappingIndex}.targetFieldId`);
      }
      if (relation.onDelete === "SET_NULL" && !sourceField.nullable) {
        throw new DataModelV2ValidationError("DATA_RELATION_SET_NULL_REQUIRES_NULLABLE", `dataRelations.${index}.onDelete`);
      }
      if (relation.onUpdate === "SET_NULL" && !sourceField.nullable) {
        throw new DataModelV2ValidationError("DATA_RELATION_SET_NULL_REQUIRES_NULLABLE", `dataRelations.${index}.onUpdate`);
      }
      if ((relation.onDelete === "SET_DEFAULT" || relation.onUpdate === "SET_DEFAULT") && sourceField.defaultValue === undefined) {
        throw new DataModelV2ValidationError("DATA_RELATION_SET_DEFAULT_REQUIRES_DEFAULT", `dataRelations.${index}`);
      }
    }
  }
}

export function upgradeLegacyDataModel(asset: DataModel): DataModel {
  if (isStructuredDataModel(asset)) return structuredClone(asset);

  const entityNames = asset.entities.length > 0 ? asset.entities : ["legacy-unassigned"];
  const entityDefinitions = entityNames.map((name, ordinal) => ({
    id: `entity:${asset.id}:${name}`,
    name,
    ordinal
  }));
  const entityIds = new Set(entityDefinitions.map((entity) => entity.id));
  if (entityDefinitions.length > 1 && asset.fields.some((field) => !field.entityId || !entityIds.has(field.entityId))) {
    throw new DataModelV2ValidationError("FIELD_OWNERSHIP_AMBIGUOUS", "fields");
  }

  const defaultEntityId = entityDefinitions[0]!.id;
  const fields = asset.fields.map((field, ordinal) => ({
    ...field,
    id: field.id ?? `field:${asset.id}:${entityDefinitions.find((entity) => entity.id === field.entityId)?.name ?? entityDefinitions[0]!.name}:${field.fieldName}`,
    entityId: field.entityId ?? defaultEntityId,
    ordinal: field.ordinal ?? ordinal
  }));
  const localizedContent = asset.localizedContent ? upgradeLegacyLocalization(asset, entityDefinitions, fields) : asset.localizedContent;
  return {
    ...structuredClone(asset),
    schemaVersion: 2,
    entityDefinitions,
    fields,
    dataRelations: [],
    localizedContent
  };
}

function upgradeLegacyLocalization(
  asset: DataModel,
  entities: DataEntityDefinition[],
  fields: DataFieldDefinition[]
): DataModel["localizedContent"] {
  const localized = structuredClone(asset.localizedContent);
  for (const locale of ["zh", "en"] as const) {
    const overlay = localized?.[locale];
    if (!overlay) continue;
    const legacyFields = overlay.fields;
    const fieldsByName = new Map(asset.fields.map((field, index) => [field.fieldName, fields[index]!]));
    overlay.fields = Object.fromEntries(Object.entries(legacyFields ?? {}).map(([key, value]) => [fieldsByName.get(key)?.id ?? key, value]));
    overlay.entities ??= Object.fromEntries(entities.map((entity) => [entity.id, { displayName: entity.name }]));
  }
  return localized;
}

function sortMappings(relation: DataRelation, fields: ReadonlyMap<string, DataFieldDefinition>): DataFieldMapping[] {
  return [...relation.fieldMappings].sort((left, right) => {
    const sourceOrder = (fields.get(left.sourceFieldId)?.ordinal ?? Number.MAX_SAFE_INTEGER) - (fields.get(right.sourceFieldId)?.ordinal ?? Number.MAX_SAFE_INTEGER);
    if (sourceOrder !== 0) return sourceOrder;
    return compareStable(left.sourceFieldId, right.sourceFieldId) || compareStable(left.targetFieldId, right.targetFieldId);
  });
}

function requireIdentifier(value: unknown, code: DataModelV2ValidationCode, path: string): asserts value is string {
  if (!isNonEmptyString(value)) throw new DataModelV2ValidationError(code, path);
}

function isValidCardinality(value: DataRelationCardinality): boolean {
  return (value.min === 0 || value.min === 1) && (value.max === 1 || value.max === "many") && (value.max === "many" || value.min <= value.max);
}

function compatibleFieldTypes(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const type = value.toLowerCase().replace(/\s+/gu, "");
    if (["varchar", "char", "text", "string", "uuid"].some((item) => type.startsWith(item))) return "string";
    if (["int", "integer", "bigint", "smallint", "number", "decimal", "numeric"].some((item) => type.startsWith(item))) return "number";
    if (["bool", "boolean"].some((item) => type.startsWith(item))) return "boolean";
    if (["date", "datetime", "timestamp"].some((item) => type.startsWith(item))) return "temporal";
    return type;
  };
  return normalize(left) === normalize(right);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
