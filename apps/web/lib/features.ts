import { createHmac, timingSafeEqual } from "node:crypto";
import {
  deriveFeatureGovernanceState,
  localizeAsset,
  type ArchitectureScopeRef,
  type AssetLocale,
  type FeatureAsset,
  type FeatureAssetType,
  type FeatureGovernanceRelationship,
  type FeatureGovernanceState,
  type ScopedPrincipal
} from "@specforge/core";
import { prisma } from "./db";
import { requireReadableApplicationService, scopeDatabaseWhere } from "./scope";

export interface FeatureListQuery { kind?: FeatureAssetType; query?: string; locale?: AssetLocale; limit?: number; cursor?: string; }
export interface FeatureListItem {
  id: string;
  assetType: FeatureAssetType;
  name: string;
  summary: string;
  lifecycleStatus: string;
  owner?: string;
  tags: string[];
  updatedAt: string;
  version: string;
  contentDigest: string;
  architectureScope: ArchitectureScopeRef;
  governance: FeatureGovernanceState;
}
export interface FeatureListPage { architectureScope: ArchitectureScopeRef; items: FeatureListItem[]; hasMore: boolean; nextCursor?: string; }
export interface FeatureRelationshipView extends FeatureGovernanceRelationship { id: string; sourceId: string; targetId: string; oppositeId: string; oppositeLabel: string; }
export interface FeatureDetail extends FeatureListItem { asset: FeatureAsset; relationships: FeatureRelationshipView[]; }
export interface FeatureGraphResponse {
  architectureScope: ArchitectureScopeRef;
  mode: FeatureGraphMode;
  nodes: Array<{ id: string; logicalId: string; nodeType: string; label: string; summary?: string; lifecycleStatus?: string }>;
  edges: Array<{ id: string; source: string; target: string; relationType: string }>;
  partial: boolean;
  graphVersion: string;
}
export type FeatureGraphMode = "feature" | "all";

const featureGraphSupportTypes = new Set(["api", "apiOperation", "dataModel", "dataEntity", "dataField", "event", "businessRule", "stateMachine", "quality", "observability"]);

type FeatureRow = { assetId: string; assetType: string; canonicalName: string; canonicalSummary: string; localizedNameZh: string; localizedSummaryZh: string; status: string | null; updatedAt: Date; catalogVersion: bigint; contentDigest: string };

export async function listScopedFeatures(scopeId: string, query: FeatureListQuery, principal: ScopedPrincipal): Promise<FeatureListPage> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const architectureScope = scopeDatabaseWhere(scope);
  const limit = Math.max(1, Math.min(query.limit ?? 25, 100));
  const cursor = query.cursor ? decodeFeatureCursor(query.cursor, architectureScope, query.kind) : undefined;
  const search = query.query?.trim().toLocaleLowerCase() ?? "";
  const rows = await prisma.assetSearchProjection.findMany({
    where: {
      ...architectureScope,
      assetType: query.kind ?? { in: ["serviceFeature", "functionalFeature"] },
      ...(search ? { searchDocument: { contains: search, mode: "insensitive" } } : {}),
      ...(cursor ? { OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, assetId: { gt: cursor.assetId } }] } : {})
    },
    orderBy: [{ updatedAt: "desc" }, { assetId: "asc" }],
    take: limit + 1
  });
  const page = rows.slice(0, limit) as FeatureRow[];
  const governance = await governanceForRows(architectureScope, page);
  return {
    architectureScope,
    items: page.map((row) => mapListItem(row, query.locale ?? "en", architectureScope, governance.get(row.assetId))),
    hasMore: rows.length > limit,
    ...(rows.length > limit && page.at(-1) ? { nextCursor: encodeFeatureCursor(page.at(-1)!, architectureScope, query.kind) } : {})
  };
}

