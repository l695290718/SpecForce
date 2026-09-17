import {
  classifyCandidateRisk,
  contentDigest,
  evaluateReviewBundle,
  hasBilingualCandidateContent,
  type ArchitectureScopeRef,
  type KnowledgeAssertion,
  type ReviewBundle,
  type SemanticCandidateBatch,
  type SemanticCandidateBatchReceipt,
  type SemanticCandidateSubmission
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";
import { createKnowledgeReviewBundle } from "./persistence";
import { assessReviewCandidates } from "./risk-policy";

export const SEMANTIC_CANDIDATE_BATCH_LIMITS = Object.freeze({ maxCandidates: 100, maxBytes: 1024 * 1024 });
const semanticBatchEvent = "KNOWLEDGE_SEMANTIC_CANDIDATE_BATCH_ACCEPTED";

export interface SubmitSemanticCandidateBatchInput {
  architectureScope: ArchitectureScopeRef;
  batch: SemanticCandidateBatch;
}

export interface AssembleKnowledgeReviewBundleInput {
  architectureScope: ArchitectureScopeRef;
  sessionId: string;
}

export function semanticBatchDigest(batch: SemanticCandidateBatch): string {
  return contentDigest(batch);
}

export function semanticCandidateId(sessionId: string, candidate: Pick<SemanticCandidateSubmission, "semanticIdentity" | "normalizedDigest">): string {
  return `knowledge:${sessionId}:${contentDigest({ semanticIdentity: candidate.semanticIdentity, normalizedDigest: candidate.normalizedDigest })}`;
}

export function validateSemanticCandidateBatch(batch: SemanticCandidateBatch): void {
  if (!batch.sessionId?.trim()) throw new Error("SEMANTIC_CANDIDATE_BATCH_SESSION_REQUIRED");
  if (!Number.isInteger(batch.sequence) || batch.sequence < 0) throw new Error("SEMANTIC_CANDIDATE_BATCH_SEQUENCE_INVALID");
  if (!Array.isArray(batch.candidates) || batch.candidates.length === 0) throw new Error("SEMANTIC_CANDIDATE_BATCH_EMPTY");
  if (batch.candidates.length > SEMANTIC_CANDIDATE_BATCH_LIMITS.maxCandidates) throw new Error("SEMANTIC_CANDIDATE_BATCH_LIMIT_EXCEEDED");
  if (Buffer.byteLength(JSON.stringify(batch), "utf8") > SEMANTIC_CANDIDATE_BATCH_LIMITS.maxBytes) throw new Error("SEMANTIC_CANDIDATE_BATCH_BYTES_EXCEEDED");
  if (!batch.provenance?.agent?.trim()) throw new Error("SEMANTIC_CANDIDATE_PROVENANCE_REQUIRED");
  for (const candidate of batch.candidates) validateCandidateShape(candidate);
}

export async function submitSemanticCandidateBatch(input: SubmitSemanticCandidateBatchInput): Promise<SemanticCandidateBatchReceipt> {
  validateSemanticCandidateBatch(input.batch);
  const actor = writableActor();
  const assertedScope = resolveWritableScope(actor, input.architectureScope);
  await ensureMcpPersistenceSchema();
  const session = await findSession(input.batch.sessionId);
  assertSessionAccess(session, assertedScope, actor.actorId);
  const batchDigest = semanticBatchDigest(input.batch);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `semantic-candidates:${session.applicationServiceId}:${session.scopePath}:${session.id}`);
    const idempotencyKey = semanticBatchIdempotencyKey(session.id, input.batch.sequence);
    const existing = await tx.federationOutbox.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...assertedScope, idempotencyKey } } });
    if (existing) return identicalRetry(existing.payload, batchDigest);

    const acceptedEvents = await tx.federationOutbox.findMany({ where: { ...assertedScope, eventType: semanticBatchEvent, designChangeSessionId: session.designChangeSessionId }, orderBy: { createdAt: "asc" } });
    if (acceptedEvents.some((event) => jsonRecord(event.payload).complete === true)) throw new Error("SEMANTIC_CANDIDATE_BATCH_ALREADY_FINALIZED");
    const checkpoint = semanticCheckpoint(acceptedEvents.map((event) => event.payload));
    if (input.batch.sequence !== checkpoint.acceptedSequence + 1) throw new Error("SEMANTIC_CANDIDATE_BATCH_SEQUENCE_GAP");
    if ((input.batch.previousBatchDigest ?? undefined) !== (checkpoint.acceptedBatchDigest ?? undefined)) throw new Error("SEMANTIC_CANDIDATE_BATCH_CHAIN_MISMATCH");

    const sourceObservationIds = [...new Set(input.batch.candidates.flatMap((candidate) => candidate.sourceObservationIds))];
    const observations = await tx.sourceObservation.findMany({
      where: {
        ...assertedScope,
        connectorId: session.connectorId,
        sourceNamespace: "knowledge-scan-v2",
        id: { in: sourceObservationIds },
        payload: { path: ["scanSessionId"], equals: session.id }
      },
      select: { id: true, normalizedDigest: true, payload: true }
    });
    if (observations.length !== sourceObservationIds.length) throw new Error("SEMANTIC_CANDIDATE_OBSERVATION_SCOPE_MISMATCH");
    if (observations.some((observation) => jsonRecord(observation.payload).scanSessionId !== session.id)) throw new Error("SEMANTIC_CANDIDATE_OBSERVATION_SESSION_MISMATCH");

    const now = new Date();
    const assertionIds: string[] = [];
    for (const candidate of input.batch.candidates) {
      const assertion = candidateAssertion(session, assertedScope, input.batch, candidate, actor.actorId, now);
      const existingAssertion = await tx.knowledgeAssertion.findUnique({ where: { applicationServiceId_scopePath_id: { ...assertedScope, id: assertion.id } } });
      if (existingAssertion) {
        if (existingAssertion.status === "ACCEPTED") throw new Error("SEMANTIC_CANDIDATE_REWRITE_ACCEPTED");
        if (readCandidateDigest(existingAssertion.value) !== readCandidateDigest(assertion.value)) throw new Error("SEMANTIC_CANDIDATE_IDEMPOTENCY_CONFLICT");
      } else {
        await tx.knowledgeAssertion.upsert({
          where: { applicationServiceId_scopePath_id: { ...assertedScope, id: assertion.id } },
          create: assertionRow(assertion),
          update: assertionRowUpdate(assertion)
        });
      }
      assertionIds.push(assertion.id);
    }

    const receipt: SemanticCandidateBatchReceipt = {
      sessionId: session.id,
      acceptedSequence: input.batch.sequence,
      acceptedBatchDigest: batchDigest,
      assertionIds,
      idempotent: false,
      complete: input.batch.complete
    };
    await tx.federationOutbox.create({
      data: {
        ...assertedScope,
        eventType: semanticBatchEvent,
        payload: jsonValue({ batchDigest, sequence: input.batch.sequence, complete: input.batch.complete, receipt }),
        idempotencyKey,
        status: "PENDING",
        designChangeSessionId: session.designChangeSessionId
      }
    });
    return receipt;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assembleKnowledgeReviewBundle(input: AssembleKnowledgeReviewBundleInput): Promise<ReviewBundle> {
  const actor = writableActor();
  const assertedScope = resolveWritableScope(actor, input.architectureScope);
  await ensureMcpPersistenceSchema();
  const session = await findSession(input.sessionId);
  assertSessionAccess(session, assertedScope, actor.actorId);
  const events = await prisma.federationOutbox.findMany({ where: { ...assertedScope, eventType: semanticBatchEvent, designChangeSessionId: session.designChangeSessionId }, orderBy: { createdAt: "asc" } });
  const payloads = events.map((event) => jsonRecord(event.payload));
  const assertionIds = [...new Set(payloads.flatMap((payload) => receiptFromPayload(payload)?.assertionIds ?? []))];
  const rows = await prisma.knowledgeAssertion.findMany({ where: { ...assertedScope, id: { in: assertionIds } }, orderBy: { id: "asc" } });
  if (rows.length !== assertionIds.length) throw new Error("SEMANTIC_CANDIDATE_ASSERTION_SCOPE_MISMATCH");
  const assertions = rows.map(assertionFromRow);
  const assessment = assessReviewCandidates(assertions);
  const processedSources = new Set(assertions.flatMap((assertion) => assertion.sourceObservationIds)).size;
  const completeSignal = payloads.some((payload) => payload.complete === true);
  const coverage = {
    totalSources: session.observationCount,
    processedSources,
    supportedSources: processedSources,
    candidateCount: assertions.length,
    complete: completeSignal && processedSources === session.observationCount
  };
  const blockingIssues = [...assessment.blockingIssues];
  if (!completeSignal) blockingIssues.push("SEMANTIC_CANDIDATE_BATCH_NOT_FINALIZED");
  if (processedSources !== session.observationCount) blockingIssues.push("SEMANTIC_CANDIDATE_COVERAGE_INCOMPLETE");
  const status = evaluateReviewBundle(coverage, blockingIssues);
  const sourceObservationIds = [...new Set(assertions.flatMap((assertion) => assertion.sourceObservationIds))];
  const identityRows = await prisma.identityCandidate.findMany({ where: { ...assertedScope, sourceObservationId: { in: sourceObservationIds } }, select: { id: true } });
  const evidenceRefs = [...new Set([
    ...assertions.flatMap((assertion) => assertion.evidenceRefs),
    ...payloads.map((payload) => typeof payload.batchDigest === "string" ? `semantic-batch:${payload.batchDigest}` : "").filter(Boolean)
  ])];
  const reviewBundle = await createKnowledgeReviewBundle({
    id: `knowledge-review:${session.id}`,
    designChangeSessionId: session.designChangeSessionId,
    architectureScope: assertedScope,
    riskTier: assessment.riskTier,
    assertionIds,
    identityCandidateIds: identityRows.map((row) => row.id),
    evidenceRefs,
    coverage,
    blockingIssues
  });
  if (reviewBundle.status !== status) throw new Error("REVIEW_BUNDLE_STATUS_DERIVATION_MISMATCH");
  return reviewBundle;
}

