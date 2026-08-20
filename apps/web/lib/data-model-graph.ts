import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  extractAssetGraph,
  graphError,
  normalizeDataModelGraphFilters,
  normalizeDataModelGraphPaging,
  stableEdgeKey,
  stableNodeKey,
  type ArchitectureScopeRef,
  type AssetNodeIdentity,
  type DataModel,
  type DataModelGraphCursorPayload,
  type DataModelGraphEdge,
  type DataModelGraphNode,
  type DataModelGraphQuery,
  type DataModelGraphResponse,
  type DataModelGraphWaterlines,
  type ScopedPrincipal
} from "@specforge/core";
import { prisma } from "./db";
import { requireReadableApplicationService } from "./scope";

const CURSOR_SECRET = process.env.SPECFORGE_GRAPH_CURSOR_SECRET ?? "specforge-local-graph-cursor-secret";

export class DataModelGraphReadError extends Error {
  constructor(readonly code: "SCOPE_UNAVAILABLE" | "CURSOR_INVALID" | "SNAPSHOT_CHANGED" | "ENDPOINT_NOT_FOUND" | "DATA_MODEL_UPGRADE_REQUIRED" | "FIELD_OWNERSHIP_AMBIGUOUS" | "CLIENT_CAPACITY_EXCEEDED" | "PARTIAL", readonly details?: Record<string, unknown>) {
    super(code);
    this.name = "DataModelGraphReadError";
  }
}

type GraphReadClient = {
  authoredCatalogCursor: { findUnique(args: unknown): Promise<{ nextVersion: bigint } | null> };
  authoredAssetRevision: { findMany(args: unknown): Promise<unknown[]> };
  designAsset: { findMany(args: unknown): Promise<unknown[]> };
  assetNode: { findMany(args: unknown): Promise<unknown[]> };
  relationshipCurrent: { findMany(args: unknown): Promise<unknown[]> };
  relationshipEvent: { findMany(args: unknown): Promise<unknown[]>; aggregate(args: unknown): Promise<{ _max: { graphVersion: bigint | null } }> };
};

export interface DataModelGraphReadRepository {
  readSnapshot(scope: ArchitectureScopeRef): Promise<GraphSnapshot>;
}

export interface GraphSnapshot {
  assets: DataModel[];
  nodes: unknown[];
  relationships: unknown[];
  waterlines: DataModelGraphWaterlines;
}

