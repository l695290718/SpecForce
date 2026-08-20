import {
  isStructuredDataModel,
  validateDataModelV2,
  type DataFieldDefinition,
  type DataModelV2,
  type DataRelation
} from "../data-model-v2";
import type { ApiContract, Asset, AssetType, AssetTypeMap, DataModel } from "../types";
import { validateRelationshipEndpoints } from "./ontology";
import type { AssetNodeIdentity, ExtractedRelationshipMetadata } from "./types";

export interface ExtractedAssetGraph {
  nodes: AssetNodeIdentity[];
  relationships: ExtractedAssetRelationship[];
}

export interface ExtractedAssetRelationship {
  id: string;
  code: "CONTAINS" | "REFERENCES";
  source: "asset-parser";
  sourceReference: string;
  sourceLogicalId: string;
  targetLogicalId: string;
  sourceNode: AssetNodeIdentity;
  targetNode: AssetNodeIdentity;
  relationId?: string;
  mappingIndex?: number;
  mappingCount?: number;
  metadata?: ExtractedRelationshipMetadata;
}

export function extractAssetGraph<TAssetType extends AssetType>(
  assetType: TAssetType,
  asset: AssetTypeMap[TAssetType]
): ExtractedAssetGraph;
export function extractAssetGraph(assetType: AssetType, asset: Asset): ExtractedAssetGraph {
  const root = createRootNode(assetType, asset);
  const nodes = [root];
  const relationships: ExtractedAssetRelationship[] = [];

  if (assetType === "dataModel") {
    extractDataModelNodes(asset as DataModel, root, nodes, relationships);
  }

  if (assetType === "api") {
    const api = asset as ApiContract;
    nodes.push({
      ...root,
      nodeType: "apiOperation",
      logicalId: `${root.logicalId}.${api.method}.${api.path}`,
      parentLogicalId: root.logicalId
    });
  }

  return { nodes, relationships };
}

function createRootNode(assetType: AssetType, asset: Asset): AssetNodeIdentity {
  if (!asset.architectureScope) {
    throw new Error("ASSET_SCOPE_REQUIRED");
  }

  return {
    applicationServiceId: asset.architectureScope.applicationServiceId,
    scopePath: asset.architectureScope.scopePath,
    nodeType: assetType,
    logicalId: asset.id,
    rootAssetType: assetType,
    rootAssetId: asset.id
  };
}

function extractDataModelNodes(
  asset: DataModel,
  root: AssetNodeIdentity,
  nodes: AssetNodeIdentity[],
  relationships: ExtractedAssetRelationship[]
): void {
  if (isStructuredDataModel(asset)) {
    validateDataModelV2(asset);
    extractStructuredDataModelNodes(asset, root, nodes, relationships);
    return;
  }

  extractLegacyDataModelNodes(asset, root, nodes, relationships);
}

function extractStructuredDataModelNodes(
  asset: DataModel & DataModelV2,
  root: AssetNodeIdentity,
  nodes: AssetNodeIdentity[],
  relationships: ExtractedAssetRelationship[]
): void {
  const sourceReference = `dataModel:${asset.id}:${asset.updatedAt}`;
  const entities = [...asset.entityDefinitions].sort(compareEntities);
  const entityNodes = new Map<string, AssetNodeIdentity>();
  const fieldNodes = new Map<string, AssetNodeIdentity>();
  const structuredFields = asset.fields as DataFieldDefinition[];
  const fieldsById = new Map(structuredFields.map((field) => [field.id, field]));

  for (const entity of entities) {
    const entityNode = createEntityNode(root, entity.id);
    entityNodes.set(entity.id, entityNode);
    nodes.push(entityNode);
    relationships.push(createContainsRelationship(root, entityNode, sourceReference));
  }

  const fields = [...structuredFields].sort((left, right) => {
    const entityOrder = compareStable(left.entityId, right.entityId);
    if (entityOrder !== 0) return entityOrder;
    return left.ordinal - right.ordinal || compareStable(left.id, right.id);
  });
  for (const field of fields) {
    const parent = entityNodes.get(field.entityId)!;
    const fieldNode = createFieldNode(root, field.entityId, field.id);
    fieldNodes.set(field.id, fieldNode);
    nodes.push(fieldNode);
    relationships.push(createContainsRelationship(parent, fieldNode, sourceReference));
  }

  for (const relation of [...asset.dataRelations].sort((left, right) => compareStable(left.id, right.id))) {
    const sourceEntity = entityNodes.get(relation.sourceEntityId)!;
    const targetEntity = endpointNode(root, relation.targetModelId, relation.targetEntityId, "dataEntity", relation.targetModelId !== asset.id);
    const mappings = sortMappings(relation, fieldsById);
    relationships.push(createReferenceRelationship(sourceEntity, targetEntity, sourceReference, relation, undefined, mappings.length));

    for (const [mappingIndex, mapping] of mappings.entries()) {
      const sourceField = fieldNodes.get(mapping.sourceFieldId)!;
      const targetField = fieldNodes.get(mapping.targetFieldId) ?? endpointNode(
        root,
        relation.targetModelId,
        relation.targetEntityId,
        "dataField",
        relation.targetModelId !== asset.id,
        mapping.targetFieldId
      );
      relationships.push(createReferenceRelationship(sourceField, targetField, sourceReference, relation, mappingIndex, mappings.length));
    }
  }
}

