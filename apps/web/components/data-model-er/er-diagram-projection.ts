import type { DataModelGraphEdge, DataModelGraphNode, DataModelGraphResponse } from "@specforge/core";
import type { ErGraphSnapshot } from "./er-graph-store";

export type ErProjectionInput = DataModelGraphResponse | ErGraphSnapshot;

export interface ErFieldRow {
  id: string;
  entityId: string;
  rootModelId: string;
  logicalId: string;
  fieldName: string;
  displayName: string;
  dataType: string;
  ordinal: number;
  primaryKey: boolean;
  foreignKey: boolean;
  unique: boolean;
  nullable: boolean;
  generated: boolean;
  classification?: string;
  sensitiveLevel?: string;
  example?: string;
  owner?: string;
  node: DataModelGraphNode;
}

export interface ErEntityCard {
  id: string;
  rootModelId: string;
  logicalId: string;
  displayName: string;
  physicalName?: string;
  ordinal: number;
  external: boolean;
  fields: ErFieldRow[];
  node: DataModelGraphNode;
}

export interface ErModelGroup {
  id: string;
  displayName: string;
  entities: ErEntityCard[];
  node?: DataModelGraphNode;
}

export interface ErFieldMapping {
  id: string;
  sourceFieldId: string;
  targetFieldId: string;
  sourceEdgeId: string;
  mappingIndex?: number;
  metadata: Record<string, unknown>;
}

export interface ErRelationGroup {
  id: string;
  relationId?: string;
  sourceEntityId: string;
  targetEntityId: string;
  mappingConfigured: boolean;
  mappings: ErFieldMapping[];
  entityEdgeId?: string;
  edgeIds: string[];
  metadata: Record<string, unknown>;
}

export type ErQualityIssueCode = "ENDPOINT_NOT_FOUND" | "FIELD_OWNER_NOT_FOUND" | "FIELD_OWNERSHIP_AMBIGUOUS" | "UNSUPPORTED_REFERENCE_ENDPOINT";

export interface ErQualityIssue {
  code: ErQualityIssueCode;
  relationId?: string;
  edgeId: string;
  modelId?: string;
  fieldId?: string;
  sourceId?: string;
  targetId?: string;
  message: string;
}

export interface ErDiagramIdentity {
  applicationServiceId: string;
  scopePath: string;
  mode: ErProjectionInput["mode"];
  rootModelId?: string;
  catalogDigest: string;
  relationshipDigest: string;
  topologyDigest: string;
}

export interface ErDiagramProjection {
  identity: ErDiagramIdentity;
  models: ErModelGroup[];
  entities: ErEntityCard[];
  relations: ErRelationGroup[];
  qualityIssues: ErQualityIssue[];
}

interface ReferenceGroup {
  key: string;
  relationId?: string;
  edges: DataModelGraphEdge[];
}

