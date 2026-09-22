import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { contentDigest, type ArchitectureScopeRef, type ScopedPrincipal } from "@specforge/core";
import { currentRequestPrincipal } from "../auth";
import { ensureMcpPersistenceSchema, prisma, readableScope } from "../persistence";
import { revalidateReceipt, type KnowledgeReadRequest } from "../knowledge-readiness/service";

export const REVIEW_QUEUE_PURPOSE = "independent-semantic-review" as const;
export const REVIEW_QUEUE_PROFILE = "DESIGN_CATALOG_CURATION" as const;
export const REVIEW_QUEUE_MAX_RESPONSE_BYTES = 256 * 1024;
const CURSOR_VERSION = 1 as const;
const CURSOR_KEY_VERSION = "review-queue-v1" as const;
const CURSOR_TTL_MS = 15 * 60 * 1000;

export type ReviewQueueProjection = "BUNDLES" | "CANDIDATES";
export type ReviewFreshness = "CURRENT" | "STALE" | "BLOCKED";

export interface ReadKnowledgeReviewQueueInput {
  architectureScope: ArchitectureScopeRef;
  readinessReceiptId: string;
  scanSessionId: string;
  projection: ReviewQueueProjection;
  cursor?: string;
  pageSize?: number;
  riskTier?: "T0" | "T1" | "T2" | "T3";
  bundleStatus?: "DRAFT" | "READY" | "BLOCKED" | "APPROVED" | "REJECTED";
  reviewBundleId?: string;
}

interface QueueCursorPayload {
  version: typeof CURSOR_VERSION;
  keyVersion: typeof CURSOR_KEY_VERSION;
  issuedAt: string;
  expiresAt: string;
  architectureScope: ArchitectureScopeRef;
  actorId: string;
  readinessReceiptId: string;
  queueReceiptId: string;
  scanSessionId: string;
  projection: ReviewQueueProjection;
  filterDigest: string;
  reviewSetDigest: string;
  pageSize: number;
  orderKey: string[];
}

type QueueCursorBinding = Omit<QueueCursorPayload, "version" | "keyVersion" | "issuedAt" | "expiresAt" | "orderKey" | "queueReceiptId"> & { queueReceiptId?: string };

interface QueueFilter {
  riskTier?: string;
  bundleStatus?: string;
  reviewBundleId?: string;
}

interface BundleSummary {
  reviewBundleId: string;
  status: string;
  riskTier: string;
  coverage: Record<string, unknown>;
  blockingIssues: string[];
  evidenceCount: number;
  candidateCount: number;
  identityCandidateCount: number;
  architectureFactCount: number;
  decision: "APPROVE" | "REJECT" | "UNDECIDED";
  decisionActorId?: string;
}

interface CandidateProjection {
  reviewBundleId: string;
  assertionId: string;
  semanticIdentity: string;
  factType: string;
  layer: string;
  aspect: string;
  status: string;
  confidence: number;
  riskTier?: string;
  domainCluster?: string;
  identityDecision: string;
  unresolvedQuestions: string[];
  evidenceCount: number;
  sourceObservationCount: number;
  contentDigest: string;
  canonicalContent: Record<string, string>;
  localizedContentZh: Record<string, string>;
}

function jsonRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function jsonStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scopeWhere(scope: ArchitectureScopeRef) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

function normalizeFilter(input: ReadKnowledgeReviewQueueInput): QueueFilter {
  return {
    ...(input.riskTier ? { riskTier: input.riskTier } : {}),
    ...(input.bundleStatus ? { bundleStatus: input.bundleStatus } : {}),
    ...(input.reviewBundleId ? { reviewBundleId: input.reviewBundleId } : {})
  };
}

export function reviewQueuePageLimit(projection: ReviewQueueProjection, value: number | undefined): number {
  const maximum = projection === "BUNDLES" ? 100 : 50;
  const defaultSize = projection === "BUNDLES" ? 50 : 25;
  if (value === undefined) return defaultSize;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error("REVIEW_QUEUE_PAGE_SIZE_INVALID");
  return value;
}

