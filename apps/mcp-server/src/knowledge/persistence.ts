import { genericSystemAnalysisProfile, assertBaselinePublishable, changeSetDigest, projectionManifestDigest, validateKnowledgeAssertion, type ArchitectureScopeRef, type BaselineManifest, type ChangeSet, type IdentityCandidate, type KnowledgeAssertion, type ProjectionManifest } from "@specforge/core";
import { Prisma } from "@prisma/client";
import { prisma, ensureMcpPersistenceSchema, readableScope, resolveWritableScope, writableActor } from "../persistence";

export interface KnowledgeAssertionInput {
  assertion: KnowledgeAssertion;
  architectureScope: ArchitectureScopeRef;
}

export interface IdentityCandidateInput {
  candidate: IdentityCandidate;
  architectureScope: ArchitectureScopeRef;
}

export interface WorkingStreamInput {
  id: string;
  name: string;
  architectureScope: ArchitectureScopeRef;
}

export interface ChangeSetInput {
  id: string;
  streamId: string;
  architectureScope: ArchitectureScopeRef;
  assetRevisionIds: string[];
  relationshipRevisionIds: string[];
  evidenceRefs: string[];
}

export interface BaselineInput {
  id: string;
  streamId: string;
  changeSetId: string;
  architectureScope: ArchitectureScopeRef;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  reconciliationStatus: "CONVERGED" | "DRIFTED" | "BLOCKED";
}

export interface ProjectionManifestInput {
  id: string;
  baselineId: string;
  architectureScope: ArchitectureScopeRef;
  projectionType: ProjectionManifest["projectionType"];
  projectionSchemaVersion: string;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
}

export async function createKnowledgeAssertion(input: KnowledgeAssertionInput): Promise<KnowledgeAssertion> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const assertion = { ...input.assertion, architectureScope: scope };
  validateKnowledgeAssertion(assertion, genericSystemAnalysisProfile);
  await ensureMcpPersistenceSchema();
  const row = await prisma.knowledgeAssertion.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: assertion.id } },
    create: {
      id: assertion.id,
      semanticIdentity: assertion.semanticIdentity,
      factType: assertion.factType,
      layer: assertion.layer,
      aspect: assertion.aspect,
      value: jsonValue(assertion.value),
      status: assertion.status,
      confidence: assertion.confidence,
      matchingEvidence: assertion.matchingEvidence,
      counterEvidence: assertion.counterEvidence,
      unresolvedQuestions: assertion.unresolvedQuestions,
      evidenceRefs: assertion.evidenceRefs,
      sourceObservationIds: assertion.sourceObservationIds,
      extractorId: assertion.extractorId,
      revision: assertion.revision,
      changeSetId: assertion.changeSetId ?? null,
      ...scope,
      createdAt: new Date(assertion.createdAt),
      updatedAt: new Date(assertion.updatedAt)
    },
    update: {
      semanticIdentity: assertion.semanticIdentity,
      factType: assertion.factType,
      layer: assertion.layer,
      aspect: assertion.aspect,
      value: jsonValue(assertion.value),
      status: assertion.status,
      confidence: assertion.confidence,
      matchingEvidence: assertion.matchingEvidence,
      counterEvidence: assertion.counterEvidence,
      unresolvedQuestions: assertion.unresolvedQuestions,
      evidenceRefs: assertion.evidenceRefs,
      sourceObservationIds: assertion.sourceObservationIds,
      extractorId: assertion.extractorId,
      revision: assertion.revision,
      changeSetId: assertion.changeSetId ?? null,
      updatedAt: new Date(assertion.updatedAt)
    }
  });
  return assertionFromRow(row);
}

