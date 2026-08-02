import {
  evaluateReviewBundle,
  generateSemanticCandidates,
  reviewBundleDigest,
  validateKnowledgeAssertion,
  genericSystemAnalysisProfile,
  type ArchitectureScopeRef,
  type KnowledgeAssertion,
  type ReviewBundle,
  type ScanObservation,
  type SemanticCandidateDraft
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";

export interface GenerateKnowledgeCandidatesInput {
  scanReportId: string;
  architectureScope: ArchitectureScopeRef;
  provider?: string;
}

export interface GenerateKnowledgeCandidatesResult {
  scanReportId: string;
  reportDigest: string;
  provider: string;
  mocked: boolean;
  assertionIds: string[];
  identityCandidateIds: string[];
  reviewBundle: ReviewBundle;
}

export async function generateKnowledgeCandidates(input: GenerateKnowledgeCandidatesInput): Promise<GenerateKnowledgeCandidatesResult> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (!input.scanReportId) throw new Error("SCAN_REPORT_IDENTITY_REQUIRED");
  await ensureMcpPersistenceSchema();

  const report = await prisma.knowledgeScanReport.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.scanReportId } } });
  if (!report) throw new Error("SCAN_REPORT_NOT_FOUND");
  const reviewBundleId = `knowledge-review:${report.reportDigest}`;
  const existingBundle = await prisma.knowledgeReviewBundle.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: reviewBundleId } } });
  if (existingBundle) {
    return {
      scanReportId: report.id,
      reportDigest: report.reportDigest,
      provider: "idempotent-existing",
      mocked: false,
      assertionIds: existingBundle.assertionIds as string[],
      identityCandidateIds: existingBundle.identityCandidateIds as string[],
      reviewBundle: reviewBundleFromRow(existingBundle)
    };
  }

  const observationIds = (report.observationIds as string[] | undefined) ?? [];
  const coverageReport = report.coverage as { totalFiles: number; indexedFiles: number; complete: boolean };
  const rows = await prisma.sourceObservation.findMany({ where: { ...scope, id: { in: observationIds } }, orderBy: [{ externalId: "asc" }, { id: "asc" }] });
  if (rows.length !== observationIds.length) throw new Error("SCAN_OBSERVATIONS_NOT_PERSISTED");
  const observations: ScanObservation[] = rows.map((row) => ({
    id: row.id,
    observationType: normalizeObservationType(row.externalAssetType),
    sourcePath: row.externalId,
    payload: row.payload as Record<string, unknown>,
    normalizedDigest: row.normalizedDigest
  }));
  const response = await generateSemanticCandidates({ observations, provider: input.provider });
  const observationIdSet = new Set(observationIds);
  const seenObservationIds = new Set<string>();
  const validDrafts = response.content.filter((draft) => {
    if (!isSemanticCandidateDraft(draft, observationIdSet) || seenObservationIds.has(draft.sourceObservationId)) return false;
    seenObservationIds.add(draft.sourceObservationId);
    return true;
  });
  const issues = [
    ...(coverageReport.complete ? [] : ["SCAN_COVERAGE_INCOMPLETE"]),
    ...(validDrafts.length === observations.length ? [] : ["SEMANTIC_CANDIDATE_COVERAGE_INCOMPLETE"])
  ];
  const now = new Date();
  const evidenceRefs = [`scan-report:${report.reportDigest}`, `scanner:${report.scannerId}@${report.scannerVersion}`, `semantic-provider:${response.provider}`];
  const assertionIds = validDrafts.map((draft) => `knowledge:${report.reportDigest}:${draft.sourceObservationId}`);
  const coverage = {
    totalSources: coverageReport.totalFiles,
    processedSources: validDrafts.length,
    supportedSources: coverageReport.indexedFiles,
    candidateCount: validDrafts.length,
    complete: issues.length === 0
  };
  const status = evaluateReviewBundle(coverage, issues);
  const digest = reviewBundleDigest({ architectureScope: scope, designChangeSessionId: report.designChangeSessionId, riskTier: "T1", assertionIds, identityCandidateIds: [], evidenceRefs, coverage, blockingIssues: issues });

  const bundle = await prisma.$transaction(async (transaction) => {
    const session = await transaction.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: report.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (["BLOCKED", "CLOSED"].includes(session.status)) throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");
    for (const [index, draft] of validDrafts.entries()) {
      const assertion = assertionFromDraft(draft, observations.find((observation) => observation.id === draft.sourceObservationId)!, report, scope, evidenceRefs, now, assertionIds[index]!);
      validateKnowledgeAssertion(assertion, genericSystemAnalysisProfile);
      const existing = await transaction.knowledgeAssertion.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: assertion.id } } });
      if (existing?.status === "ACCEPTED") throw new Error("SEMANTIC_CANDIDATE_REWRITE_ACCEPTED");
      await transaction.knowledgeAssertion.upsert({
        where: { applicationServiceId_scopePath_id: { ...scope, id: assertion.id } },
        create: assertionRow(assertion),
        update: assertionRowUpdate(assertion)
      });
    }
    const created = await transaction.knowledgeReviewBundle.create({ data: { ...scope, id: reviewBundleId, designChangeSessionId: report.designChangeSessionId, status, riskTier: "T1", assertionIds, identityCandidateIds: [], evidenceRefs, coverage: jsonValue(coverage), blockingIssues: issues, digest, createdBy: writableActor().actorId } });
    await transaction.designChangeSession.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: report.designChangeSessionId } }, data: { status: status === "READY" ? "WAITING_FOR_REVIEW" : "CONFLICTED" } });
    await transaction.federationOutbox.upsert({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: `semantic-candidates:${report.reportDigest}` } }, create: { ...scope, eventType: "KNOWLEDGE_SEMANTIC_CANDIDATES_GENERATED", payload: jsonValue({ scanReportId: report.id, reportDigest: report.reportDigest, provider: response.provider, assertionIds, blockingIssues: issues }), idempotencyKey: `semantic-candidates:${report.reportDigest}`, status: "PENDING", designChangeSessionId: report.designChangeSessionId }, update: {} });
    return created;
  });

  return { scanReportId: report.id, reportDigest: report.reportDigest, provider: response.provider, mocked: response.usage.mocked, assertionIds, identityCandidateIds: [], reviewBundle: reviewBundleFromRow(bundle) };
}

