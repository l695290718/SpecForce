import type { ApiContract, Asset, AssetType, AssetTypeMap, DataModel } from "../types";
import { validateRelationshipEndpoints } from "./ontology";
import type { AssetNodeIdentity } from "./types";

export interface ExtractedAssetGraph {
  nodes: AssetNodeIdentity[];
  relationships: ExtractedAssetRelationship[];
}

export interface ExtractedAssetRelationship {
  id: string;
  code: "CONTAINS";
  source: "asset-parser";
  sourceReference: string;
  sourceLogicalId: string;
  targetLogicalId: string;
  sourceNode: AssetNodeIdentity;
  targetNode: AssetNodeIdentity;
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
  const sourceReference = `dataModel:${asset.id}:${asset.updatedAt}`;
  const fieldNames = uniqueSorted(asset.fields.map((field) => field.fieldName));

  for (const entityName of uniqueSorted(asset.entities)) {
    const entity: AssetNodeIdentity = {
      ...root,
      nodeType: "dataEntity",
      logicalId: `${root.logicalId}.${entityName}`,
      parentLogicalId: root.logicalId
    };
    nodes.push(entity);
    relationships.push(createContainsRelationship(root, entity, sourceReference));

    for (const fieldName of fieldNames) {
      const field: AssetNodeIdentity = {
        ...root,
        nodeType: "dataField",
        logicalId: `${entity.logicalId}.${fieldName}`,
        parentLogicalId: entity.logicalId
      };
      nodes.push(field);
      relationships.push(createContainsRelationship(entity, field, sourceReference));
    }
  }
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