export function projectErDiagram(input: ErProjectionInput): ErDiagramProjection {
  const nodes = [...input.nodes].sort((left, right) => compareStable(left.id, right.id));
  const edges = [...input.edges].sort(compareEdges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const entityNodes = nodes.filter((node) => node.nodeType === "dataEntity").sort(compareEntityNodes);
  const entityBySemanticId = new Map(entityNodes.map((node) => [entitySemanticId(node), node]));
  const fieldOwnerById = findFieldOwners(edges, nodeById, entityBySemanticId);
  const foreignKeyIds = new Set<string>();
  const qualityIssues: ErQualityIssue[] = [];
  const relationGroups = buildRelationGroups(edges);
  const relations: ErRelationGroup[] = [];

  for (const group of relationGroups) {
    const relation = buildRelationGroup(group, nodeById, fieldOwnerById, foreignKeyIds, qualityIssues);
    if (relation) relations.push(relation);
  }

  const entities = entityNodes.map((node) => buildEntityCard(node, nodes, fieldOwnerById, foreignKeyIds));
  const models = buildModelGroups(nodes, entities);
  for (const node of nodes) {
    if (node.nodeType !== "dataField" || fieldOwnerById.has(node.id)) continue;
    const modelEntityCount = entityNodes.filter((entity) => entity.rootModelId === node.rootModelId).length;
    if (modelEntityCount > 1) qualityIssues.push({ code: "FIELD_OWNERSHIP_AMBIGUOUS", edgeId: `field:${node.id}`, modelId: node.rootModelId, fieldId: node.id, sourceId: node.id, message: `Field ownership is ambiguous for ${node.id}.` });
  }
  return {
    identity: buildIdentity(input, nodes, edges),
    models,
    entities,
    relations: relations.sort((left, right) => compareStable(left.id, right.id)),
    qualityIssues: qualityIssues.sort(compareQualityIssues)
  };
}

function buildEntityCard(entity: DataModelGraphNode, nodes: DataModelGraphNode[], fieldOwnerById: ReadonlyMap<string, string>, foreignKeyIds: ReadonlySet<string>): ErEntityCard {
  const fields = nodes
    .filter((node) => node.nodeType === "dataField" && fieldOwnerById.get(node.id) === entity.id)
    .sort(compareFieldNodes)
    .map((node) => buildFieldRow(node, entity.id, foreignKeyIds.has(node.id)));
  const physicalName = readString(entity.metadata.physicalName);
  return {
    id: entity.id,
    rootModelId: entity.rootModelId,
    logicalId: entity.logicalId,
    displayName: entity.displayName,
    ...(physicalName ? { physicalName } : {}),
    ordinal: readOrdinal(entity.metadata.ordinal),
    external: Boolean(entity.external),
    fields,
    node: entity
  };
}

function buildFieldRow(node: DataModelGraphNode, entityId: string, foreignKey: boolean): ErFieldRow {
  const metadata = node.metadata;
  return {
    id: node.id,
    entityId,
    rootModelId: node.rootModelId,
    logicalId: node.logicalId,
    fieldName: readString(metadata.fieldName) ?? node.displayName,
    displayName: readString(metadata.displayName) ?? node.displayName,
    dataType: readString(metadata.dataType) ?? "unknown",
    ordinal: readOrdinal(metadata.ordinal),
    primaryKey: readBoolean(metadata.primaryKey),
    foreignKey,
    unique: readBoolean(metadata.unique),
    nullable: readBoolean(metadata.nullable),
    generated: readBoolean(metadata.generated),
    ...(readString(metadata.classification) ? { classification: readString(metadata.classification) } : {}),
    ...(readString(metadata.sensitiveLevel) ? { sensitiveLevel: readString(metadata.sensitiveLevel) } : {}),
    ...(readString(metadata.example) ? { example: readString(metadata.example) } : {}),
    ...(readString(metadata.owner) ? { owner: readString(metadata.owner) } : {}),
    node
  };
}

function findFieldOwners(edges: DataModelGraphEdge[], nodes: ReadonlyMap<string, DataModelGraphNode>, entityBySemanticId: ReadonlyMap<string, DataModelGraphNode>): Map<string, string> {
  const owners = new Map<string, string>();
  for (const edge of edges) {
    if (edge.relationshipCode !== "CONTAINS") continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source?.nodeType === "dataEntity" && target?.nodeType === "dataField") owners.set(target.id, source.id);
  }
  for (const node of nodes.values()) {
    if (node.nodeType !== "dataField" || owners.has(node.id)) continue;
    const entityId = readString(node.metadata.entityId);
    if (!entityId) continue;
    const owner = entityBySemanticId.get(`${node.rootModelId}:${entityId}`);
    if (owner) owners.set(node.id, owner.id);
  }
  return owners;
}

