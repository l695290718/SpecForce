import type { ErEntityCard, ErFieldRow, ErRelationGroup } from "./er-diagram-projection";
import type { ErGraphEdge, ErGraphNode } from "./er-graph-store";

export interface ErPoint { x: number; y: number; }

export interface ErRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ErFieldRowRect extends ErRect {
  fieldId: string;
  entityId: string;
  center: ErPoint;
}

export interface ErFieldPort {
  fieldId: string;
  entityId: string;
  row: ErFieldRowRect;
  center: ErPoint;
  left: ErPoint;
  right: ErPoint;
  source: ErPoint;
  target: ErPoint;
}

export interface ErHeaderPort {
  entityId: string;
  center: ErPoint;
  left: ErPoint;
  right: ErPoint;
  source: ErPoint;
  target: ErPoint;
}

export interface ErLayoutEntity extends ErRect {
  id: string;
  entity: ErEntityCard;
  fields: ErFieldRowRect[];
}

export interface ErLayoutRoute {
  id: string;
  relationId: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceFieldId?: string;
  targetFieldId?: string;
  mappingConfigured: boolean;
  points: ErPoint[];
  relation: ErRelationGroup;
}

export interface ErLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node: ErGraphNode;
}

export interface ErLayoutEdge {
  id: string;
  source: string;
  target: string;
  points: ErPoint[];
  edge: ErGraphEdge;
}

export interface ErLayoutResult {
  entities: ErLayoutEntity[];
  fieldRows: Record<string, ErFieldRowRect>;
  fieldPorts: Record<string, ErFieldPort>;
  headerPorts: Record<string, ErHeaderPort>;
  routes: ErLayoutRoute[];
  /** Compatibility surface for the pre-projection renderer. */
  nodes: ErLayoutNode[];
  edges: ErLayoutEdge[];
  degraded: boolean;
  error?: string;
}

export interface ErLayoutDimensions {
  width: number;
  height: number;
}

export interface ErLayoutPosition {
  x: number;
  y: number;
}

export interface ErDiagramLayoutRequest {
  entities: ErEntityCard[];
  relations: ErRelationGroup[];
  positions?: Record<string, ErLayoutPosition>;
  dimensions?: Record<string, ErLayoutDimensions>;
  width?: number;
  height?: number;
}

/** Legacy graph input remains accepted until Task 4 switches the workspace to projection input. */
export interface ErLayoutRequest {
  entities?: ErEntityCard[];
  relations?: ErRelationGroup[];
  positions?: Record<string, ErLayoutPosition>;
  dimensions?: Record<string, ErLayoutDimensions>;
  nodes?: ErGraphNode[];
  edges?: ErGraphEdge[];
  width?: number;
  height?: number;
}

export interface ErElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; sources: string[]; targets: string[] }>;
}

const CARD_WIDTH = 280;
const CARD_HEADER_HEIGHT = 48;
const FIELD_ROW_HEIGHT = 28;
const CARD_BOTTOM_PADDING = 12;
const GAP_X = 96;
const GAP_Y = 72;
const ORTHOGONAL_LEAD = 18;

export function erCardSize(entity: ErEntityCard | ErGraphNode): ErLayoutDimensions {
  if ("fields" in entity) {
    return {
      width: CARD_WIDTH,
      height: CARD_HEADER_HEIGHT + Math.max(1, entity.fields.length) * FIELD_ROW_HEIGHT + CARD_BOTTOM_PADDING
    };
  }
  const fieldCount = Number(entity.fieldCount ?? entity.metadata.fieldCount ?? 0);
  return { width: 260, height: 48 + Math.max(1, fieldCount) * FIELD_ROW_HEIGHT + 16 };
}

export function layoutErDiagram(request: ErDiagramLayoutRequest): ErLayoutResult {
  const entities = [...request.entities].sort(compareEntities);
  const positions = buildDeterministicPositions(entities, request);
  const layoutEntities = entities.map((entity) => {
    const size = request.dimensions?.[entity.id] ?? erCardSize(entity);
    const position = positions.get(entity.id)!;
    const fields = buildFieldRows(entity, position, size);
    return { id: entity.id, ...position, ...size, entity, fields };
  });
  return assembleLayout(layoutEntities, request.relations);
}