export async function getScopedFeatureDetail(scopeId: string, assetId: string, locale: AssetLocale, principal: ScopedPrincipal): Promise<FeatureDetail> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const architectureScope = scopeDatabaseWhere(scope);
  const [row, projection] = await Promise.all([
    prisma.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...architectureScope, id: assetId } } }),
    prisma.assetSearchProjection.findFirst({ where: { ...architectureScope, assetId, assetType: { in: ["serviceFeature", "functionalFeature"] } } })
  ]);
  if (!row || !projection || !isFeatureType(row.type)) throw new FeatureReadError("FEATURE_NOT_FOUND", 404);
  const asset = localizeAsset(row.type, { ...(JSON.parse(row.payload) as FeatureAsset), architectureScope } as never, locale) as FeatureAsset;
  const node = await prisma.assetNode.findFirst({ where: { ...architectureScope, nodeType: row.type, logicalId: assetId } });
  const relations = node ? await prisma.relationshipCurrent.findMany({ where: { ...architectureScope, lifecycleStatus: "ACTIVE", OR: [{ sourceNodeId: node.dbId }, { targetNodeId: node.dbId }] }, include: { sourceNode: true, targetNode: true }, orderBy: [{ relationType: "asc" }, { dbId: "asc" }] }) : [];
  const relationships = relations.map((relation) => {
    const incoming = relation.targetNodeId === node?.dbId;
    const opposite = incoming ? relation.sourceNode : relation.targetNode;
    return { id: relation.dbId, relationType: relation.relationType, sourceType: relation.sourceNode.nodeType, targetType: relation.targetNode.nodeType, direction: incoming ? "incoming" as const : "outgoing" as const, metadata: asRecord(relation.metadata), sourceId: relation.sourceNode.logicalId, targetId: relation.targetNode.logicalId, oppositeId: opposite.logicalId, oppositeLabel: opposite.displayName };
  });
  const governance = deriveFeatureGovernanceState({ featureType: row.type, acceptanceCriteria: asset.acceptanceCriteria, relationships, currentVersion: projection.catalogVersion.toString(), currentContentDigest: projection.contentDigest });
  return { ...mapListItem(projection as FeatureRow, locale, architectureScope, governance), asset, relationships };
}

export async function getScopedFeatureGraph(scopeId: string, options: { root?: string; depth?: number; limit?: number; locale?: AssetLocale; mode?: FeatureGraphMode }, principal: ScopedPrincipal): Promise<FeatureGraphResponse> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const architectureScope = scopeDatabaseWhere(scope);
  const mode = options.mode ?? "feature";
  const limit = Math.max(1, Math.min(options.limit ?? 300, 500));
  const depth = Math.max(1, Math.min(options.depth ?? 2, 3));
  const roots = await prisma.assetNode.findMany({ where: { ...architectureScope, ...(mode === "feature" ? { nodeType: { in: ["serviceFeature", "functionalFeature"] } } : {}), ...(options.root ? { logicalId: options.root } : {}) }, orderBy: [{ nodeType: "asc" }, { logicalId: "asc" }], take: options.root ? 1 : Math.min(mode === "feature" ? 100 : 80, limit) });
  if (options.root && roots.length === 0) throw new FeatureReadError("FEATURE_NOT_FOUND", 404);
  const nodes = new Map(roots.map((node) => [node.dbId, node]));
  const edges = new Map<string, Awaited<ReturnType<typeof readGraphEdges>>[number]>();
  let frontier = roots.map((node) => node.dbId);
  for (let hop = 0; hop < depth && frontier.length && nodes.size < limit; hop += 1) {
    const relations = await readGraphEdges(architectureScope, frontier, Math.min(limit, 1_000));
    const next: string[] = [];
    for (const relation of relations) {
      if (mode === "feature" && ![relation.sourceNode.nodeType, relation.targetNode.nodeType].every((type) => isFeatureType(type) || featureGraphSupportTypes.has(type))) continue;
      if (edges.size >= limit) break;
      edges.set(relation.dbId, relation);
      for (const node of [relation.sourceNode, relation.targetNode]) {
        if (!nodes.has(node.dbId) && nodes.size < limit) { nodes.set(node.dbId, node); next.push(node.dbId); }
      }
    }
    frontier = next;
  }
  const featureIds = [...nodes.values()].filter((node) => isFeatureType(node.nodeType)).map((node) => node.logicalId);
  const projections = await prisma.assetSearchProjection.findMany({ where: { ...architectureScope, assetId: { in: featureIds }, assetType: { in: ["serviceFeature", "functionalFeature"] } } });
  const projectionById = new Map(projections.map((projection) => [projection.assetId, projection]));
  const locale = options.locale ?? "en";
  const graphVersion = await prisma.relationshipEvent.aggregate({ where: architectureScope, _max: { graphVersion: true } });
  return {
    architectureScope,
    mode,
    nodes: [...nodes.values()].map((node) => { const projected = projectionById.get(node.logicalId); return { id: node.dbId, logicalId: node.logicalId, nodeType: node.nodeType, label: projected ? locale === "zh" ? projected.localizedNameZh : projected.canonicalName : node.displayName, ...(projected ? { summary: locale === "zh" ? projected.localizedSummaryZh : projected.canonicalSummary, lifecycleStatus: projected.status ?? undefined } : {}) }; }),
    edges: [...edges.values()].map((edge) => ({ id: edge.dbId, source: edge.sourceNodeId, target: edge.targetNodeId, relationType: edge.relationType })),
    partial: nodes.size >= limit || edges.size >= limit,
    graphVersion: graphVersion._max.graphVersion?.toString() ?? "0"
  };
}