function buildRelationGroups(edges: DataModelGraphEdge[]): ReferenceGroup[] {
  const groups = new Map<string, ReferenceGroup>();
  for (const edge of edges) {
    if (edge.relationshipCode !== "REFERENCES") continue;
    const relationId = readString(edge.metadata.relationId);
    const key = relationId ? `relation:${relationId}` : `edge:${edge.id}`;
    const existing = groups.get(key);
    if (existing) existing.edges.push(edge);
    else groups.set(key, { key, relationId, edges: [edge] });
  }
  return [...groups.values()].sort((left, right) => compareStable(left.key, right.key));
}

function buildRelationGroup(group: ReferenceGroup, nodes: ReadonlyMap<string, DataModelGraphNode>, fieldOwnerById: ReadonlyMap<string, string>, foreignKeyIds: Set<string>, qualityIssues: ErQualityIssue[]): ErRelationGroup | undefined {
  const sortedEdges = [...group.edges].sort(compareEdges);
  const entityEdges = sortedEdges.filter((edge) => nodes.get(edge.source)?.nodeType === "dataEntity" && nodes.get(edge.target)?.nodeType === "dataEntity");
  const fieldEdges = sortedEdges.filter((edge) => nodes.get(edge.source)?.nodeType === "dataField" && nodes.get(edge.target)?.nodeType === "dataField");
  const invalidEdges = sortedEdges.filter((edge) => !entityEdges.includes(edge) && !fieldEdges.includes(edge));
  const missingEndpoint = sortedEdges.find((edge) => !nodes.has(edge.source) || !nodes.has(edge.target));
  if (missingEndpoint) {
    qualityIssues.push({ code: "ENDPOINT_NOT_FOUND", relationId: group.relationId, edgeId: missingEndpoint.id, sourceId: missingEndpoint.source, targetId: missingEndpoint.target, message: `Relationship endpoint not found for ${missingEndpoint.id}.` });
    return undefined;
  }
  if (invalidEdges.length) {
    const edge = invalidEdges[0]!;
    qualityIssues.push({ code: "UNSUPPORTED_REFERENCE_ENDPOINT", relationId: group.relationId, edgeId: edge.id, sourceId: edge.source, targetId: edge.target, message: `Unsupported REFERENCES endpoint for ${edge.id}.` });
    return undefined;
  }
  const entityEdge = entityEdges[0];
  const entitySourceId = entityEdge?.source;
  const entityTargetId = entityEdge?.target;
  const sourceEntityId = entitySourceId ?? fieldOwnerById.get(fieldEdges[0]?.source ?? "");
  const targetEntityId = entityTargetId ?? fieldOwnerById.get(fieldEdges[0]?.target ?? "");
  if (!sourceEntityId || !targetEntityId) {
    const edge = fieldEdges[0] ?? entityEdge ?? sortedEdges[0]!;
    qualityIssues.push({ code: "FIELD_OWNER_NOT_FOUND", relationId: group.relationId, edgeId: edge.id, sourceId: edge.source, targetId: edge.target, message: `Field ownership not found for ${edge.id}.` });
    return undefined;
  }

  const mappings = fieldEdges.map((edge) => {
    foreignKeyIds.add(edge.source);
    return {
      id: `${group.key}:${edge.id}`,
      sourceFieldId: edge.source,
      targetFieldId: edge.target,
      sourceEdgeId: edge.id,
      ...(readNumber(edge.metadata.mappingIndex) !== undefined ? { mappingIndex: readNumber(edge.metadata.mappingIndex) } : {}),
      metadata: { ...edge.metadata }
    };
  }).sort(compareMappings);
  const metadata = { ...(entityEdge?.metadata ?? sortedEdges[0]?.metadata ?? {}) };
  return {
    id: group.key,
    ...(group.relationId ? { relationId: group.relationId } : {}),
    sourceEntityId,
    targetEntityId,
    mappingConfigured: mappings.length > 0,
    mappings,
    ...(entityEdge ? { entityEdgeId: entityEdge.id } : {}),
    edgeIds: sortedEdges.map((edge) => edge.id),
    metadata
  };
}