export function layoutErDiagramWithFallback(request: ErDiagramLayoutRequest): ErLayoutResult {
  try {
    return layoutErDiagram(request);
  } catch (error) {
    const fallback = layoutErDiagram({ entities: request.entities, relations: [], dimensions: request.dimensions, width: request.width, height: request.height });
    return { ...fallback, degraded: true, error: error instanceof Error ? error.message : "LAYOUT_DEGRADED" };
  }
}

/** Compatibility adapter for the old flat graph workspace. */
export function layoutErGraph(request: ErLayoutRequest): ErLayoutResult {
  if (request.entities) return layoutErDiagram({ entities: request.entities, relations: request.relations ?? [], positions: request.positions, dimensions: request.dimensions, width: request.width, height: request.height });
  return layoutLegacyGraph({ nodes: request.nodes ?? [], edges: request.edges ?? [] });
}

export function layoutErGraphWithFallback(request: ErLayoutRequest): ErLayoutResult {
  try {
    return layoutErGraph(request);
  } catch (error) {
    const fallback = request.entities
      ? layoutErDiagramWithFallback({ entities: request.entities, relations: [], dimensions: request.dimensions, width: request.width, height: request.height })
      : layoutLegacyGraph({ nodes: request.nodes ?? [], edges: [] });
    return { ...fallback, degraded: true, error: error instanceof Error ? error.message : "LAYOUT_DEGRADED" };
  }
}

export function toElkGraph(request: ErLayoutRequest): ErElkGraph {
  if (request.entities) {
    const relations = request.relations ?? [];
    return {
      id: "er-root",
      layoutOptions: elkOptions(),
      children: request.entities.slice().sort(compareEntities).map((entity) => ({ id: entity.id, ...(request.dimensions?.[entity.id] ?? erCardSize(entity)) })),
      edges: relations.map((relation) => ({ id: relation.id, sources: [relation.sourceEntityId], targets: [relation.targetEntityId] })).sort(compareElkEdges)
    };
  }
  const nodes = request.nodes ?? [];
  return {
    id: "er-root",
    layoutOptions: elkOptions(),
    children: nodes.slice().sort(compareNodes).map((node) => ({ id: node.id, ...erCardSize(node) })),
    edges: (request.edges ?? []).slice().sort(compareEdges).map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }))
  };
}

export function fromElkGraph(request: ErLayoutRequest, result: { children?: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }> }): ErLayoutResult {
  if (request.entities) {
    const byId = new Map(request.entities.map((entity) => [entity.id, entity]));
    const layoutEntities = (result.children ?? []).filter((child) => byId.has(child.id)).map((child) => {
      const entity = byId.get(child.id)!;
      const defaultSize = request.dimensions?.[entity.id] ?? erCardSize(entity);
      const size = { width: child.width ?? defaultSize.width, height: child.height ?? defaultSize.height };
      const position = { x: child.x ?? 0, y: child.y ?? 0 };
      return { id: entity.id, ...position, ...size, entity, fields: buildFieldRows(entity, position, size) };
    }).sort((left, right) => compareStable(left.id, right.id));
    return assembleLayout(layoutEntities, request.relations ?? []);
  }
  return layoutLegacyFromElk(request.nodes ?? [], request.edges ?? [], result);
}

function assembleLayout(entities: ErLayoutEntity[], relations: ErRelationGroup[]): ErLayoutResult {
  const fieldRows: Record<string, ErFieldRowRect> = {};
  const fieldPorts: Record<string, ErFieldPort> = {};
  const headerPorts: Record<string, ErHeaderPort> = {};
  const byEntity = new Map(entities.map((entity) => [entity.id, entity]));
  for (const entity of entities) {
    const header = makeHeaderPort(entity);
    headerPorts[entity.id] = header;
    for (const row of entity.fields) {
      fieldRows[row.fieldId] = row;
      fieldPorts[row.fieldId] = makeFieldPort(row);
    }
  }
  const routes = relations.slice().sort((left, right) => compareStable(left.id, right.id)).flatMap((relation) => {
    const source = byEntity.get(relation.sourceEntityId);
    const target = byEntity.get(relation.targetEntityId);
    if (!source || !target) return [];
    if (relation.mappingConfigured && relation.mappings.length) {
      return relation.mappings.slice().sort(compareMappings).flatMap((mapping) => {
        const sourcePort = fieldPorts[mapping.sourceFieldId];
        const targetPort = fieldPorts[mapping.targetFieldId];
        if (!sourcePort || !targetPort) return [];
        return [makeRoute(`${relation.id}:${mapping.id}`, relation, sourcePort, targetPort)];
      });
    }
    const sourcePort = headerPorts[source.id];
    const targetPort = headerPorts[target.id];
    if (!sourcePort || !targetPort) return [];
    return [makeRoute(`${relation.id}:header`, relation, sourcePort, targetPort)];
  });
  const edges = routes.map(toCompatibilityEdge);
  return {
    entities,
    fieldRows,
    fieldPorts,
    headerPorts,
    routes,
    nodes: entities.map(toCompatibilityNode),
    edges,
    degraded: false
  };
}

