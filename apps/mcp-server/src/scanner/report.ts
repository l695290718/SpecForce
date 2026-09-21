import type { ArchitectureScopeRef } from "@specforge/core";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";
import { isBlockingCoverageGap } from "./finalization";

const SCAN_REPORT_CURSOR_VERSION = 1 as const;
const FINALIZED_SCAN_STATUSES = new Set(["READY_FOR_ANALYSIS", "BLOCKED", "PUBLISHED"]);
const DEFAULT_PAGE_SIZE = 100;
const MAX_SUMMARY_PAGE_SIZE = 500;
const MAX_PAYLOAD_PAGE_SIZE = 50;

export interface ScanReportCursorPayload {
  version: typeof SCAN_REPORT_CURSOR_VERSION;
  architectureScope: ArchitectureScopeRef;
  actorId: string;
  sessionId: string;
  lastObservationId: string;
  includePayload: boolean;
}

export type ScanReportCursorBinding = Omit<ScanReportCursorPayload, "version" | "lastObservationId">;

export interface GetKnowledgeScanReportInput {
  architectureScope: ArchitectureScopeRef;
  sessionId: string;
  cursor?: string;
  pageSize?: number;
  includePayload?: boolean;
  /** @deprecated Use pageSize. Retained for existing MCP clients. */
  limit?: number;
}

export function remediationForScanIssue(issue: string): { issue: string; action: string } {
  if (issue.startsWith("COVERAGE_GAP:")) return { issue, action: "Inspect the referenced path and provide a supported extractor or an evidence-backed Scope exclusion, then start a new scan session." };
  if (issue.startsWith("REQUIRED_EXTRACTOR_MISSING:")) return { issue, action: "Install or authorize the signed scanner release that covers the detected framework and retry the scan." };
  if (issue.startsWith("EXTRACTOR_FAILED:")) return { issue, action: "Inspect the bounded extractor evidence, repair the parser input or release, and retry without promoting partial results." };
  if (issue.startsWith("SCAN_RESUME_CONTEXT_MISMATCH:")) return { issue, action: "Discard the incompatible local spool and start a new session from the unchanged repository snapshot and current policy receipt." };
  if (issue === "COVERAGE_PLAN_INCOMPLETE") return { issue, action: "Complete every planned extractor or record a governed NOT_APPLICABLE result before finalization." };
  return { issue, action: "Review the exact-Scope scan evidence and resolve the blocker before semantic candidate submission." };
}

export async function getKnowledgeScanReport(input: GetKnowledgeScanReportInput) {
  const actor = writableActor();
  const scope = resolveWritableScope(actor, input.architectureScope);
  if (!input.sessionId?.trim()) throw new Error("SCAN_SESSION_ID_REQUIRED");
  const includePayload = input.includePayload === true;
  const pageSize = normalizeScanReportPageSize(input.pageSize ?? input.limit, includePayload);
  await ensureMcpPersistenceSchema();
  const session = await prisma.knowledgeScanSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.sessionId } } });
  if (!session) throw new Error("SCAN_SESSION_NOT_FOUND");
  if (session.actorId !== actor.actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
  if (!FINALIZED_SCAN_STATUSES.has(session.status)) throw new Error("SCAN_REPORT_NOT_FINALIZED");
  const cursor = input.cursor
    ? decodeScanReportCursor(input.cursor, { architectureScope: scope, actorId: actor.actorId, sessionId: session.id, includePayload })
    : undefined;
  const observationPrefix = `source:${session.id}:`;
  if (cursor && !cursor.lastObservationId.startsWith(observationPrefix)) throw new Error("SCAN_REPORT_CURSOR_INVALID");
  const rows = await prisma.sourceObservation.findMany({
    where: { ...scope, id: { startsWith: observationPrefix, ...(cursor ? { gt: cursor.lastObservationId } : {}) } },
    select: { id: true, externalAssetType: true, normalizedDigest: true, payload: true, observedAt: true },
    orderBy: [{ id: "asc" }],
    take: pageSize + 1
  });
  const pageRows = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  const nextCursor = hasMore && pageRows.length > 0
    ? encodeScanReportCursor({
      version: SCAN_REPORT_CURSOR_VERSION,
      architectureScope: scope,
      actorId: actor.actorId,
      sessionId: session.id,
      lastObservationId: pageRows[pageRows.length - 1]!.id,
      includePayload
    })
    : undefined;
  const finalization = jsonRecord(session.finalizationManifest);
  const coverage = jsonRecord(finalization.coverage);
  const plan = jsonRecord(finalization.coveragePlan);
  const capabilityIssues = Array.isArray(plan.capabilities)
    ? plan.capabilities.flatMap((value) => {
      const capability = jsonRecord(value);
      if (capability.required !== true || capability.state !== "UNSUPPORTED") return [];
      const reasons = Array.isArray(capability.reasonCodes) && capability.reasonCodes.length > 0 ? capability.reasonCodes : ["REQUIRED_CAPABILITY_UNSUPPORTED"];
      return reasons.map((reason) => `${reason}:${String(capability.framework ?? "unknown")}:${String(capability.assetFamily ?? "unknown")}`);
    })
    : [];
  const issues = [...new Set([
    ...(Array.isArray(coverage.coverageGaps) ? coverage.coverageGaps.filter((value): value is string => typeof value === "string" && isBlockingCoverageGap(value)).map((value) => `COVERAGE_GAP:${value}`) : []),
    ...capabilityIssues,
    ...(session.blockedReason ? session.blockedReason.split("; ").filter(Boolean) : [])
  ])].sort();
  return {
    ...scope,
    sessionId: session.id,
    status: session.status,
    observationCount: session.observationCount,
    coverage: { ...coverage, truncated: hasMore },
    coveragePlan: plan,
    policyReceipt: jsonRecord(jsonRecord(session.evidencePolicy).policyReceipt),
    observations: pageRows.map((row) => ({
      id: row.id,
      observationType: row.externalAssetType,
      normalizedDigest: row.normalizedDigest,
      ...scanObservationView(row.payload, includePayload),
      observedAt: row.observedAt.toISOString()
    })),
    page: { pageSize, returnedCount: pageRows.length, hasMore, nextCursor },
    blockingIssues: issues,
    remediation: issues.map(remediationForScanIssue)
  };
}