export async function createIdentityCandidate(input: IdentityCandidateInput): Promise<IdentityCandidate> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const candidate = { ...input.candidate, architectureScope: scope };
  if (!candidate.id || !candidate.semanticIdentity || !candidate.sourceObservationId || !candidate.targetAssetType) throw new Error("IDENTITY_CANDIDATE_IDENTITY_REQUIRED");
  if (candidate.confidence < 0 || candidate.confidence > 1) throw new Error("IDENTITY_CANDIDATE_CONFIDENCE_INVALID");
  await ensureMcpPersistenceSchema();
  const row = await prisma.identityCandidate.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: candidate.id } },
    create: { ...scope, id: candidate.id, semanticIdentity: candidate.semanticIdentity, sourceObservationId: candidate.sourceObservationId, targetAssetType: candidate.targetAssetType, targetAssetId: candidate.targetAssetId ?? null, confidence: candidate.confidence, matchingEvidence: candidate.matchingEvidence, counterEvidence: candidate.counterEvidence, decision: candidate.decision, reviewedBy: candidate.reviewedBy ?? null, reviewedAt: candidate.reviewedAt ? new Date(candidate.reviewedAt) : null, createdAt: new Date(candidate.createdAt), updatedAt: new Date(candidate.updatedAt) },
    update: { semanticIdentity: candidate.semanticIdentity, sourceObservationId: candidate.sourceObservationId, targetAssetType: candidate.targetAssetType, targetAssetId: candidate.targetAssetId ?? null, confidence: candidate.confidence, matchingEvidence: candidate.matchingEvidence, counterEvidence: candidate.counterEvidence, decision: candidate.decision, reviewedBy: candidate.reviewedBy ?? null, reviewedAt: candidate.reviewedAt ? new Date(candidate.reviewedAt) : null, updatedAt: new Date(candidate.updatedAt) }
  });
  return { ...candidate, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() };
}

export async function createWorkingStream(input: WorkingStreamInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (!input.id || !input.name) throw new Error("WORKING_STREAM_IDENTITY_REQUIRED");
  await ensureMcpPersistenceSchema();
  const row = await prisma.workingStream.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
    create: { ...scope, id: input.id, name: input.name, status: "ACTIVE" },
    update: { name: input.name, status: "ACTIVE" }
  });
  return { id: row.id, name: row.name, status: row.status, headChangeSetId: row.headChangeSetId ?? undefined, architectureScope: scope, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function commitKnowledgeChangeSet(input: ChangeSetInput): Promise<ChangeSet> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const row = await prisma.$transaction(async (transaction) => {
    const stream = await transaction.workingStream.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } } });
    if (!stream) throw new Error("WORKING_STREAM_NOT_FOUND");
    if (stream.status !== "ACTIVE") throw new Error("WORKING_STREAM_NOT_ACTIVE");
    await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `knowledge-changeset:${scope.applicationServiceId}:${scope.scopePath}:${input.streamId}`);
    const existing = await transaction.knowledgeChangeSet.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
    if (existing) return existing;
    const previous = await transaction.knowledgeChangeSet.findFirst({ where: { ...scope, streamId: input.streamId }, orderBy: { sequence: "desc" } });
    const sequence = Number(previous?.sequence ?? 0n) + 1;
    const digest = changeSetDigest({ architectureScope: scope, streamId: input.streamId, sequence, assetRevisionIds: input.assetRevisionIds, relationshipRevisionIds: input.relationshipRevisionIds, evidenceRefs: input.evidenceRefs });
    const changeSet = await transaction.knowledgeChangeSet.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      create: { ...scope, id: input.id, streamId: input.streamId, sequence, status: "COMMITTED", assetRevisionIds: input.assetRevisionIds, relationshipRevisionIds: input.relationshipRevisionIds, evidenceRefs: input.evidenceRefs, digest, committedAt: new Date() },
      update: { status: "COMMITTED", sequence, assetRevisionIds: input.assetRevisionIds, relationshipRevisionIds: input.relationshipRevisionIds, evidenceRefs: input.evidenceRefs, digest, committedAt: new Date() }
    });
    await transaction.workingStream.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } }, data: { headChangeSetId: input.id } });
    return changeSet;
  });
  return changeSetFromRow(row);
}