function buildFieldRows(entity: ErEntityCard, position: ErLayoutPosition, size: ErLayoutDimensions): ErFieldRowRect[] {
  return entity.fields.slice().sort(compareFields).map((field, index) => ({
    fieldId: field.id,
    entityId: entity.id,
    x: position.x,
    y: position.y + CARD_HEADER_HEIGHT + index * FIELD_ROW_HEIGHT,
    width: size.width,
    height: FIELD_ROW_HEIGHT,
    center: { x: position.x + size.width / 2, y: position.y + CARD_HEADER_HEIGHT + index * FIELD_ROW_HEIGHT + FIELD_ROW_HEIGHT / 2 }
  }));
}

function makeFieldPort(row: ErFieldRowRect): ErFieldPort {
  const left = { x: row.x, y: row.center.y };
  const right = { x: row.x + row.width, y: row.center.y };
  return { fieldId: row.fieldId, entityId: row.entityId, row, center: row.center, left, right, source: right, target: left };
}

function makeHeaderPort(entity: ErLayoutEntity): ErHeaderPort {
  const center = { x: entity.x + entity.width / 2, y: entity.y + CARD_HEADER_HEIGHT / 2 };
  const left = { x: entity.x, y: center.y };
  const right = { x: entity.x + entity.width, y: center.y };
  return { entityId: entity.id, center, left, right, source: right, target: left };
}

function makeRoute(id: string, relation: ErRelationGroup, source: ErFieldPort | ErHeaderPort, target: ErFieldPort | ErHeaderPort): ErLayoutRoute {
  const sourceFieldId = "fieldId" in source ? source.fieldId : undefined;
  const targetFieldId = "fieldId" in target ? target.fieldId : undefined;
  const sourcePoint = source.source;
  const targetPoint = target.target;
  const forward = sourcePoint.x <= targetPoint.x;
  return {
    id,
    relationId: relation.id,
    sourceEntityId: source.entityId,
    targetEntityId: target.entityId,
    ...(sourceFieldId ? { sourceFieldId } : {}),
    ...(targetFieldId ? { targetFieldId } : {}),
    mappingConfigured: relation.mappingConfigured,
    points: orthogonalRoute(sourcePoint, targetPoint, forward),
    relation
  };
}

function orthogonalRoute(source: ErPoint, target: ErPoint, forward: boolean): ErPoint[] {
  const sourceLead = { x: source.x + (forward ? ORTHOGONAL_LEAD : -ORTHOGONAL_LEAD), y: source.y };
  const targetLead = { x: target.x - (forward ? ORTHOGONAL_LEAD : -ORTHOGONAL_LEAD), y: target.y };
  const middleX = (sourceLead.x + targetLead.x) / 2;
  return dedupePoints([source, sourceLead, { x: middleX, y: source.y }, { x: middleX, y: target.y }, targetLead, target]);
}

function dedupePoints(points: ErPoint[]): ErPoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y);
}

function buildDeterministicPositions(entities: ErEntityCard[], request: ErDiagramLayoutRequest): Map<string, ErLayoutPosition> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(entities.length)));
  const rowHeights: number[] = [];
  for (let index = 0; index < entities.length; index += 1) {
    const row = Math.floor(index / columns);
    const entity = entities[index]!;
    const size = request.dimensions?.[entity.id] ?? erCardSize(entity);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height);
  }
  const rowOffsets: number[] = [];
  for (let row = 0; row < rowHeights.length; row += 1) rowOffsets[row] = 32 + rowHeights.slice(0, row).reduce((sum, height) => sum + height + GAP_Y, 0);
  return new Map(entities.map((entity, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const position = request.positions?.[entity.id];
    return [entity.id, position && Number.isFinite(position.x) && Number.isFinite(position.y) ? { x: position.x, y: position.y } : { x: 32 + column * (CARD_WIDTH + GAP_X), y: rowOffsets[row] ?? 32 }];
  }));
}