export async function getDataModelGraph(query: DataModelGraphQuery, principal?: ScopedPrincipal, repository: DataModelGraphReadRepository = createPrismaRepository()): Promise<DataModelGraphResponse> {
  const scope = resolveExactScope(query.architectureScope, principal);
  if (!query.subject?.trim()) throw new DataModelGraphReadError("SCOPE_UNAVAILABLE", { reason: "SUBJECT_REQUIRED" });
  const paging = normalizeDataModelGraphPaging(query);
  const normalizedFilters = normalizeDataModelGraphFilters({ ...query.filters, rootModelId: query.rootModelId ?? query.filters?.rootModelId });
  const snapshot = await repository.readSnapshot(scope);
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  if (cursor) {
    if (!cursorQueryMatches(cursor, query, normalizedFilters, paging)) throw new DataModelGraphReadError("CURSOR_INVALID");
    if (!waterlinesMatch(cursor.waterlines, snapshot.waterlines)) throw new DataModelGraphReadError("SNAPSHOT_CHANGED", { cursorWaterlines: cursor.waterlines, currentWaterlines: snapshot.waterlines });
  }

  let { nodes, edges } = materializeGraph(snapshot.assets, snapshot.nodes, snapshot.relationships, scope, query.locale ?? "en");
  const errors = [] as DataModelGraphResponse["errors"];
  if (snapshot.assets.some((asset) => asset.schemaVersion !== 2)) errors.push(graphError("DATA_MODEL_UPGRADE_REQUIRED"));
  ({ nodes, edges } = applyGraphFilters(nodes, edges, query.mode, normalizedFilters, query.rootModelId));
  nodes.sort((left, right) => compareStable(stableNodeKey(left), stableNodeKey(right)));
  edges.sort((left, right) => compareStable(stableEdgeKey(left), stableEdgeKey(right)));

  if (cursor?.afterNode) nodes = nodes.filter((node) => stableNodeKey(node) > cursor.afterNode!);
  if (cursor?.afterEdge) edges = edges.filter((edge) => stableEdgeKey(edge) > cursor.afterEdge!);

  const total = nodes.length + edges.length;
  let partial = false;
  if (total > paging.clientCapacity) {
    partial = true;
    const nodeLimit = Math.min(nodes.length, paging.clientCapacity);
    nodes = nodes.slice(0, nodeLimit);
    edges = edges.slice(0, Math.max(0, paging.clientCapacity - nodes.length));
    errors.push(graphError("PARTIAL", { verifiedSubset: true, requestedCapacity: paging.clientCapacity, total }));
  }

  const nodePage = nodes.slice(0, paging.pageSize);
  const edgePage = edges.slice(0, paging.pageSize);
  const hasMore = nodes.length > nodePage.length || edges.length > edgePage.length;
  const nextPayload: DataModelGraphCursorPayload = {
    version: 1,
    subject: query.subject,
    architectureScope: scope,
    mode: query.mode,
    ...(query.rootModelId ? { rootModelId: query.rootModelId } : {}),
    filters: normalizedFilters,
    pageSize: paging.pageSize,
    clientCapacity: paging.clientCapacity,
    waterlines: snapshot.waterlines,
    ...(nodePage.at(-1) ? { afterNode: stableNodeKey(nodePage.at(-1)!) } : cursor?.afterNode ? { afterNode: cursor.afterNode } : {}),
    ...(edgePage.at(-1) ? { afterEdge: stableEdgeKey(edgePage.at(-1)!) } : cursor?.afterEdge ? { afterEdge: cursor.afterEdge } : {})
  };
  return {
    architectureScope: scope,
    mode: query.mode,
    ...(query.rootModelId ? { rootModelId: query.rootModelId } : {}),
    nodes: nodePage,
    edges: edgePage,
    waterlines: snapshot.waterlines,
    hasMore,
    partial,
    ...(hasMore ? { nextCursor: encodeCursor(nextPayload) } : {}),
    errors
  };
}

export function encodeDataModelGraphCursor(payload: DataModelGraphCursorPayload): string { return encodeCursor(payload); }
export function decodeDataModelGraphCursor(value: string): DataModelGraphCursorPayload { return decodeCursor(value); }

function resolveExactScope(input: ArchitectureScopeRef, principal?: ScopedPrincipal): ArchitectureScopeRef {
  try {
    const scope = requireReadableApplicationService(input.applicationServiceId, principal);
    if (scope.scopePath !== input.scopePath) throw new DataModelGraphReadError("SCOPE_UNAVAILABLE", { reason: "SCOPE_PATH_MISMATCH" });
    return { applicationServiceId: scope.id, scopePath: scope.scopePath };
  } catch (error) {
    if (error instanceof DataModelGraphReadError) throw error;
    throw new DataModelGraphReadError("SCOPE_UNAVAILABLE");
  }
}

function createPrismaRepository(client: GraphReadClient = prisma as unknown as GraphReadClient): DataModelGraphReadRepository {
  return { readSnapshot: (scope) => readPrismaSnapshot(client, scope) };
}