function candidateAssertion(session: ScanSessionRow, scope: ArchitectureScopeRef, batch: SemanticCandidateBatch, candidate: SemanticCandidateSubmission, actorId: string, now: Date): KnowledgeAssertion {
  const candidateDigest = contentDigest(candidate);
  const sourceEvidence = candidate.sourceObservationIds.map((id) => `source-observation:${id}`);
  const value = {
    ...candidate.value,
    review: {
      identityDecision: candidate.identityDecision,
      normalizedDigest: candidate.normalizedDigest,
      candidateDigest,
      agentEvidenceComplete: candidate.evidenceRefs.length > 0
    },
    agentProvenance: { ...batch.provenance, actorId, sessionId: session.id, batchSequence: batch.sequence }
  };
  return {
    id: semanticCandidateId(session.id, candidate),
    semanticIdentity: candidate.semanticIdentity,
    factType: candidate.factType,
    layer: candidate.layer,
    aspect: candidate.aspect,
    value,
    architectureScope: scope,
    status: "CANDIDATE",
    confidence: candidate.confidence,
    matchingEvidence: [...new Set([...candidate.matchingEvidence, ...sourceEvidence])],
    counterEvidence: [...new Set(candidate.counterEvidence)],
    unresolvedQuestions: [...new Set(candidate.unresolvedQuestions)],
    evidenceRefs: [...new Set([...candidate.evidenceRefs, ...sourceEvidence])],
    sourceObservationIds: [...new Set(candidate.sourceObservationIds)],
    extractorId: `agent:${batch.provenance.agent}`,
    riskTier: classifyCandidateRisk(candidate),
    domainCluster: candidate.domainCluster,
    generatedByActorId: actorId,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function assertionRow(assertion: KnowledgeAssertion) {
  return {
    ...assertion.architectureScope,
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
    riskTier: assertion.riskTier ?? "T1",
    domainCluster: assertion.domainCluster ?? null,
    generatedByActorId: assertion.generatedByActorId ?? null,
    revision: assertion.revision,
    changeSetId: assertion.changeSetId ?? null,
    createdAt: new Date(assertion.createdAt),
    updatedAt: new Date(assertion.updatedAt)
  };
}

function assertionRowUpdate(assertion: KnowledgeAssertion) {
  const { applicationServiceId: _applicationServiceId, scopePath: _scopePath, id: _id, createdAt: _createdAt, ...update } = assertionRow(assertion);
  return update;
}

function assertionFromRow(row: any): KnowledgeAssertion {
  return {
    id: row.id,
    semanticIdentity: row.semanticIdentity,
    factType: row.factType,
    layer: row.layer,
    aspect: row.aspect,
    value: row.value as Record<string, unknown>,
    status: row.status,
    confidence: row.confidence,
    matchingEvidence: row.matchingEvidence as string[],
    counterEvidence: row.counterEvidence as string[],
    unresolvedQuestions: row.unresolvedQuestions as string[],
    evidenceRefs: row.evidenceRefs as string[],
    sourceObservationIds: row.sourceObservationIds as string[],
    extractorId: row.extractorId,
    riskTier: row.riskTier,
    domainCluster: row.domainCluster ?? undefined,
    generatedByActorId: row.generatedByActorId ?? undefined,
    revision: row.revision,
    changeSetId: row.changeSetId ?? undefined,
    architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function validateCandidateShape(candidate: SemanticCandidateSubmission): void {
  if (!candidate.semanticIdentity?.trim() || !candidate.normalizedDigest?.trim() || !candidate.factType?.trim() || !candidate.domainCluster?.trim()) throw new Error("SEMANTIC_CANDIDATE_IDENTITY_REQUIRED");
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) throw new Error("SEMANTIC_CANDIDATE_CONFIDENCE_INVALID");
  if (!Array.isArray(candidate.sourceObservationIds) || candidate.sourceObservationIds.length === 0) throw new Error("SEMANTIC_CANDIDATE_SOURCE_REQUIRED");
  if (!candidate.value || typeof candidate.value !== "object" || Array.isArray(candidate.value)) throw new Error("SEMANTIC_CANDIDATE_VALUE_REQUIRED");
  if (!hasBilingualCandidateContent(candidate.value)) throw new Error("SEMANTIC_CANDIDATE_BILINGUAL_CONTENT_REQUIRED");
}

async function findSession(sessionId: string): Promise<ScanSessionRow> {
  const matches = await prisma.knowledgeScanSession.findMany({ where: { id: sessionId }, take: 2 });
  if (matches.length === 0) throw new Error("SCAN_SESSION_NOT_FOUND");
  if (matches.length > 1) throw new Error("SCAN_SESSION_ID_AMBIGUOUS");
  return matches[0] as ScanSessionRow;
}

function assertSessionAccess(session: ScanSessionRow, scope: ArchitectureScopeRef, actorId: string): void {
  if (session.applicationServiceId !== scope.applicationServiceId || session.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  if (session.actorId !== actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
  if (session.status !== "READY_FOR_ANALYSIS") throw new Error("SCAN_SESSION_NOT_READY_FOR_ANALYSIS");
}

function semanticCheckpoint(payloads: readonly Prisma.JsonValue[]): { acceptedSequence: number; acceptedBatchDigest?: string } {
  return payloads.reduce<{ acceptedSequence: number; acceptedBatchDigest?: string }>((checkpoint, payload) => {
    const record = jsonRecord(payload);
    return typeof record.sequence === "number" && record.sequence > checkpoint.acceptedSequence
      ? { acceptedSequence: record.sequence, acceptedBatchDigest: typeof record.batchDigest === "string" ? record.batchDigest : undefined }
      : checkpoint;
  }, { acceptedSequence: -1 });
}

function identicalRetry(payload: Prisma.JsonValue, batchDigest: string): SemanticCandidateBatchReceipt {
  const record = jsonRecord(payload);
  if (record.batchDigest !== batchDigest) throw new Error("SEMANTIC_CANDIDATE_BATCH_IDEMPOTENCY_CONFLICT");
  const receipt = receiptFromPayload(record);
  if (!receipt) throw new Error("SEMANTIC_CANDIDATE_BATCH_RECEIPT_INVALID");
  return { ...receipt, idempotent: true };
}

function receiptFromPayload(payload: Record<string, unknown>): SemanticCandidateBatchReceipt | undefined {
  const receipt = jsonRecord(payload.receipt);
  if (typeof receipt.sessionId !== "string" || typeof receipt.acceptedSequence !== "number" || typeof receipt.acceptedBatchDigest !== "string" || !Array.isArray(receipt.assertionIds)) return undefined;
  return {
    sessionId: receipt.sessionId,
    acceptedSequence: receipt.acceptedSequence,
    acceptedBatchDigest: receipt.acceptedBatchDigest,
    assertionIds: receipt.assertionIds.filter((id): id is string => typeof id === "string"),
    idempotent: receipt.idempotent === true,
    complete: receipt.complete === true
  };
}

function readCandidateDigest(value: unknown): string | undefined {
  const review = jsonRecord(jsonRecord(value).review);
  return typeof review.candidateDigest === "string" ? review.candidateDigest : undefined;
}

function semanticBatchIdempotencyKey(sessionId: string, sequence: number): string {
  return `semantic-candidate-batch:${sessionId}:${sequence}`;
}

function jsonRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface ScanSessionRow {
  dbId: string;
  id: string;
  applicationServiceId: string;
  scopePath: string;
  actorId: string;
  connectorId: string;
  designChangeSessionId: string;
  status: string;
  observationCount: number;
}
