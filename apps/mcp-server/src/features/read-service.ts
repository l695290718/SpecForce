import {
  localizeAsset,
  type ArchitectureScopeRef,
  type AssetLocale,
  type AssetNodeType,
  type FeatureAsset,
  type FeatureAssetType
} from "@specforge/core";
import { assertLegacyKnowledgeReadAllowed } from "../knowledge-readiness/compatibility";
import { currentRequestPrincipal } from "../auth";
import { configuredRelationshipScope, ensureMcpPersistenceSchema, prisma, readableScope } from "../persistence";

export interface FeatureListInput {
  architectureScope: ArchitectureScopeRef;
  kind?: FeatureAssetType;
  query?: string;
  locale?: AssetLocale;
  limit?: number;
  cursor?: string;
}

export async function listFeatures(input: FeatureListInput) {
  const scope = exactReadableScope(input.architectureScope);
  await ensureMcpPersistenceSchema();
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const after = decodeCursor(input.cursor, scope, input.kind);
  const terms = input.query?.trim().toLocaleLowerCase() ?? "";
  const rows = await prisma.assetSearchProjection.findMany({
    where: {
      ...scope,
      assetType: input.kind ? input.kind : { in: ["serviceFeature", "functionalFeature"] },
      ...(terms ? { searchDocument: { contains: terms, mode: "insensitive" } } : {}),
      ...(after ? { OR: [{ updatedAt: { lt: after.updatedAt } }, { updatedAt: after.updatedAt, assetId: { gt: after.assetId } }] } : {})
    },
    orderBy: [{ updatedAt: "desc" }, { assetId: "asc" }],
    take: limit + 1
  });
  const page = rows.slice(0, limit);
  return {
    architectureScope: scope,
    items: page.map((row) => ({
      id: row.assetId,
      assetType: row.assetType as FeatureAssetType,
      name: input.locale === "zh" ? row.localizedNameZh : row.canonicalName,
      description: input.locale === "zh" ? row.localizedSummaryZh : row.canonicalSummary,
      version: row.catalogVersion.toString(),
      contentDigest: row.contentDigest,
      updatedAt: row.updatedAt.toISOString()
    })),
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit && page.at(-1) ? encodeCursor(page.at(-1)!, scope, input.kind) : undefined
  };
}

export async function getFeature(input: { architectureScope: ArchitectureScopeRef; assetId: string; locale?: AssetLocale }) {
  const scope = exactReadableScope(input.architectureScope);
  await ensureMcpPersistenceSchema();
  const row = await prisma.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.assetId } } });
  if (!row || (row.type !== "serviceFeature" && row.type !== "functionalFeature")) throw new Error("FEATURE_NOT_FOUND");
  const revision = await prisma.authoredAssetRevision.findFirst({ where: { ...scope, assetId: row.id, assetType: row.type }, orderBy: { catalogVersion: "desc" } });
  const asset = { ...(JSON.parse(row.payload) as FeatureAsset), architectureScope: scope };
  return {
    architectureScope: scope,
    assetType: row.type as FeatureAssetType,
    asset: localizeAsset(row.type as FeatureAssetType, asset as never, input.locale ?? "en"),
    version: (revision?.catalogVersion ?? 0n).toString(),
    contentDigest: revision?.contentDigest ?? ""
  };
}