export async function publishKnowledgeBaseline(input: BaselineInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const manifest: BaselineManifest = { architectureScope: scope, baselineId: input.id, changeSetId: input.changeSetId, sourceRevisionIds: input.sourceRevisionIds, relationshipVersion: input.relationshipVersion, publishedAt: new Date().toISOString() };
  assertBaselinePublishable({ status: "PUBLISHED", manifest }, input.reconciliationStatus);
  await ensureMcpPersistenceSchema();
  const row = await prisma.$transaction(async (transaction) => {
    const changeSet = await transaction.knowledgeChangeSet.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.changeSetId } } });
    if (!changeSet || changeSet.streamId !== input.streamId || changeSet.status !== "COMMITTED") throw new Error("CHANGESET_NOT_COMMITTED");
    await transaction.knowledgeBaseline.updateMany({ where: { ...scope, streamId: input.streamId, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
    return transaction.knowledgeBaseline.upsert({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } }, create: { ...scope, id: input.id, streamId: input.streamId, changeSetId: input.changeSetId, status: "PUBLISHED", manifest: jsonValue(manifest), publishedAt: new Date(manifest.publishedAt) }, update: { streamId: input.streamId, changeSetId: input.changeSetId, status: "PUBLISHED", manifest: jsonValue(manifest), publishedAt: new Date(manifest.publishedAt) } });
  });
  return { id: row.id, streamId: row.streamId, changeSetId: row.changeSetId, status: row.status, manifest: row.manifest, architectureScope: scope, createdAt: row.createdAt.toISOString(), publishedAt: row.publishedAt?.toISOString() };
}

export async function createProjectionManifest(input: ProjectionManifestInput): Promise<ProjectionManifest> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const digest = projectionManifestDigest({ architectureScope: scope, baselineId: input.baselineId, projectionType: input.projectionType, projectionSchemaVersion: input.projectionSchemaVersion, sourceRevisionIds: input.sourceRevisionIds, relationshipVersion: input.relationshipVersion, query: input.query });
  const generatedAt = new Date().toISOString();
  await ensureMcpPersistenceSchema();
  const baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.baselineId } } });
  if (!baseline || baseline.status !== "PUBLISHED") throw new Error("BASELINE_NOT_PUBLISHED");
  const row = await prisma.projectionManifest.upsert({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } }, create: { ...scope, id: input.id, baselineId: input.baselineId, projectionType: input.projectionType, projectionSchemaVersion: input.projectionSchemaVersion, sourceRevisionIds: input.sourceRevisionIds, relationshipVersion: input.relationshipVersion, query: jsonValue(input.query), digest, generatedAt: new Date(generatedAt) }, update: { baselineId: input.baselineId, projectionType: input.projectionType, projectionSchemaVersion: input.projectionSchemaVersion, sourceRevisionIds: input.sourceRevisionIds, relationshipVersion: input.relationshipVersion, query: jsonValue(input.query), digest, generatedAt: new Date(generatedAt) } });
  return { id: row.id, baselineId: row.baselineId, projectionType: row.projectionType as ProjectionManifest["projectionType"], projectionSchemaVersion: row.projectionSchemaVersion, sourceRevisionIds: row.sourceRevisionIds as string[], relationshipVersion: row.relationshipVersion, query: row.query as Record<string, unknown>, digest: row.digest, generatedAt: row.generatedAt.toISOString(), architectureScope: scope };
}

export async function listKnowledgeAssertions(applicationServiceId: string): Promise<KnowledgeAssertion[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.knowledgeAssertion.findMany({ where: scope, orderBy: [{ semanticIdentity: "asc" }, { revision: "asc" }] });
  return rows.map(assertionFromRow);
}

function assertionFromRow(row: any): KnowledgeAssertion {
  return { id: row.id, semanticIdentity: row.semanticIdentity, factType: row.factType, layer: row.layer, aspect: row.aspect, value: row.value as Record<string, unknown>, status: row.status, confidence: row.confidence, matchingEvidence: row.matchingEvidence as string[], counterEvidence: row.counterEvidence as string[], unresolvedQuestions: row.unresolvedQuestions as string[], evidenceRefs: row.evidenceRefs as string[], sourceObservationIds: row.sourceObservationIds as string[], extractorId: row.extractorId, revision: row.revision, changeSetId: row.changeSetId ?? undefined, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function changeSetFromRow(row: any): ChangeSet {
  return { id: row.id, streamId: row.streamId, sequence: Number(row.sequence), status: row.status, assetRevisionIds: row.assetRevisionIds as string[], relationshipRevisionIds: row.relationshipRevisionIds as string[], evidenceRefs: row.evidenceRefs as string[], digest: row.digest, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), committedAt: row.committedAt?.toISOString() };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