function extractLegacyDataModelNodes(
  asset: DataModel,
  root: AssetNodeIdentity,
  nodes: AssetNodeIdentity[],
  relationships: ExtractedAssetRelationship[]
): void {
  const sourceReference = `dataModel:${asset.id}:${asset.updatedAt}`;
  const entityNames = uniqueSorted(asset.entities);
  const fieldNames = uniqueSorted(asset.fields.map((field) => field.fieldName));
  const entities = entityNames.map((entityName) => {
    const entity: AssetNodeIdentity = {
      ...root,
      nodeType: "dataEntity",
      logicalId: `${root.logicalId}.${entityName}`,
      parentLogicalId: root.logicalId
    };
    nodes.push(entity);
    relationships.push(createContainsRelationship(root, entity, sourceReference));
    return entity;
  });

  const fieldParent = entities.length === 1 ? entities[0]! : root;

  for (const fieldName of fieldNames) {
    const field: AssetNodeIdentity = {
      ...root,
      nodeType: "dataField",
      logicalId: `${fieldParent.logicalId}.${fieldName}`,
      parentLogicalId: fieldParent.logicalId
    };
    nodes.push(field);
    relationships.push(createContainsRelationship(fieldParent, field, sourceReference));
  }
}

function createEntityNode(root: AssetNodeIdentity, entityId: string): AssetNodeIdentity {
  return {
    ...root,
    nodeType: "dataEntity",
    logicalId: `${root.logicalId}.entity.${entityId}`,
    parentLogicalId: root.logicalId
  };
}

function createFieldNode(root: AssetNodeIdentity, entityId: string, fieldId: string): AssetNodeIdentity {
  return {
    ...root,
    nodeType: "dataField",
    logicalId: `${root.logicalId}.entity.${entityId}.field.${fieldId}`,
    parentLogicalId: `${root.logicalId}.entity.${entityId}`
  };
}

function endpointNode(
  root: AssetNodeIdentity,
  modelId: string,
  entityId: string,
  nodeType: "dataEntity" | "dataField",
  external: boolean,
  fieldId?: string
): AssetNodeIdentity {
  const logicalId = nodeType === "dataEntity"
    ? `${modelId}.entity.${entityId}`
    : `${modelId}.entity.${entityId}.field.${fieldId}`;
  return {
    ...root,
    nodeType,
    logicalId,
    rootAssetId: modelId,
    parentLogicalId: `${modelId}.entity.${entityId}`,
    ...(external ? { external: true } : {})
  };
}

function createContainsRelationship(
  sourceNode: AssetNodeIdentity,
  targetNode: AssetNodeIdentity,
  sourceReference: string
): ExtractedAssetRelationship {
  validateRelationshipEndpoints("CONTAINS", sourceNode.nodeType, targetNode.nodeType);

  return {
    id: `asset-parser:${sourceReference}:CONTAINS:${sourceNode.logicalId}:${targetNode.logicalId}`,
    code: "CONTAINS",
    source: "asset-parser",
    sourceReference,
    sourceLogicalId: sourceNode.logicalId,
    targetLogicalId: targetNode.logicalId,
    sourceNode,
    targetNode
  };
}

function createReferenceRelationship(
  sourceNode: AssetNodeIdentity,
  targetNode: AssetNodeIdentity,
  sourceReference: string,
  relation: DataRelation,
  mappingIndex: number | undefined,
  mappingCount: number
): ExtractedAssetRelationship {
  validateRelationshipEndpoints("REFERENCES", sourceNode.nodeType, targetNode.nodeType);
  const metadata: ExtractedRelationshipMetadata = {
    relationId: relation.id,
    ...(mappingIndex === undefined ? {} : { mappingIndex }),
    mappingCount,
    sourceCardinality: relation.sourceCardinality,
    targetCardinality: relation.targetCardinality,
    ...(relation.identifying === undefined ? {} : { identifying: relation.identifying }),
    ...(relation.constraintName ? { constraintName: relation.constraintName } : {}),
    ...(relation.onUpdate ? { onUpdate: relation.onUpdate } : {}),
    ...(relation.onDelete ? { onDelete: relation.onDelete } : {}),
    evidenceRefs: [...relation.evidenceRefs],
    ...(targetNode.external ? {
      externalTarget: {
        modelId: targetNode.rootAssetId,
        entityId: targetNode.parentLogicalId!.split(".entity.")[1]!.split(".field.")[0]!,
        ...(targetNode.nodeType === "dataField" ? { fieldId: targetNode.logicalId.split(".field.")[1]! } : {})
      }
    } : {})
  };
  const suffix = mappingIndex === undefined ? "entity" : `field:${mappingIndex}`;
  return {
    id: `asset-parser:${sourceReference}:REFERENCES:${relation.id}:${suffix}`,
    code: "REFERENCES",
    source: "asset-parser",
    sourceReference,
    sourceLogicalId: sourceNode.logicalId,
    targetLogicalId: targetNode.logicalId,
    sourceNode,
    targetNode,
    relationId: relation.id,
    ...(mappingIndex === undefined ? {} : { mappingIndex }),
    mappingCount,
    metadata
  };
}

function sortMappings(relation: DataRelation, fields: ReadonlyMap<string, DataFieldDefinition>): DataRelation["fieldMappings"] {
  return [...relation.fieldMappings].sort((left, right) => {
    const sourceOrder = (fields.get(left.sourceFieldId)?.ordinal ?? Number.MAX_SAFE_INTEGER) - (fields.get(right.sourceFieldId)?.ordinal ?? Number.MAX_SAFE_INTEGER);
    if (sourceOrder !== 0) return sourceOrder;
    return compareStable(left.sourceFieldId, right.sourceFieldId) || compareStable(left.targetFieldId, right.targetFieldId);
  });
}

function compareEntities(left: { ordinal: number; id: string }, right: { ordinal: number; id: string }): number {
  return left.ordinal - right.ordinal || compareStable(left.id, right.id);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareStable);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
