import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ArchitectureScopeRef,
  KnowledgeProfileId,
  KnowledgeReasonCode,
  KnowledgeRemediationAction,
  KnowledgeTrustStatus,
  ScopedPrincipal
} from "@specforge/core";
import { composeKnowledgeReadinessPolicy, contentDigest, enterpriseMinimumPolicy } from "@specforge/core";
import {
  decodeReadCursor,
  encodeReadCursor,
  ReadCursorError,
  type ReadCursorBinding
} from "@specforge/scoped-read";
import { prisma } from "../persistence";
import {
  evaluateScopedKnowledgeReadiness,
  knowledgeQueryDigest,
  revalidateReceipt,
  type KnowledgeReadRequest,
  type KnowledgeSelector,
  type KnowledgeReadinessResult
} from "./service";
import { getActivePolicyOverlay } from "./repository";

const PROJECTION_VERSION = "system-knowledge-readiness-v1";
const NONE = "__none__";

export interface SystemKnowledgeAsset {
  id: string;
  type: string;
  name: string;
  summary: string;
  domainId?: string;
  status?: string;
  updatedAt: string;
  contentDigest: string;
  architectureScope: ArchitectureScopeRef;
}

export interface SystemKnowledgeRelationship {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  confidence: number;
  architectureScope: ArchitectureScopeRef;
}

export interface SystemKnowledgeReadResult {
  accessDecision: "ALLOW" | "DENY";
  trustStatus: KnowledgeTrustStatus;
  receiptId?: string;
  trustEnvelope?: {
    receiptId: string;
    profileId: KnowledgeProfileId;
    selectorDigest: string;
    architectureScope: ArchitectureScopeRef;
    asOf: string;
    validUntil: string;
    policyVersion: number;
    catalogVersion: string;
    waterlineDigest: string;
    grantDigest: string;
  };
  assets: SystemKnowledgeAsset[];
  relationships: SystemKnowledgeRelationship[];
  responseCompleteness: "COMPLETE" | "PARTIAL";
  nextCursor?: string;
  reasonCodes: readonly KnowledgeReasonCode[];
  remediationActions: readonly KnowledgeRemediationAction[];
  asOf?: string;
}

export interface SystemKnowledgeSnapshotResult {
  accessDecision: "ALLOW" | "DENY";
  receiptId?: string;
  assets: Array<{ id: string; type: string; payload: Record<string, unknown>; contentDigest: string; architectureScope: ArchitectureScopeRef }>;
  proposals: Array<{ id: string; payload: Record<string, unknown>; contentDigest: string; architectureScope: ArchitectureScopeRef }>;
  contextPacks: Array<{ id: string; payload: Record<string, unknown>; contentDigest: string; architectureScope: ArchitectureScopeRef }>;
  assetLinks: Array<{ id: string; sourceType: string; sourceId: string; targetType: string; targetId: string; relationType: string; description?: string; architectureScope: ArchitectureScopeRef }>;
  manifestDigest?: string;
  reasonCodes: readonly KnowledgeReasonCode[];
}

type ReadCursorState = {
  assetType: string;
  assetId: string;
  relationType: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipId: string;
};

function scopeWhere(scope: ArchitectureScopeRef) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

async function responseBudget(tx: Prisma.TransactionClient, request: KnowledgeReadRequest) {
  const row = await getActivePolicyOverlay(tx, request.architectureScope, request.knowledgeProfile);
  return row ? composeKnowledgeReadinessPolicy(row.overlay as never).responseBudget : enterpriseMinimumPolicy.responseBudget;
}

function boundedPageSize(requested: number | undefined, budget: { assets: number; relationships: number }): number {
  const value = requested ?? 100;
  return Math.max(1, Math.min(Math.floor(value), 200, budget.assets, budget.relationships));
}

function assetSelectorWhere(selectors: readonly KnowledgeSelector[]): Prisma.AssetSearchProjectionWhereInput {
  if (!selectors.length) return {};
  return {
    OR: selectors.map((selector) => ({
      ...(selector.assetTypes?.length ? { assetType: { in: selector.assetTypes } } : {}),
      ...(selector.assetIds?.length ? { assetId: { in: selector.assetIds } } : {})
    }))
  };
}