async function readPrismaSnapshot(client: GraphReadClient, scope: ArchitectureScopeRef): Promise<GraphSnapshot> {
  const before = await readWaterlines(client, scope);
  const [revisionRows, fallbackRows, nodes, relationships] = await Promise.all([
    client.authoredAssetRevision.findMany({ where: { ...scope, catalogVersion: { lte: BigInt(before.catalogVersion) } }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }] }),
    client.designAsset.findMany({ where: { ...scope, type: "dataModel" }, orderBy: { id: "asc" } }),
    client.assetNode.findMany({ where: { ...scope, lifecycleStatus: "ACTIVE" }, orderBy: [{ nodeType: "asc" }, { logicalId: "asc" }] }),
    client.relationshipCurrent.findMany({ where: { ...scope, lifecycleStatus: "ACTIVE", validTo: null }, include: { sourceNode: true, targetNode: true }, orderBy: [{ relationType: "asc" }, { dbId: "asc" }] })
  ]);
  const assets = latestDataModels(revisionRows, fallbackRows);
  const after = await readWaterlines(client, scope);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new DataModelGraphReadError("SNAPSHOT_CHANGED");
  return { assets, nodes, relationships, waterlines: after };
}

async function readWaterlines(client: GraphReadClient, scope: ArchitectureScopeRef): Promise<DataModelGraphWaterlines> {
  const [cursor, revisions, relationshipEvents, relationshipMax] = await Promise.all([
    client.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } }),
    client.authoredAssetRevision.findMany({ where: scope, select: { assetType: true, assetId: true, catalogVersion: true, operation: true, contentDigest: true }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }] }),
    client.relationshipEvent.findMany({ where: scope, select: { dbId: true, graphVersion: true, action: true, relationshipId: true, snapshot: true }, orderBy: [{ graphVersion: "asc" }, { dbId: "asc" }] }),
    client.relationshipEvent.aggregate({ where: scope, _max: { graphVersion: true } })
  ]);
  const catalogVersion = cursor?.nextVersion ?? 0n;
  const relationshipVersion = relationshipMax._max.graphVersion ?? 0n;
  return {
    catalogVersion: catalogVersion.toString(),
    catalogDigest: digest({ scope, catalogVersion: catalogVersion.toString(), revisions: revisions.map(toJsonSafe) }),
    relationshipVersion: relationshipVersion.toString(),
    relationshipDigest: digest({ scope, relationshipVersion: relationshipVersion.toString(), events: relationshipEvents.map(toJsonSafe) })
  };
}

function latestDataModels(revisions: unknown[], fallbackRows: unknown[]): DataModel[] {
  const latest = new Map<string, unknown>();
  for (const row of revisions) {
    const value = asRecord(row);
    if (value.assetType !== "dataModel") continue;
    latest.set(String(value.assetId), row);
  }
  const fallbackById = new Map(fallbackRows.map((row) => {
    const value = asRecord(row);
    return [String(value.id), row] as const;
  }));
  for (const [assetId, row] of latest) {
    if (asRecord(row).operation === "DELETE") fallbackById.delete(assetId);
    else fallbackById.set(assetId, row);
  }
  return [...fallbackById.values()].flatMap((row) => {
    const value = asRecord(row);
    if (value.operation === "DELETE") return [];
    return [parseJson(value.payload) as DataModel];
  });
}