function elkOptions(): Record<string, string> {
  return { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.spacing.nodeNode": String(GAP_Y), "elk.layered.spacing.nodeNodeBetweenLayers": String(GAP_X) };
}

function toCompatibilityNode(entity: ErLayoutEntity): ErLayoutNode {
  const node = entity.entity.node as ErGraphNode;
  return { id: entity.id, x: entity.x, y: entity.y, width: entity.width, height: entity.height, node: { ...node, label: node.label ?? entity.entity.displayName } };
}

function toCompatibilityEdge(route: ErLayoutRoute): ErLayoutEdge {
  const source = route.sourceFieldId ?? route.sourceEntityId;
  const target = route.targetFieldId ?? route.targetEntityId;
  return {
    id: route.id,
    source,
    target,
    points: route.points,
    edge: { id: route.id, source, target, relationshipCode: "REFERENCES", relationGroupId: route.relationId, metadata: { ...route.relation.metadata } }
  };
}

function layoutLegacyGraph(input: { nodes: ErGraphNode[]; edges: ErGraphEdge[] }): ErLayoutResult {
  const nodes = [...input.nodes].sort(compareNodes);
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const positions = new Map<string, ErLayoutNode>();
  for (const [index, node] of nodes.entries()) {
    const size = erCardSize(node);
    positions.set(node.id, { id: node.id, x: index % columns * (size.width + GAP_X) + 32, y: Math.floor(index / columns) * (size.height + GAP_Y) + 32, ...size, node });
  }
  const edges = input.edges.filter((edge) => positions.has(edge.source) && positions.has(edge.target)).sort(compareEdges).map((edge) => {
    const source = positions.get(edge.source)!;
    const target = positions.get(edge.target)!;
    const forward = source.x <= target.x;
    const start = { x: forward ? source.x + source.width : source.x, y: source.y + source.height / 2 };
    const end = { x: forward ? target.x : target.x + target.width, y: target.y + target.height / 2 };
    return { id: edge.id, source: edge.source, target: edge.target, points: orthogonalRoute(start, end, forward), edge };
  });
  return { entities: [], fieldRows: {}, fieldPorts: {}, headerPorts: {}, routes: [], nodes: [...positions.values()], edges, degraded: false };
}

function layoutLegacyFromElk(nodes: ErGraphNode[], edges: ErGraphEdge[], result: { children?: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }> }): ErLayoutResult {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const laidOut = (result.children ?? []).filter((child) => byId.has(child.id)).map((child) => {
    const node = byId.get(child.id)!;
    const size = erCardSize(node);
    return { id: node.id, x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? size.width, height: child.height ?? size.height, node };
  });
  const positions = new Map(laidOut.map((node) => [node.id, node]));
  const layoutEdges = edges.filter((edge) => positions.has(edge.source) && positions.has(edge.target)).sort(compareEdges).map((edge) => {
    const source = positions.get(edge.source)!;
    const target = positions.get(edge.target)!;
    const forward = source.x <= target.x;
    const start = { x: forward ? source.x + source.width : source.x, y: source.y + source.height / 2 };
    const end = { x: forward ? target.x : target.x + target.width, y: target.y + target.height / 2 };
    return { id: edge.id, source: edge.source, target: edge.target, points: orthogonalRoute(start, end, forward), edge };
  });
  return { entities: [], fieldRows: {}, fieldPorts: {}, headerPorts: {}, routes: [], nodes: laidOut, edges: layoutEdges, degraded: false };
}

function compareEntities(left: ErEntityCard, right: ErEntityCard): number { return left.ordinal - right.ordinal || compareStable(left.id, right.id); }
function compareFields(left: ErFieldRow, right: ErFieldRow): number { return left.ordinal - right.ordinal || compareStable(left.id, right.id); }
function compareMappings(left: ErRelationGroup["mappings"][number], right: ErRelationGroup["mappings"][number]): number { return (left.mappingIndex ?? Number.MAX_SAFE_INTEGER) - (right.mappingIndex ?? Number.MAX_SAFE_INTEGER) || compareStable(left.id, right.id); }
function compareNodes(left: ErGraphNode, right: ErGraphNode): number { return compareStable(left.id, right.id); }
function compareEdges(left: ErGraphEdge, right: ErGraphEdge): number { return compareStable(left.id, right.id); }
function compareElkEdges(left: { id: string }, right: { id: string }): number { return compareStable(left.id, right.id); }
function compareStable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
