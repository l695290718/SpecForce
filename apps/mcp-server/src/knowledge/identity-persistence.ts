import {
  contentDigest,
  evaluateReviewBundle,
  matchIdentity,
  normalizeAssetType,
  reviewBundleDigest,
  type ArchitectureScopeRef,
  type IdentityCandidate,
  type IdentityMatchTarget,
  type ReviewBundle,
  type ReviewCoverage,
  type ScanObservation
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";

export interface MatchKnowledgeIdentitiesInput {
  scanReportId: string;
  architectureScope: ArchitectureScopeRef;
}

export interface MatchKnowledgeIdentitiesResult {
  scanReportId: string;
  reportDigest: string;
  identityCandidateIds: string[];
  decisions: Record<"UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS", number>;
  reviewBundle: ReviewBundle;
}

export async function matchKnowledgeIdentities(input: MatchKnowledgeIdentitiesInput): Promise<MatchKnowledgeIdentitiesResult> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (!input.scanReportId) throw new Error("SCAN_REPORT_IDENTITY_REQUIRED");
  await ensureMcpPersistenceSchema();

  const report = await prisma.knowledgeScanReport.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.scanReportId } } });
  if (!report) throw new Error("SCAN_REPORT_NOT_FOUND");
  const bundleId = `knowledge-review:${report.reportDigest}`;
  const bundle = await prisma.knowledgeReviewBundle.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: bundleId } } });
  if (!bundle) throw new Error("REVIEW_BUNDLE_NOT_FOUND");
  if (["APPROVED", "REJECTED"].includes(bundle.status)) throw new Error("REVIEW_BUNDLE_NOT_OPEN");

  const observationIds = (report.observationIds as string[] | undefined) ?? [];
  const [observationRows, assertionRows, targetRows] = await Promise.all([
    prisma.sourceObservation.findMany({ where: { ...scope, id: { in: observationIds } }, orderBy: [{ externalId: "asc" }, { id: "asc" }] }),
    prisma.knowledgeAssertion.findMany({ where: { ...scope, id: { in: bundle.assertionIds as string[] } } }),
    prisma.designAsset.findMany({ where: scope, orderBy: [{ type: "asc" }, { id: "asc" }] })
  ]);
  if (observationRows.length !== observationIds.length) throw new Error("SCAN_OBSERVATIONS_NOT_PERSISTED");

  const targets: IdentityMatchTarget[] = targetRows.map((row) => ({
    type: normalizeAssetType(row.type),
    id: row.id,
    name: row.name,
    code: row.code ?? undefined,
    payload: parsePayload(row.payload)
  }));
  const assertionsByObservation = new Map<string, { semanticIdentity?: string }>();
  for (const assertion of assertionRows) {
    for (const sourceObservationId of assertion.sourceObservationIds as string[]) assertionsByObservation.set(sourceObservationId, { semanticIdentity: assertion.semanticIdentity });
  }

  const matches = observationRows.map((row) => {
    const observation: ScanObservation = {
      id: row.id,
      observationType: normalizeObservationType(row.externalAssetType),
      sourcePath: row.externalId,
      payload: row.payload as Record<string, unknown>,
      normalizedDigest: row.normalizedDigest
    };
    const result = matchIdentity({ observation: { ...observation, semanticIdentity: assertionsByObservation.get(row.id)?.semanticIdentity }, targets });
    return { observation, result, candidates: result.matches.length > 0 ? result.matches.map((match) => candidateFromMatch(match, row.id, assertionsByObservation.get(row.id)?.semanticIdentity, scope, report.reportDigest)) : [unmatchedCandidate(row.id, observation, result.targetAssetTypes[0] ?? "unresolved", assertionsByObservation.get(row.id)?.semanticIdentity, scope, report.reportDigest)] };
  });
  const candidateSpecs = matches.flatMap((item) => item.candidates).sort((left, right) => left.id.localeCompare(right.id));
  const identityCandidateIds = candidateSpecs.map((candidate) => candidate.id);
  const decisions = matches.reduce<Record<"UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS", number>>((counts, item) => {
    counts[item.result.decision] += 1;
    return counts;
  }, { UNMATCHED: 0, UNAMBIGUOUS: 0, AMBIGUOUS: 0 });
  const identityIssues = matches.flatMap((item) => item.result.decision === "UNAMBIGUOUS" ? [] : [`IDENTITY_${item.result.decision}:${item.observation.sourcePath}`]);
  const blockingIssues = [...new Set([...(bundle.blockingIssues as string[]), ...identityIssues])];
  const evidenceRefs = [...new Set([...(bundle.evidenceRefs as string[]), `identity-matching:deterministic-v1`, `scan-report:${report.reportDigest}`])];
  const coverage = bundle.coverage as unknown as ReviewCoverage;
  const status = evaluateReviewBundle(coverage, blockingIssues);
  const digest = reviewBundleDigest({ architectureScope: scope, designChangeSessionId: report.designChangeSessionId, riskTier: bundle.riskTier as ReviewBundle["riskTier"], assertionIds: bundle.assertionIds as string[], identityCandidateIds, architectureFactRevisionIds: [], evidenceRefs, coverage, blockingIssues });
  const now = new Date();

  const updatedBundle = await prisma.$transaction(async (transaction) => {
    const session = await transaction.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: report.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (["BLOCKED", "CLOSED"].includes(session.status)) throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");
    for (const candidate of candidateSpecs) {
      const existing = await transaction.identityCandidate.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: candidate.id } } });
      if (existing && existing.decision !== "UNDECIDED") throw new Error("IDENTITY_CANDIDATE_ALREADY_DECIDED");
      await transaction.identityCandidate.upsert({
        where: { applicationServiceId_scopePath_id: { ...scope, id: candidate.id } },
        create: candidateRow(candidate, scope, now),
        update: candidateRowUpdate(candidate, now)
      });
    }
    const updated = await transaction.knowledgeReviewBundle.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: bundleId } }, data: { status, identityCandidateIds, evidenceRefs, blockingIssues, digest } });
    await transaction.designChangeSession.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: report.designChangeSessionId } }, data: { status: status === "READY" ? "WAITING_FOR_REVIEW" : "CONFLICTED" } });
    await transaction.federationOutbox.upsert({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: `identity-candidates:${report.reportDigest}` } }, create: { ...scope, eventType: "KNOWLEDGE_IDENTITY_CANDIDATES_GENERATED", payload: jsonValue({ scanReportId: report.id, reportDigest: report.reportDigest, identityCandidateIds, decisions, blockingIssues: identityIssues }), idempotencyKey: `identity-candidates:${report.reportDigest}`, status: "PENDING", designChangeSessionId: report.designChangeSessionId }, update: {} });
    return updated;
  });

  return { scanReportId: report.id, reportDigest: report.reportDigest, identityCandidateIds, decisions, reviewBundle: reviewBundleFromRow(updatedBundle) };
}