function buildModelGroups(nodes: DataModelGraphNode[], entities: ErEntityCard[]): ErModelGroup[] {
  const modelNodes = new Map(nodes.filter((node) => node.nodeType === "dataModel").map((node) => [node.rootModelId, node]));
  const modelIds = new Set(entities.map((entity) => entity.rootModelId));
  return [...modelIds].sort(compareStable).map((rootModelId) => {
    const node = modelNodes.get(rootModelId);
    return {
      id: rootModelId,
      displayName: node?.displayName ?? rootModelId,
      entities: entities.filter((entity) => entity.rootModelId === rootModelId),
      ...(node ? { node } : {})
    };
  });
}

function buildIdentity(input: ErProjectionInput, nodes: DataModelGraphNode[], edges: DataModelGraphEdge[]): ErDiagramIdentity {
  const architectureScope = "architectureScope" in input ? input.architectureScope : nodes[0]?.scope;
  if (!architectureScope) throw new Error("ER_SCOPE_REQUIRED");
  const rootModelId = "rootModelId" in input ? input.rootModelId : uniqueRootModelId(nodes);
  const topology = JSON.stringify({
    scope: architectureScope,
    mode: input.mode,
    rootModelId,
    waterlines: input.waterlines,
    nodes: nodes.map((node) => `${node.nodeType}:${node.id}`).sort(compareStable),
    edges: edges.map((edge) => `${edge.relationshipCode}:${edge.source}:${edge.target}:${edge.id}`).sort(compareStable)
  });
  return {
    ...architectureScope,
    mode: input.mode,
    ...(rootModelId ? { rootModelId } : {}),
    catalogDigest: input.waterlines.catalogDigest,
    relationshipDigest: input.waterlines.relationshipDigest,
    topologyDigest: `er-${stableHash(topology)}`
  };
}

function uniqueRootModelId(nodes: DataModelGraphNode[]): string | undefined {
  const rootModelIds = [...new Set(nodes.map((node) => node.rootModelId))];
  return rootModelIds.length === 1 ? rootModelIds[0] : undefined;
}

function entitySemanticId(node: DataModelGraphNode): string {
  const marker = ".entity.";
  const index = node.logicalId.indexOf(marker);
  return `${node.rootModelId}:${index >= 0 ? node.logicalId.slice(index + marker.length) : node.logicalId}`;
}

function compareEntityNodes(left: DataModelGraphNode, right: DataModelGraphNode): number {
  return readOrdinal(left.metadata.ordinal) - readOrdinal(right.metadata.ordinal) || compareStable(left.id, right.id);
}

function compareFieldNodes(left: DataModelGraphNode, right: DataModelGraphNode): number {
  return readOrdinal(left.metadata.ordinal) - readOrdinal(right.metadata.ordinal) || compareStable(left.id, right.id);
}

function compareEdges(left: DataModelGraphEdge, right: DataModelGraphEdge): number {
  return compareStable(left.relationshipCode, right.relationshipCode) || compareStable(left.source, right.source) || compareStable(left.target, right.target) || compareStable(left.id, right.id);
}

function compareMappings(left: ErFieldMapping, right: ErFieldMapping): number {
  return (left.mappingIndex ?? Number.MAX_SAFE_INTEGER) - (right.mappingIndex ?? Number.MAX_SAFE_INTEGER) || compareStable(left.sourceFieldId, right.sourceFieldId) || compareStable(left.targetFieldId, right.targetFieldId);
}

function compareQualityIssues(left: ErQualityIssue, right: ErQualityIssue): number {
  return compareStable(left.code, right.code) || compareStable(left.edgeId, right.edgeId);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function readNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function readOrdinal(value: unknown): number { return readNumber(value) ?? Number.MAX_SAFE_INTEGER; }
function readBoolean(value: unknown): boolean { return value === true; }

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