function assertionFromDraft(draft: SemanticCandidateDraft, observation: ScanObservation, report: any, scope: ArchitectureScopeRef, evidenceRefs: string[], now: Date, id: string): KnowledgeAssertion {
  const sourceObservationRef = `source-observation:${draft.sourceObservationId}`;
  return {
    id,
    semanticIdentity: draft.semanticIdentity,
    factType: draft.factType,
    layer: draft.layer,
    aspect: draft.aspect,
    value: { ...draft.value, sourceObservationId: draft.sourceObservationId, sourcePath: observation.sourcePath, observationType: observation.observationType, reportDigest: report.reportDigest },
    architectureScope: scope,
    status: "CANDIDATE",
    confidence: draft.confidence,
    matchingEvidence: [...new Set([...draft.matchingEvidence, sourceObservationRef])],
    counterEvidence: draft.counterEvidence,
    unresolvedQuestions: draft.unresolvedQuestions,
    evidenceRefs: [...new Set([...evidenceRefs, sourceObservationRef])],
    sourceObservationIds: [draft.sourceObservationId],
    extractorId: `ai:${report.scannerId}:${report.scannerVersion}`,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function assertionRow(assertion: KnowledgeAssertion) {
  return {
    ...assertionScope(assertion),
    id: assertion.id,
    semanticIdentity: assertion.semanticIdentity,
    factType: assertion.factType,
    layer: assertion.layer,
    aspect: assertion.aspect,
    value: jsonValue(assertion.value),
    status: assertion.status,
    confidence: assertion.confidence,
    matchingEvidence: jsonValue(assertion.matchingEvidence),
    counterEvidence: jsonValue(assertion.counterEvidence),
    unresolvedQuestions: jsonValue(assertion.unresolvedQuestions),
    evidenceRefs: jsonValue(assertion.evidenceRefs),
    sourceObservationIds: jsonValue(assertion.sourceObservationIds),
    extractorId: assertion.extractorId,
    revision: assertion.revision,
    changeSetId: null,
    createdAt: new Date(assertion.createdAt),
    updatedAt: new Date(assertion.updatedAt)
  };
}

function assertionRowUpdate(assertion: KnowledgeAssertion) {
  const row = assertionRow(assertion);
  const { applicationServiceId: _applicationServiceId, scopePath: _scopePath, id: _id, createdAt: _createdAt, ...update } = row;
  return update;
}

function assertionScope(assertion: KnowledgeAssertion) {
  return { applicationServiceId: assertion.architectureScope.applicationServiceId, scopePath: assertion.architectureScope.scopePath };
}

function reviewBundleFromRow(row: any): ReviewBundle {
  return { id: row.id, designChangeSessionId: row.designChangeSessionId, status: row.status, riskTier: row.riskTier, assertionIds: row.assertionIds as string[], identityCandidateIds: row.identityCandidateIds as string[], evidenceRefs: row.evidenceRefs as string[], coverage: row.coverage as ReviewBundle["coverage"], blockingIssues: row.blockingIssues as string[], digest: row.digest, createdBy: row.createdBy, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function isSemanticCandidateDraft(value: SemanticCandidateDraft, observationIds: Set<string>): boolean {
  return Boolean(value && observationIds.has(value.sourceObservationId) && value.semanticIdentity && value.factType && ["BIZ", "SYS", "TECH"].includes(value.layer) && ["structure", "behavior", "information", "contract", "constraint"].includes(value.aspect) && value.value && typeof value.value === "object" && !Array.isArray(value.value) && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 && Array.isArray(value.matchingEvidence) && Array.isArray(value.counterEvidence) && Array.isArray(value.unresolvedQuestions));
}

function normalizeObservationType(value: string): ScanObservation["observationType"] {
  const types: ScanObservation["observationType"][] = ["source-file", "system-component", "api-contract", "event-contract", "data-model", "documentation"];
  return types.includes(value as ScanObservation["observationType"]) ? value as ScanObservation["observationType"] : "source-file";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