function candidateFromMatch(match: { targetAssetType: string; targetAssetId: string; confidence: number; matchingEvidence: string[]; counterEvidence: string[] }, sourceObservationId: string, semanticIdentity: string | undefined, scope: ArchitectureScopeRef, reportDigest: string): IdentityCandidate {
  const id = identityCandidateId(scope, reportDigest, sourceObservationId, match.targetAssetType, match.targetAssetId);
  return {
    id,
    semanticIdentity: semanticIdentity ?? `source:${sourceObservationId}`,
    sourceObservationId,
    targetAssetType: match.targetAssetType,
    targetAssetId: match.targetAssetId,
    architectureScope: scope,
    confidence: match.confidence,
    matchingEvidence: match.matchingEvidence,
    counterEvidence: match.counterEvidence,
    decision: "UNDECIDED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function unmatchedCandidate(sourceObservationId: string, observation: ScanObservation, targetAssetType: string, semanticIdentity: string | undefined, scope: ArchitectureScopeRef, reportDigest: string): IdentityCandidate {
  const id = identityCandidateId(scope, reportDigest, sourceObservationId, targetAssetType);
  return {
    id,
    semanticIdentity: semanticIdentity ?? `source:${sourceObservationId}`,
    sourceObservationId,
    targetAssetType,
    architectureScope: scope,
    confidence: 0,
    matchingEvidence: [`source-path:${observation.sourcePath}`],
    counterEvidence: ["No existing design asset matched within the authorized Scope."],
    decision: "UNDECIDED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function identityCandidateId(scope: ArchitectureScopeRef, reportDigest: string, sourceObservationId: string, targetAssetType: string, targetAssetId?: string): string {
  return `identity:${reportDigest}:${contentDigest({ scope, reportDigest, sourceObservationId, targetAssetType, targetAssetId: targetAssetId ?? null }).slice(0, 32)}`;
}

function candidateRow(candidate: IdentityCandidate, scope: ArchitectureScopeRef, now: Date) {
  return { ...scope, id: candidate.id, semanticIdentity: candidate.semanticIdentity, sourceObservationId: candidate.sourceObservationId, targetAssetType: candidate.targetAssetType, targetAssetId: candidate.targetAssetId ?? null, confidence: candidate.confidence, matchingEvidence: jsonValue(candidate.matchingEvidence), counterEvidence: jsonValue(candidate.counterEvidence), decision: candidate.decision, reviewedBy: null, reviewedAt: null, createdAt: now, updatedAt: now };
}

function candidateRowUpdate(candidate: IdentityCandidate, now: Date) {
  return { semanticIdentity: candidate.semanticIdentity, sourceObservationId: candidate.sourceObservationId, targetAssetType: candidate.targetAssetType, targetAssetId: candidate.targetAssetId ?? null, confidence: candidate.confidence, matchingEvidence: jsonValue(candidate.matchingEvidence), counterEvidence: jsonValue(candidate.counterEvidence), decision: candidate.decision, reviewedBy: null, reviewedAt: null, updatedAt: now };
}

function reviewBundleFromRow(row: any): ReviewBundle {
  return { id: row.id, designChangeSessionId: row.designChangeSessionId, status: row.status, riskTier: row.riskTier, assertionIds: row.assertionIds as string[], identityCandidateIds: row.identityCandidateIds as string[], architectureFactRevisionIds: (row.architectureFactRevisionIds ?? []) as string[], evidenceRefs: row.evidenceRefs as string[], coverage: row.coverage as ReviewCoverage, blockingIssues: row.blockingIssues as string[], digest: row.digest, createdBy: row.createdBy, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeObservationType(value: string): ScanObservation["observationType"] {
  const types: ScanObservation["observationType"][] = ["source-file", "system-component", "api-contract", "event-contract", "data-model", "documentation"];
  return types.includes(value as ScanObservation["observationType"]) ? value as ScanObservation["observationType"] : "source-file";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