function materializeGraph(assets: DataModel[], ledgerNodes: unknown[], relationships: unknown[], scope: ArchitectureScopeRef, locale: "en" | "zh"): { nodes: DataModelGraphNode[]; edges: DataModelGraphEdge[] } {
  const nodes = new Map<string, DataModelGraphNode>();
  const edges = new Map<string, DataModelGraphEdge>();
  for (const asset of assets) {
    const extracted = extractAssetGraph("dataModel", { ...asset, architectureScope: scope });
    for (const node of extracted.nodes) nodes.set(nodeKey(node), graphNodeFromIdentity(node, asset, locale));
    for (const edge of extracted.relationships) edges.set(edge.id, { id: edge.id, source: nodeKey(edge.sourceNode), target: nodeKey(edge.targetNode), relationshipCode: edge.code, sourceReference: edge.sourceReference, metadata: (edge.metadata ?? {}) as Record<string, unknown> });
  }
  for (const row of ledgerNodes) {
    const node = asRecord(row);
    const nodeType = String(node.nodeType) as DataModelGraphNode["nodeType"];
    if (!["dataModel", "dataEntity", "dataField"].includes(nodeType)) continue;
    const identity = { nodeType, logicalId: String(node.logicalId), rootAssetId: String(node.rootAssetId), displayName: String(node.displayName ?? node.logicalId), external: true };
    const key = `${nodeType}:${identity.logicalId}`;
    if (!nodes.has(key)) nodes.set(key, { id: key, nodeType, logicalId: identity.logicalId, rootModelId: identity.rootAssetId, displayName: identity.displayName, external: true, scope, metadata: asRecord(node.metadata) });
  }
  for (const row of relationships) {
    const value = asRecord(row);
    const relationType = String(value.relationType);
    if (relationType !== "REFERENCES" && relationType !== "CONTAINS") continue;
    const sourceNode = asRecord(value.sourceNode);
    const targetNode = asRecord(value.targetNode);
    const source = nodeRefFromLedger(sourceNode);
    const target = nodeRefFromLedger(targetNode);
    if (!source || !target) continue;
    if (!nodes.has(source)) nodes.set(source, ledgerNodeFallback(sourceNode, source, scope));
    if (!nodes.has(target)) nodes.set(target, ledgerNodeFallback(targetNode, target, scope));
    const id = `relationship:${String(value.dbId)}`;
    edges.set(id, { id, source, target, relationshipCode: relationType, sourceReference: String(value.sourceReference ?? ""), metadata: asRecord(value.metadata) });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function applyGraphFilters(nodes: DataModelGraphNode[], edges: DataModelGraphEdge[], mode: DataModelGraphQuery["mode"], filters: DataModelGraphCursorPayload["filters"], rootModelId?: string) {
  const selectedModel = rootModelId ?? filters.rootModelId;
  let visibleNodes = nodes.filter((node) => mode === "SCOPE" || !selectedModel || node.rootModelId === selectedModel);
  if (selectedModel && mode === "MODEL") {
    const boundary = edges.filter((edge) => visibleNodes.some((node) => node.id === edge.source) !== visibleNodes.some((node) => node.id === edge.target));
    const boundaryIds = new Set(boundary.flatMap((edge) => [edge.source, edge.target]));
    visibleNodes = visibleNodes.filter((node) => node.rootModelId === selectedModel || boundaryIds.has(node.id));
  }
  if (filters.nodeTypes.length) visibleNodes = visibleNodes.filter((node) => filters.nodeTypes.includes(node.nodeType));
  if (filters.search) visibleNodes = visibleNodes.filter((node) => `${node.displayName} ${node.logicalId} ${node.description ?? ""}`.toLocaleLowerCase("en-US").includes(filters.search));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => (!filters.relationshipCodes.length || filters.relationshipCodes.includes(edge.relationshipCode)) && visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return { nodes: visibleNodes, edges: visibleEdges };
}

function graphNodeFromIdentity(node: AssetNodeIdentity, asset: DataModel, _locale: "en" | "zh"): DataModelGraphNode {
  const nodeType = node.nodeType as DataModelGraphNodeNodeType;
  const definition = nodeType === "dataEntity" ? asset.entityDefinitions?.find((entity) => node.logicalId.endsWith(`.entity.${entity.id}`)) : undefined;
  const field = nodeType === "dataField" ? asset.fields.find((item) => node.logicalId.endsWith(`.field.${item.id}`)) : undefined;
  const displayName = nodeType === "dataModel" ? asset.name : definition?.name ?? field?.fieldName ?? node.logicalId;
  return {
    id: nodeKey(node),
    nodeType,
    logicalId: node.logicalId,
    rootModelId: node.rootAssetId,
    displayName,
    description: definition?.description,
    external: node.external,
    scope: { applicationServiceId: node.applicationServiceId, scopePath: node.scopePath },
    metadata: {
      ...(definition ? {
        ...(definition.physicalName ? { physicalName: definition.physicalName } : {}),
        ordinal: definition.ordinal
      } : {}),
      ...(field ? {
        ...(field.entityId ? { entityId: field.entityId } : {}),
        displayName: field.displayName,
        dataType: field.dataType,
        ...(field.ordinal === undefined ? {} : { ordinal: field.ordinal }),
        nullable: field.nullable,
        required: !field.nullable,
        ...(field.primaryKey === undefined ? {} : { primaryKey: field.primaryKey }),
        ...(field.unique === undefined ? {} : { unique: field.unique }),
        ...(field.generated === undefined ? {} : { generated: field.generated }),
        ...(field.classification ? { classification: field.classification } : {}),
        ...(field.sensitiveLevel ? { sensitiveLevel: field.sensitiveLevel } : {}),
        ...(field.example ? { example: field.example } : {}),
        owner: field.owner
      } : {})
    }
  };
}

type DataModelGraphNodeNodeType = DataModelGraphNode["nodeType"];
function nodeKey(node: Pick<AssetNodeIdentity, "nodeType" | "logicalId">): string { return `${node.nodeType}:${node.logicalId}`; }
function nodeRefFromLedger(node: Record<string, unknown>): string | undefined { return node.nodeType && node.logicalId ? `${String(node.nodeType)}:${String(node.logicalId)}` : undefined; }
function ledgerNodeFallback(node: Record<string, unknown>, id: string, scope: ArchitectureScopeRef): DataModelGraphNode { const nodeType = String(node.nodeType) as DataModelGraphNodeNodeType; return { id, nodeType, logicalId: String(node.logicalId), rootModelId: String(node.rootAssetId), displayName: String(node.displayName ?? node.logicalId), external: true, scope, metadata: asRecord(node.metadata) }; }
function cursorQueryMatches(cursor: DataModelGraphCursorPayload, query: DataModelGraphQuery, filters: DataModelGraphCursorPayload["filters"], paging: { pageSize: number; clientCapacity: number }): boolean { return cursor.version === 1 && cursor.subject === query.subject && cursor.architectureScope.applicationServiceId === query.architectureScope.applicationServiceId && cursor.architectureScope.scopePath === query.architectureScope.scopePath && cursor.mode === query.mode && cursor.rootModelId === query.rootModelId && JSON.stringify(cursor.filters) === JSON.stringify(filters) && cursor.pageSize === paging.pageSize && cursor.clientCapacity === paging.clientCapacity; }
function waterlinesMatch(left: DataModelGraphWaterlines, right: DataModelGraphWaterlines): boolean { return left.catalogVersion === right.catalogVersion && left.catalogDigest === right.catalogDigest && left.relationshipVersion === right.relationshipVersion && left.relationshipDigest === right.relationshipDigest; }
function encodeCursor(payload: DataModelGraphCursorPayload): string { const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"); const signature = createHmac("sha256", CURSOR_SECRET).update(body).digest("base64url"); return `${body}.${signature}`; }
function decodeCursor(value: string): DataModelGraphCursorPayload { try { const [body, signature] = value.split(".", 2); if (!body || !signature) throw new Error(); const expected = createHmac("sha256", CURSOR_SECRET).update(body).digest("base64url"); if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error(); const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DataModelGraphCursorPayload; if (payload.version !== 1 || !payload.waterlines) throw new Error(); return payload; } catch { throw new DataModelGraphReadError("CURSOR_INVALID"); } }
function parseJson(value: unknown): unknown { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return {}; } }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function toJsonSafe(value: unknown): unknown { if (typeof value === "bigint") return value.toString(); if (value instanceof Date) return value.toISOString(); if (Array.isArray(value)) return value.map(toJsonSafe); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)])); return value; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(toJsonSafe(value))).digest("hex"); }
function compareStable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