export async function queryFeatureGraph(input: { architectureScope: ArchitectureScopeRef; root: { nodeType: AssetNodeType; logicalId: string }; depth?: number; limit?: number }) {
  const scope = exactReadableScope(input.architectureScope);
  await ensureMcpPersistenceSchema();
  const graphScope = configuredRelationshipScope(scope);
  const depth = Math.max(1, Math.min(input.depth ?? 2, 3));
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
  const root = await prisma.assetNode.findUnique({
    where: { enterpriseId_applicationServiceId_scopePath_nodeType_logicalId: { ...graphScope, nodeType: input.root.nodeType, logicalId: input.root.logicalId } }
  });
  if (!root) throw new Error("FEATURE_ENDPOINT_NOT_FOUND");
  const nodes = new Map([[root.dbId, root]]);
  const edges = new Map<string, Awaited<ReturnType<typeof loadEdges>>[number]>();
  let frontier = [root.dbId];
  for (let hop = 0; hop < depth && frontier.length && nodes.size < limit; hop++) {
    const rows = await loadEdges(graphScope, frontier, limit - edges.size);
    const next: string[] = [];
    for (const row of rows) {
      edges.set(row.dbId, row);
      for (const node of [row.sourceNode, row.targetNode]) {
        if (!nodes.has(node.dbId) && nodes.size < limit) {
          nodes.set(node.dbId, node);
          next.push(node.dbId);
        }
      }
    }
    frontier = next;
  }
  return {
    architectureScope: scope,
    nodes: [...nodes.values()].map((node) => ({ id: node.dbId, nodeType: node.nodeType, logicalId: node.logicalId, label: node.displayName, rootAssetType: node.rootAssetType, rootAssetId: node.rootAssetId })),
    edges: [...edges.values()].map((edge) => ({ id: edge.dbId, source: edge.sourceNodeId, target: edge.targetNodeId, relationType: edge.relationType, metadata: edge.metadata })),
    partial: nodes.size >= limit || edges.size >= limit,
    graphVersion: (await prisma.relationshipEvent.aggregate({ where: graphScope, _max: { graphVersion: true } }))._max.graphVersion?.toString() ?? "0"
  };
}

export async function validateFeatureCoverage(input: { architectureScope: ArchitectureScopeRef; assetId: string }) {
  const detail = await getFeature({ ...input, locale: "en" });
  const graph = await queryFeatureGraph({ architectureScope: input.architectureScope, root: { nodeType: detail.assetType, logicalId: input.assetId }, depth: 1, limit: 100 });
  const relevant = graph.edges.filter((edge) => edge.relationType !== "CONTAINS");
  return {
    architectureScope: detail.architectureScope,
    assetId: input.assetId,
    coverageStatus: relevant.length === 0 ? "UNMAPPED" : detail.assetType === "serviceFeature" && !relevant.some((edge) => edge.relationType === "CONTRIBUTES_TO") ? "PARTIAL" : "COMPLETE",
    relationshipCount: relevant.length
  };
}

function exactReadableScope(input: ArchitectureScopeRef): ArchitectureScopeRef {
  assertLegacyKnowledgeReadAllowed(currentRequestPrincipal());
  const scope = readableScope(input.applicationServiceId);
  if (scope.scopePath !== input.scopePath) throw new Error("SCOPE_ACCESS_DENIED");
  return scope;
}

async function loadEdges(scope: ReturnType<typeof configuredRelationshipScope>, frontier: string[], take: number) {
  return prisma.relationshipCurrent.findMany({
    where: { ...scope, lifecycleStatus: "ACTIVE", OR: [{ sourceNodeId: { in: frontier } }, { targetNodeId: { in: frontier } }] },
    include: { sourceNode: true, targetNode: true },
    orderBy: [{ updatedAt: "asc" }, { dbId: "asc" }],
    take: Math.max(1, take)
  });
}

function encodeCursor(row: { updatedAt: Date; assetId: string }, scope: ArchitectureScopeRef, kind?: FeatureAssetType): string {
  return Buffer.from(JSON.stringify({ version: 1, scope, kind: kind ?? "all", updatedAt: row.updatedAt.toISOString(), assetId: row.assetId }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined, scope: ArchitectureScopeRef, kind?: FeatureAssetType): { updatedAt: Date; assetId: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (parsed.version !== 1 || JSON.stringify(parsed.scope) !== JSON.stringify(scope) || parsed.kind !== (kind ?? "all") || typeof parsed.updatedAt !== "string" || typeof parsed.assetId !== "string") throw new Error();
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) throw new Error();
    return { updatedAt, assetId: parsed.assetId };
  } catch {
    throw new Error("FEATURE_CURSOR_INVALID");
  }
}