export function normalizeScanReportPageSize(requested: number | undefined, includePayload: boolean): number {
  const maximum = includePayload ? MAX_PAYLOAD_PAGE_SIZE : MAX_SUMMARY_PAGE_SIZE;
  const value = requested ?? DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(Math.floor(value), maximum));
}

export function encodeScanReportCursor(payload: ScanReportCursorPayload, secret = scanReportCursorSecret()): string {
  assertCursorPayload(payload);
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signCursor(body, secret)}`;
}

export function decodeScanReportCursor(token: string, expected: ScanReportCursorBinding, secret = scanReportCursorSecret()): ScanReportCursorPayload {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error();
    const [body, signature] = parts;
    if (!body || !signature || !/^[A-Za-z0-9_-]+$/u.test(body) || !/^[A-Za-z0-9_-]+$/u.test(signature)) throw new Error();
    const expectedSignature = signCursor(body, secret);
    const signatureBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) throw new Error();
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
    assertCursorPayload(payload);
    if (payload.actorId !== expected.actorId
      || payload.sessionId !== expected.sessionId
      || payload.includePayload !== expected.includePayload
      || payload.architectureScope.applicationServiceId !== expected.architectureScope.applicationServiceId
      || payload.architectureScope.scopePath !== expected.architectureScope.scopePath) throw new Error();
    return payload;
  } catch {
    throw new Error("SCAN_REPORT_CURSOR_INVALID");
  }
}

export function scanObservationView(payload: unknown, includePayload: boolean): Record<string, unknown> {
  if (!includePayload) return { source: sourceSummary(payload) };
  const value = jsonRecord(payload);
  const approvedFields = [
    "observationType",
    "architectureLayer",
    "aspectHint",
    "repository",
    "source",
    "parser",
    "payload",
    "sensitivity",
    "redaction",
    "evidenceRefs",
    "normalizedDigest",
    "warnings",
    "coverageGaps"
  ] as const;
  return Object.fromEntries(approvedFields.flatMap((field) => value[field] === undefined ? [] : [[field, value[field]]]));
}

function sourceSummary(payload: unknown): Record<string, unknown> {
  const value = jsonRecord(payload);
  const source = jsonRecord(value.source);
  return { path: source.path ?? null, symbol: source.symbol ?? null, lineStart: source.lineStart ?? null, lineEnd: source.lineEnd ?? null };
}

function scanReportCursorSecret(): string {
  return process.env.SPECFORGE_KNOWLEDGE_CURSOR_SECRET
    ?? process.env.SPECFORGE_READ_CURSOR_SECRET
    ?? "specforge-local-read-cursor-secret";
}

function signCursor(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function assertCursorPayload(value: unknown): asserts value is ScanReportCursorPayload {
  if (!isRecord(value)
    || value.version !== SCAN_REPORT_CURSOR_VERSION
    || !isScope(value.architectureScope)
    || typeof value.actorId !== "string" || !value.actorId
    || typeof value.sessionId !== "string" || !value.sessionId
    || typeof value.lastObservationId !== "string" || !value.lastObservationId
    || typeof value.includePayload !== "boolean") throw new Error("SCAN_REPORT_CURSOR_INVALID");
}

function isScope(value: unknown): value is ArchitectureScopeRef {
  return isRecord(value)
    && typeof value.applicationServiceId === "string" && Boolean(value.applicationServiceId)
    && typeof value.scopePath === "string" && Boolean(value.scopePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