function relationSelectorWhere(selectors: readonly KnowledgeSelector[]): Prisma.RelationshipCurrentWhereInput {
  if (!selectors.length) return {};
  return {
    OR: selectors.map((selector) => ({
      ...(selector.relationshipTypes?.length ? { relationType: { in: selector.relationshipTypes } } : {}),
      ...((selector.assetIds?.length || selector.assetTypes?.length) ? {
        OR: [
          ...(selector.assetIds?.length ? [{ sourceNode: { rootAssetId: { in: selector.assetIds } } }, { targetNode: { rootAssetId: { in: selector.assetIds } } }] : []),
          ...(selector.assetTypes?.length ? [{ sourceNode: { rootAssetType: { in: selector.assetTypes } } }, { targetNode: { rootAssetType: { in: selector.assetTypes } } }] : [])
        ]
      } : {})
    }))
  };
}

function afterAssets(state: ReadCursorState | undefined): Prisma.AssetSearchProjectionWhereInput {
  if (!state || state.assetType === NONE) return {};
  return {
    OR: [
      { assetType: { gt: state.assetType } },
      { assetType: state.assetType, assetId: { gt: state.assetId } }
    ]
  };
}

function afterRelationships(state: ReadCursorState | undefined): Prisma.RelationshipCurrentWhereInput {
  if (!state || state.relationType === NONE) return {};
  return {
    OR: [
      { relationType: { gt: state.relationType } },
      { relationType: state.relationType, sourceNodeId: { gt: state.sourceNodeId } },
      { relationType: state.relationType, sourceNodeId: state.sourceNodeId, targetNodeId: { gt: state.targetNodeId } },
      { relationType: state.relationType, sourceNodeId: state.sourceNodeId, targetNodeId: state.targetNodeId, dbId: { gt: state.relationshipId } }
    ]
  };
}

function cursorSecret(): string {
  return process.env.SPECFORGE_KNOWLEDGE_CURSOR_SECRET
    ?? process.env.SPECFORGE_READ_CURSOR_SECRET
    ?? "specforge-local-read-cursor-secret";
}

function readCursorBinding(request: KnowledgeReadRequest, caller: ScopedPrincipal, readiness: KnowledgeReadinessResult): ReadCursorBinding {
  return {
    subject: caller.subject,
    architectureScope: request.architectureScope,
    locale: request.locale,
    queryDigest: boundQueryDigest(request, readiness),
    catalogVersion: readiness.catalogVersion,
    projectionVersion: PROJECTION_VERSION,
    grantDigest: readiness.grantDigest,
    receiptId: readiness.receiptId,
    profileId: readiness.profileId,
    waterlineDigest: readiness.waterlineDigest
  };
}

function boundQueryDigest(request: KnowledgeReadRequest, readiness: KnowledgeReadinessResult): string {
  return contentDigest({
    request: knowledgeQueryDigest(request),
    selectorDigest: readiness.selectorDigest,
    policyVersion: readiness.policyVersion
  });
}

function parseCursor(request: KnowledgeReadRequest, caller: ScopedPrincipal, readiness: KnowledgeReadinessResult): ReadCursorState | undefined {
  if (!request.cursor) return undefined;
  if (!request.receiptId || request.receiptId !== readiness.receiptId) throw new ReadCursorError("CURSOR_INVALID");
  const payload = decodeReadCursor(request.cursor, readCursorBinding(request, caller, readiness), cursorSecret());
  if (payload.orderKey.length !== 6 || payload.orderKey.some((part) => typeof part !== "string")) throw new ReadCursorError("CURSOR_INVALID");
  const [assetType, assetId, relationType, sourceNodeId, targetNodeId, relationshipId] = payload.orderKey as string[];
  if (!assetType || !assetId || !relationType || !sourceNodeId || !targetNodeId || !relationshipId) throw new ReadCursorError("CURSOR_INVALID");
  return { assetType, assetId, relationType, sourceNodeId, targetNodeId, relationshipId };
}

function trustEnvelope(readiness: KnowledgeReadinessResult) {
  return {
    receiptId: readiness.receiptId,
    profileId: readiness.profileId,
    trustStatus: readiness.trustStatus,
    selectorDigest: readiness.selectorDigest,
    architectureScope: readiness.architectureScope,
    asOf: readiness.asOf,
    validUntil: readiness.validUntil,
    policyVersion: readiness.policyVersion,
    catalogVersion: readiness.catalogVersion,
    waterlineDigest: readiness.waterlineDigest,
    grantDigest: readiness.grantDigest
  };
}

function denied(readiness?: KnowledgeReadinessResult, reasonCodes: readonly KnowledgeReasonCode[] = ["KNOWLEDGE_RECEIPT_STALE"]): SystemKnowledgeReadResult {
  return {
    accessDecision: "DENY",
    trustStatus: readiness?.trustStatus ?? "BLOCKED",
    ...(readiness?.receiptId ? { receiptId: readiness.receiptId, trustEnvelope: trustEnvelope(readiness), asOf: readiness.asOf } : {}),
    assets: [],
    relationships: [],
    responseCompleteness: "COMPLETE",
    reasonCodes,
    remediationActions: readiness?.remediationActions ?? []
  };
}