function cursorSecret(): string {
  return process.env.SPECFORGE_REVIEW_QUEUE_CURSOR_SECRET
    ?? process.env.SPECFORGE_KNOWLEDGE_CURSOR_SECRET
    ?? process.env.SPECFORGE_READ_CURSOR_SECRET
    ?? "specforge-local-read-cursor-secret";
}

function sign(body: string): string {
  return createHmac("sha256", cursorSecret()).update(body).digest("base64url");
}

function encodeQueueCursor(payload: QueueCursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeQueueCursor(token: string, expected: QueueCursorBinding): QueueCursorPayload {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature || !safeEqual(signature, sign(body))) throw new Error("invalid cursor");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QueueCursorPayload;
    if (payload.version !== CURSOR_VERSION || payload.keyVersion !== CURSOR_KEY_VERSION || Date.parse(payload.expiresAt) <= Date.now()) throw new Error("expired cursor");
    const actualBinding = {
      architectureScope: payload.architectureScope,
      actorId: payload.actorId,
      readinessReceiptId: payload.readinessReceiptId,
      scanSessionId: payload.scanSessionId,
      projection: payload.projection,
      filterDigest: payload.filterDigest,
      reviewSetDigest: payload.reviewSetDigest,
      pageSize: payload.pageSize
    };
    const expectedBinding = {
      architectureScope: expected.architectureScope,
      actorId: expected.actorId,
      readinessReceiptId: expected.readinessReceiptId,
      scanSessionId: expected.scanSessionId,
      projection: expected.projection,
      filterDigest: expected.filterDigest,
      reviewSetDigest: expected.reviewSetDigest,
      pageSize: expected.pageSize
    };
    if (contentDigest(actualBinding) !== contentDigest(expectedBinding)) throw new Error("cursor binding mismatch");
    if (!Array.isArray(payload.orderKey) || payload.orderKey.some((item) => typeof item !== "string" || !item)) throw new Error("cursor order invalid");
    return payload;
  } catch (error) {
    throw new Error("REVIEW_QUEUE_CURSOR_INVALID");
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function clampText(value: unknown, maxBytes: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (Buffer.byteLength(trimmed, "utf8") <= maxBytes) return trimmed;
  let result = trimmed;
  while (Buffer.byteLength(result, "utf8") > maxBytes - 3) result = result.slice(0, -1);
  return `${result}...`;
}

function allowedContent(value: unknown): Record<string, string> {
  const source = jsonRecord(value);
  const output: Record<string, string> = {};
  for (const key of ["name", "title", "summary", "description"]) {
    const text = clampText(source[key], 4096);
    if (text) output[key] = text;
  }
  return output;
}

export function projectReviewQueueCandidate(row: any, reviewBundleId: string): CandidateProjection {
  const value = jsonRecord(row.value);
  const review = jsonRecord(value.review);
  const canonical = value.canonicalContent ?? value.summary;
  const localized = jsonRecord(value.localizedContent).zh ?? jsonRecord(value.summary).zh;
  const digest = typeof review.candidateDigest === "string" ? review.candidateDigest : contentDigest(value);
  const unresolvedQuestions = jsonStrings(row.unresolvedQuestions).slice(0, 20).map((item) => clampText(item, 512) ?? "");
  return {
    reviewBundleId,
    assertionId: row.id,
    semanticIdentity: row.semanticIdentity,
    factType: row.factType,
    layer: row.layer,
    aspect: row.aspect,
    status: row.status,
    confidence: row.confidence,
    ...(row.riskTier ? { riskTier: row.riskTier } : {}),
    ...(row.domainCluster ? { domainCluster: row.domainCluster } : {}),
    identityDecision: typeof review.identityDecision === "string" ? review.identityDecision : "UNMATCHED",
    unresolvedQuestions,
    evidenceCount: jsonStrings(row.evidenceRefs).length,
    sourceObservationCount: jsonStrings(row.sourceObservationIds).length,
    contentDigest: digest,
    canonicalContent: allowedContent(canonical),
    localizedContentZh: allowedContent(localized)
  };
}

function decisionFor(bundleId: string, decisions: any[]) {
  return decisions.find((decision) => decision.reviewBundleId === bundleId);
}

function bundleSummary(row: any, decisions: any[]): BundleSummary {
  const decision = decisionFor(row.id, decisions);
  return {
    reviewBundleId: row.id,
    status: row.status,
    riskTier: row.riskTier,
    coverage: jsonRecord(row.coverage),
    blockingIssues: jsonStrings(row.blockingIssues).slice(0, 20).map((item) => clampText(item, 512) ?? ""),
    evidenceCount: jsonStrings(row.evidenceRefs).length,
    candidateCount: jsonStrings(row.assertionIds).length,
    identityCandidateCount: jsonStrings(row.identityCandidateIds).length,
    architectureFactCount: jsonStrings(row.architectureFactRevisionIds).length,
    decision: decision?.decision ?? "UNDECIDED",
    ...(decision?.actorId ? { decisionActorId: decision.actorId } : {})
  };
}

function completeness(bundles: any[], decisions: any[]) {
  const summaries = bundles.map((bundle) => bundleSummary(bundle, decisions));
  const byRiskTier = Object.fromEntries(["T0", "T1", "T2", "T3"].map((tier) => [tier, summaries.filter((item) => item.riskTier === tier).length]));
  const byStatus = Object.fromEntries(["DRAFT", "READY", "BLOCKED", "APPROVED", "REJECTED"].map((status) => [status, summaries.filter((item) => item.status === status).length]));
  const decided = summaries.filter((item) => item.decision !== "UNDECIDED");
  const approved = summaries.filter((item) => item.decision === "APPROVE");
  return {
    expectedBundleCount: summaries.length,
    expectedBundleIdsDigest: contentDigest(summaries.map((item) => item.reviewBundleId).sort()),
    candidateCount: bundles.reduce((total, bundle) => total + jsonStrings(bundle.assertionIds).length, 0),
    countsByRiskTier: byRiskTier,
    countsByStatus: byStatus,
    decidedBundleCount: decided.length,
    undecidedBundleCount: summaries.length - decided.length,
    blockedBundleCount: summaries.filter((item) => item.status === "BLOCKED").length,
    approvedBundleCount: approved.length,
    rejectedBundleCount: summaries.filter((item) => item.decision === "REJECT").length,
    allRequiredBundlesDecided: summaries.length > 0 && decided.length === summaries.length,
    aggregatePromotionEligible: summaries.length > 0 && approved.length === summaries.length && summaries.every((item) => item.status === "APPROVED")
  };
}

function snapshotDigest(session: any, events: any[], bundles: any[], decisions: any[]): string {
  return contentDigest({
    scanSessionId: session.id,
    finalizationDigest: session.finalizationDigest,
    semanticBatchDigests: events.map((event) => jsonRecord(event.payload).batchDigest).filter((value): value is string => typeof value === "string").sort(),
    bundles: bundles.map((bundle) => ({ id: bundle.id, digest: bundle.digest })).sort((a, b) => a.id.localeCompare(b.id)),
    decisions: decisions.map((decision) => ({ id: decision.id, digest: contentDigest(decision) })).sort((a, b) => a.id.localeCompare(b.id))
  });
}

function filterBundles(bundles: any[], filter: QueueFilter): any[] {
  return bundles.filter((bundle) =>
    (!filter.riskTier || bundle.riskTier === filter.riskTier)
    && (!filter.bundleStatus || bundle.status === filter.bundleStatus)
    && (!filter.reviewBundleId || bundle.id === filter.reviewBundleId)
  );
}

function cursorBinding(input: ReadKnowledgeReviewQueueInput, actor: ScopedPrincipal, queueReceiptId: string, reviewSetDigest: string, filterDigest: string, pageSize: number) {
  return {
    architectureScope: input.architectureScope,
    actorId: actor.actorId,
    readinessReceiptId: input.readinessReceiptId,
    queueReceiptId,
    scanSessionId: input.scanSessionId,
    projection: input.projection,
    filterDigest,
    reviewSetDigest,
    pageSize
  } as const;
}

export async function readKnowledgeReviewQueue(input: ReadKnowledgeReviewQueueInput): Promise<Record<string, unknown>> {
  const actor = currentRequestPrincipal();
  if (!actor) throw new Error("REVIEW_QUEUE_ACCESS_DENIED");
  const resolvedScope = readableScope(input.architectureScope.applicationServiceId);
  if (resolvedScope.scopePath !== input.architectureScope.scopePath) throw new Error("REVIEW_QUEUE_ACCESS_DENIED");
  const pageSize = reviewQueuePageLimit(input.projection, input.pageSize);
  const filter = normalizeFilter(input);
  const filterDigest = contentDigest(filter);
  const now = new Date();
  const readinessRequest: KnowledgeReadRequest = {
    architectureScope: resolvedScope,
    knowledgeProfile: REVIEW_QUEUE_PROFILE,
    selectors: [{ assetIds: [input.scanSessionId] }],
    purpose: REVIEW_QUEUE_PURPOSE,
    locale: "en",
    receiptId: input.readinessReceiptId,
    pageSize: 1
  };
  let readiness;
  try {
    readiness = await revalidateReceipt(prisma, input.readinessReceiptId, readinessRequest, actor, now);
  } catch {
    throw new Error("REVIEW_QUEUE_READINESS_INVALID");
  }
  if (readiness.accessDecision !== "ALLOW" || readiness.profileId !== REVIEW_QUEUE_PROFILE) throw new Error("REVIEW_QUEUE_READINESS_REQUIRED");
  await ensureMcpPersistenceSchema();

  return prisma.$transaction(async (tx) => {
    const session = await tx.knowledgeScanSession.findFirst({ where: { ...scopeWhere(resolvedScope), id: input.scanSessionId } });
    if (!session || !session.finalizationDigest || !["READY_FOR_ANALYSIS", "BLOCKED", "PUBLISHED"].includes(session.status)) throw new Error("REVIEW_QUEUE_SESSION_NOT_FINALIZED");
    const [events, bundles, decisions] = await Promise.all([
      tx.federationOutbox.findMany({ where: { ...scopeWhere(resolvedScope), eventType: "KNOWLEDGE_SEMANTIC_CANDIDATE_BATCH_ACCEPTED", designChangeSessionId: session.designChangeSessionId }, orderBy: { createdAt: "asc" } }),
      tx.knowledgeReviewBundle.findMany({ where: { ...scopeWhere(resolvedScope), designChangeSessionId: session.designChangeSessionId }, orderBy: { id: "asc" } }),
      tx.knowledgePromotionDecision.findMany({ where: { ...scopeWhere(resolvedScope), designChangeSessionId: session.designChangeSessionId }, orderBy: { id: "asc" } })
    ]);
    if (!bundles.length) throw new Error("REVIEW_QUEUE_DISCLOSURE_BLOCKED");
    const reviewSetDigest = snapshotDigest(session, events, bundles, decisions);
    const globalCompleteness = completeness(bundles, decisions);
    const expected = cursorBinding(input, actor, "", reviewSetDigest, filterDigest, pageSize);
    let queueReceiptId: string;
    let after: string[] | undefined;
    if (input.cursor) {
      const decoded = decodeQueueCursor(input.cursor, expected);
      queueReceiptId = decoded.queueReceiptId;
      after = decoded.orderKey;
      const receipt = await tx.knowledgeReviewQueueReceipt.findFirst({ where: { ...scopeWhere(resolvedScope), id: queueReceiptId, actorId: actor.actorId } });
      if (!receipt || receipt.expiresAt <= now || receipt.reviewSetDigest !== reviewSetDigest) throw new Error("REVIEW_QUEUE_SNAPSHOT_STALE");
    } else {
      queueReceiptId = `review-queue-receipt:${randomUUID()}`;
      await tx.knowledgeReviewQueueReceipt.create({
        data: {
          ...scopeWhere(resolvedScope),
          id: queueReceiptId,
          actorId: actor.actorId,
          readinessReceiptId: input.readinessReceiptId,
          scanSessionId: input.scanSessionId,
          projection: input.projection,
          filterDigest,
          reviewSetDigest,
          expectedBundleIdsDigest: globalCompleteness.expectedBundleIdsDigest,
          pageSize,
          exposure: { projection: input.projection, filter, globalCompleteness } as unknown as Prisma.InputJsonValue,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + CURSOR_TTL_MS)
        }
      });
    }

    const selectedBundles = filterBundles(bundles, filter);
    let page: unknown[];
    let lastKey: string[] | undefined;
    if (input.projection === "BUNDLES") {
      const afterBundleId = after?.[0];
      const rows = selectedBundles.map((bundle) => bundleSummary(bundle, decisions)).filter((row) => !afterBundleId || row.reviewBundleId > afterBundleId).slice(0, pageSize + 1);
      const hasMore = rows.length > pageSize;
      page = rows.slice(0, pageSize);
      const last = page.at(-1) as BundleSummary | undefined;
      if (hasMore && last) lastKey = [last.reviewBundleId];
    } else {
      const assertionIds = [...new Set(selectedBundles.flatMap((bundle) => jsonStrings(bundle.assertionIds)))];
      const assertionRows = await tx.knowledgeAssertion.findMany({ where: { ...scopeWhere(resolvedScope), id: { in: assertionIds } }, orderBy: { id: "asc" } });
      const bundleByAssertion = new Map<string, string>();
      for (const bundle of selectedBundles) for (const assertionId of jsonStrings(bundle.assertionIds)) bundleByAssertion.set(assertionId, bundle.id);
      const afterBundleId = after?.[0];
      const afterAssertionId = after?.[1];
      const rows = assertionRows.map((row) => projectReviewQueueCandidate(row, bundleByAssertion.get(row.id) ?? ""))
        .filter((row) => row.reviewBundleId)
        .sort((a, b) => a.reviewBundleId.localeCompare(b.reviewBundleId) || a.assertionId.localeCompare(b.assertionId))
        .filter((row) => !afterBundleId || row.reviewBundleId > afterBundleId || (row.reviewBundleId === afterBundleId && Boolean(afterAssertionId) && row.assertionId > (afterAssertionId ?? "")))
        .slice(0, pageSize + 1);
      const hasMore = rows.length > pageSize;
      page = rows.slice(0, pageSize);
      const last = page.at(-1) as CandidateProjection | undefined;
      if (hasMore && last) lastKey = [last.reviewBundleId, last.assertionId];
    }
    const response: Record<string, unknown> = {
      reviewQueueReceiptId: queueReceiptId,
      readinessReceiptId: input.readinessReceiptId,
      architectureScope: resolvedScope,
      scanSessionId: input.scanSessionId,
      projection: input.projection,
      filters: filter,
      actorId: actor.actorId,
      reviewSetDigest,
      expectedBundleIdsDigest: globalCompleteness.expectedBundleIdsDigest,
      reviewFreshness: (session.status === "BLOCKED" ? "BLOCKED" : "CURRENT") satisfies ReviewFreshness,
      responseCompleteness: lastKey ? "PARTIAL" : "COMPLETE",
      page,
      globalCompleteness,
      asOf: now.toISOString()
    };
    if (lastKey) response.nextCursor = encodeQueueCursor({
      version: CURSOR_VERSION,
      keyVersion: CURSOR_KEY_VERSION,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CURSOR_TTL_MS).toISOString(),
      ...cursorBinding(input, actor, queueReceiptId, reviewSetDigest, filterDigest, pageSize),
      orderKey: lastKey
    });
    if (Buffer.byteLength(JSON.stringify(response), "utf8") > REVIEW_QUEUE_MAX_RESPONSE_BYTES) throw new Error("REVIEW_QUEUE_DISCLOSURE_BLOCKED");
    return response;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
