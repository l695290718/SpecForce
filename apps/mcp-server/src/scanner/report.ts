import type { ArchitectureScopeRef } from "@specforge/core";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";

export interface GetKnowledgeScanReportInput {
  architectureScope: ArchitectureScopeRef;
  sessionId: string;
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
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  await ensureMcpPersistenceSchema();
  const session = await prisma.knowledgeScanSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.sessionId } } });
  if (!session) throw new Error("SCAN_SESSION_NOT_FOUND");
  if (session.actorId !== actor.actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
  const rows = await prisma.sourceObservation.findMany({
    where: { ...scope, id: { startsWith: `source:${session.id}:` } },
    select: { id: true, externalAssetType: true, normalizedDigest: true, payload: true, observedAt: true },
    orderBy: [{ id: "asc" }],
    take: limit + 1
  });
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
    ...(Array.isArray(coverage.coverageGaps) ? coverage.coverageGaps.filter((value): value is string => typeof value === "string").map((value) => `COVERAGE_GAP:${value}`) : []),
    ...capabilityIssues,
    ...(session.blockedReason ? session.blockedReason.split("; ").filter(Boolean) : [])
  ])].sort();
  return {
    ...scope,
    sessionId: session.id,
    status: session.status,
    observationCount: session.observationCount,
    coverage: { ...coverage, truncated: rows.length > limit },
    coveragePlan: plan,
    policyReceipt: jsonRecord(jsonRecord(session.evidencePolicy).policyReceipt),
    observations: rows.slice(0, limit).map((row) => ({ id: row.id, observationType: row.externalAssetType, normalizedDigest: row.normalizedDigest, source: sourceSummary(row.payload), observedAt: row.observedAt.toISOString() })),
    blockingIssues: issues,
    remediation: issues.map(remediationForScanIssue)
  };
}

function sourceSummary(payload: unknown): Record<string, unknown> {
  const value = jsonRecord(payload);
  const source = jsonRecord(value.source);
  return { path: source.path ?? null, symbol: source.symbol ?? null, lineStart: source.lineStart ?? null, lineEnd: source.lineEnd ?? null };
}

function jsonRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