export async function readSystemKnowledge(
  client: PrismaClient = prisma,
  request: KnowledgeReadRequest,
  caller: ScopedPrincipal,
  now = new Date()
): Promise<SystemKnowledgeReadResult> {
  const startedAt = Date.now();
  return client.$transaction(async (tx) => {
    let readiness: KnowledgeReadinessResult;
    try {
      readiness = request.receiptId
        ? await revalidateReceipt(tx, request.receiptId, request, caller, now)
        : await evaluateScopedKnowledgeReadiness(tx, request, caller, now);
    } catch (error) {
      if (error instanceof ReadCursorError || error instanceof Error && error.message === "KNOWLEDGE_RECEIPT_STALE") return denied();
      throw error;
    }
    if (readiness.accessDecision !== "ALLOW") return denied(readiness, readiness.reasonCodes);

    let cursor: ReadCursorState | undefined;
    try {
      cursor = parseCursor(request, caller, readiness);
    } catch (error) {
      if (error instanceof ReadCursorError) return denied(readiness);
      throw error;
    }

    const budget = await responseBudget(tx, request);
    const pageSize = boundedPageSize(request.pageSize, budget);
    const selectors = request.selectors;
    const assetRows = await tx.assetSearchProjection.findMany({
      where: { ...scopeWhere(request.architectureScope), ...assetSelectorWhere(selectors), ...afterAssets(cursor) },
      orderBy: [{ assetType: "asc" }, { assetId: "asc" }],
      take: pageSize + 1
    });

    const enterprise = await tx.assetNode.findFirst({ where: scopeWhere(request.architectureScope), orderBy: { dbId: "asc" }, select: { enterpriseId: true } });
    const relationshipRows = enterprise ? await tx.relationshipCurrent.findMany({
      where: { enterpriseId: enterprise.enterpriseId, ...scopeWhere(request.architectureScope), lifecycleStatus: "ACTIVE", validTo: null, ...relationSelectorWhere(selectors), ...afterRelationships(cursor) },
      include: {
        sourceNode: { select: { nodeType: true, rootAssetType: true, rootAssetId: true, logicalId: true } },
        targetNode: { select: { nodeType: true, rootAssetType: true, rootAssetId: true, logicalId: true } }
      },
      orderBy: [{ relationType: "asc" }, { sourceNodeId: "asc" }, { targetNodeId: "asc" }, { dbId: "asc" }],
      take: pageSize + 1
    }) : [];

    const hasMoreAssets = assetRows.length > pageSize;
    const hasMoreRelationships = relationshipRows.length > pageSize;
    const assets = assetRows.slice(0, pageSize).map((row): SystemKnowledgeAsset => ({
      id: row.assetId,
      type: row.assetType,
      name: request.locale === "zh" && row.localizedNameZh ? row.localizedNameZh : row.canonicalName,
      summary: request.locale === "zh" && row.localizedSummaryZh ? row.localizedSummaryZh : row.canonicalSummary,
      ...(row.domainId ? { domainId: row.domainId } : {}),
      ...(row.status ? { status: row.status } : {}),
      updatedAt: row.updatedAt.toISOString(),
      contentDigest: row.contentDigest,
      architectureScope: request.architectureScope
    }));
    const relationships = relationshipRows.slice(0, pageSize).map((row): SystemKnowledgeRelationship => ({
      id: row.dbId,
      sourceType: row.sourceNode.rootAssetType || row.sourceNode.nodeType,
      sourceId: row.sourceNode.rootAssetId || row.sourceNode.logicalId,
      targetType: row.targetNode.rootAssetType || row.targetNode.nodeType,
      targetId: row.targetNode.rootAssetId || row.targetNode.logicalId,
      relationType: row.relationType,
      confidence: row.confidence,
      architectureScope: request.architectureScope
    }));

    const responseBytes = Buffer.byteLength(JSON.stringify({ assets, relationships }), "utf8");
    const elapsedMilliseconds = Date.now() - startedAt;
    const responseBudgetExceeded = assets.length > budget.assets || relationships.length > budget.relationships || responseBytes > budget.bytes || elapsedMilliseconds > budget.executionMilliseconds;
    if (responseBudgetExceeded) return denied({ ...readiness, reasonCodes: ["KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED"] }, ["KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED"]);

    const partial = hasMoreAssets || hasMoreRelationships;
    const lastAsset = assets.at(-1);
    const lastRelationship = relationshipRows.at(Math.min(relationshipRows.length, pageSize) - 1);
    const nextCursor = partial ? encodeReadCursor({
      version: 1,
      subject: caller.subject,
      architectureScope: request.architectureScope,
      locale: request.locale,
      queryDigest: boundQueryDigest(request, readiness),
      catalogVersion: readiness.catalogVersion,
      projectionVersion: PROJECTION_VERSION,
      grantDigest: readiness.grantDigest,
      receiptId: readiness.receiptId,
      profileId: readiness.profileId,
      waterlineDigest: readiness.waterlineDigest,
      orderKey: [
        lastAsset?.type ?? NONE,
        lastAsset?.id ?? NONE,
        lastRelationship?.relationType ?? NONE,
        lastRelationship?.sourceNodeId ?? NONE,
        lastRelationship?.targetNodeId ?? NONE,
        lastRelationship?.dbId ?? NONE
      ]
    }, cursorSecret()) : undefined;

    return {
      accessDecision: "ALLOW",
      trustStatus: readiness.trustStatus,
      receiptId: readiness.receiptId,
      trustEnvelope: trustEnvelope(readiness),
      assets,
      relationships,
      responseCompleteness: partial ? "PARTIAL" : "COMPLETE",
      ...(nextCursor ? { nextCursor } : {}),
      reasonCodes: readiness.reasonCodes,
      remediationActions: readiness.remediationActions,
      asOf: readiness.asOf
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readSystemKnowledgeSnapshot(
  client: PrismaClient = prisma,
  request: KnowledgeReadRequest,
  caller: ScopedPrincipal,
  now = new Date()
): Promise<SystemKnowledgeSnapshotResult> {
  if (!request.receiptId) {
    return { accessDecision: "DENY", assets: [], proposals: [], contextPacks: [], assetLinks: [], reasonCodes: ["KNOWLEDGE_RECEIPT_STALE"] };
  }

  const summary = await readSystemKnowledge(client, request, caller, now);
  if (summary.accessDecision !== "ALLOW" || !summary.receiptId) {
    return { accessDecision: "DENY", assets: [], proposals: [], contextPacks: [], assetLinks: [], reasonCodes: summary.reasonCodes };
  }

  const pageSize = Math.max(1, Math.min(request.pageSize ?? 100, 200));
  const scope = scopeWhere(request.architectureScope);
  const [assetRows, proposalRows, contextPackRows, linkRows] = await Promise.all([
    client.designAsset.findMany({ where: scope, orderBy: [{ type: "asc" }, { id: "asc" }], take: pageSize + 1 }),
    client.proposal.findMany({ where: scope, orderBy: { id: "asc" }, take: pageSize + 1 }),
    client.contextPack.findMany({ where: scope, orderBy: { id: "asc" }, take: pageSize + 1 }),
    client.assetLink.findMany({ where: scope, orderBy: { id: "asc" }, take: pageSize + 1 })
  ]);
  if ([assetRows, proposalRows, contextPackRows, linkRows].some((rows) => rows.length > pageSize)) {
    return { accessDecision: "DENY", receiptId: summary.receiptId, assets: [], proposals: [], contextPacks: [], assetLinks: [], reasonCodes: ["KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED"] };
  }

  const parsePayload = (payload: string | null) => payload ? JSON.parse(payload) as Record<string, unknown> : {};
  const assets = assetRows.map((row) => ({ id: row.id, type: row.type, payload: parsePayload(row.payload), contentDigest: contentDigest(parsePayload(row.payload)), architectureScope: request.architectureScope }));
  const proposals = proposalRows.map((row) => ({ id: row.id, payload: parsePayload(row.payload), contentDigest: contentDigest(parsePayload(row.payload)), architectureScope: request.architectureScope }));
  const contextPacks = contextPackRows.map((row) => ({ id: row.id, payload: parsePayload(row.payload), contentDigest: contentDigest(parsePayload(row.payload)), architectureScope: request.architectureScope }));
  const assetLinks = linkRows.map((row) => ({ id: row.id, sourceType: row.sourceType, sourceId: row.sourceId, targetType: row.targetType, targetId: row.targetId, relationType: row.relationType, ...(row.description ? { description: row.description } : {}), architectureScope: request.architectureScope }));
  const manifestDigest = contentDigest({ assets, proposals, contextPacks, assetLinks });
  return { accessDecision: "ALLOW", receiptId: summary.receiptId, assets, proposals, contextPacks, assetLinks, manifestDigest, reasonCodes: summary.reasonCodes };
}