async function governanceForRows(scope: ArchitectureScopeRef, rows: FeatureRow[]): Promise<Map<string, FeatureGovernanceState>> {
  const nodes = await prisma.assetNode.findMany({ where: { ...scope, nodeType: { in: ["serviceFeature", "functionalFeature"] }, logicalId: { in: rows.map((row) => row.assetId) } } });
  const relations = nodes.length ? await prisma.relationshipCurrent.findMany({ where: { ...scope, lifecycleStatus: "ACTIVE", OR: [{ sourceNodeId: { in: nodes.map((node) => node.dbId) } }, { targetNodeId: { in: nodes.map((node) => node.dbId) } }] }, include: { sourceNode: true, targetNode: true } }) : [];
  const assets = await prisma.designAsset.findMany({ where: { ...scope, id: { in: rows.map((row) => row.assetId) } }, select: { id: true, payload: true } });
  const criteria = new Map(assets.map((asset) => [asset.id, (JSON.parse(asset.payload) as FeatureAsset).acceptanceCriteria ?? []]));
  return new Map(rows.map((row) => {
    const node = nodes.find((candidate) => candidate.logicalId === row.assetId && candidate.nodeType === row.assetType);
    const featureRelations = node ? relations.filter((relation) => relation.sourceNodeId === node.dbId || relation.targetNodeId === node.dbId).map((relation) => ({ relationType: relation.relationType, sourceType: relation.sourceNode.nodeType, targetType: relation.targetNode.nodeType, direction: relation.targetNodeId === node.dbId ? "incoming" as const : "outgoing" as const, metadata: asRecord(relation.metadata) })) : [];
    return [row.assetId, deriveFeatureGovernanceState({ featureType: row.assetType as FeatureAssetType, acceptanceCriteria: criteria.get(row.assetId) ?? [], relationships: featureRelations, currentVersion: row.catalogVersion.toString(), currentContentDigest: row.contentDigest })];
  }));
}

async function readGraphEdges(scope: ArchitectureScopeRef, frontier: string[], take: number) {
  return prisma.relationshipCurrent.findMany({ where: { ...scope, lifecycleStatus: "ACTIVE", OR: [{ sourceNodeId: { in: frontier } }, { targetNodeId: { in: frontier } }] }, include: { sourceNode: true, targetNode: true }, orderBy: [{ updatedAt: "asc" }, { dbId: "asc" }], take });
}

function mapListItem(row: FeatureRow, locale: AssetLocale, scope: ArchitectureScopeRef, governance?: FeatureGovernanceState): FeatureListItem {
  return { id: row.assetId, assetType: row.assetType as FeatureAssetType, name: locale === "zh" ? row.localizedNameZh : row.canonicalName, summary: locale === "zh" ? row.localizedSummaryZh : row.canonicalSummary, lifecycleStatus: row.status ?? "DRAFT", tags: [], updatedAt: row.updatedAt.toISOString(), version: row.catalogVersion.toString(), contentDigest: row.contentDigest, architectureScope: scope, governance: governance ?? deriveFeatureGovernanceState({ featureType: row.assetType as FeatureAssetType, acceptanceCriteria: [], relationships: [] }) };
}

type CursorPayload = { v: 1; scope: ArchitectureScopeRef; kind: FeatureAssetType | "all"; updatedAt: string; assetId: string };
const CURSOR_SECRET = process.env.SPECFORGE_FEATURE_CURSOR_SECRET ?? process.env.SPECFORGE_READ_CURSOR_SECRET ?? "specforge-local-feature-cursor";
export function encodeFeatureCursor(row: { updatedAt: Date; assetId: string }, scope: ArchitectureScopeRef, kind?: FeatureAssetType): string { const body = Buffer.from(JSON.stringify({ v: 1, scope, kind: kind ?? "all", updatedAt: row.updatedAt.toISOString(), assetId: row.assetId } satisfies CursorPayload), "utf8").toString("base64url"); return `${body}.${createHmac("sha256", CURSOR_SECRET).update(body).digest("base64url")}`; }
export function decodeFeatureCursor(value: string, scope: ArchitectureScopeRef, kind?: FeatureAssetType): { updatedAt: Date; assetId: string } { try { const [body, signature] = value.split(".", 2); if (!body || !signature) throw new Error(); const expected = createHmac("sha256", CURSOR_SECRET).update(body).digest("base64url"); if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error(); const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload; if (parsed.v !== 1 || parsed.scope.applicationServiceId !== scope.applicationServiceId || parsed.scope.scopePath !== scope.scopePath || parsed.kind !== (kind ?? "all")) throw new Error(); const updatedAt = new Date(parsed.updatedAt); if (Number.isNaN(updatedAt.getTime()) || !parsed.assetId) throw new Error(); return { updatedAt, assetId: parsed.assetId }; } catch { throw new FeatureReadError("FEATURE_CURSOR_INVALID", 400); } }

export class FeatureReadError extends Error { constructor(public readonly code: string, public readonly status: number) { super(code); } }
function isFeatureType(value: string): value is FeatureAssetType { return value === "serviceFeature" || value === "functionalFeature"; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
