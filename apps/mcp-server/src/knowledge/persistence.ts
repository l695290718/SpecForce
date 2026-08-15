import { assertBaselinePublishable, assertPromotionDecisionValid, changeSetDigest, evaluateReviewBundle, genericSystemAnalysisProfile, projectionManifestDigest, reviewBundleDigest, validateKnowledgeAssertion, type ArchitectureScopeRef, type BaselineManifest, type ChangeSet, type IdentityCandidate, type KnowledgeAssertion, type KnowledgePromotionDecision, type ProjectionManifest, type ReviewBundle, type ReviewCoverage, type ReviewRiskTier } from "@specforge/core";
import { Prisma } from "@prisma/client";
import { prisma, ensureMcpPersistenceSchema, readableScope, resolveWritableScope, writableActor } from "../persistence";
import { assertCandidateApprovalPolicy } from "./risk-policy";
import { loadConvergedReconciliation } from "./promotion";

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
  architectureFactRevisionIds?: string[];
  evidenceRefs: string[];
  promotionDecisionId?: string;
}

export interface ReviewBundleInput {
  id: string;
  designChangeSessionId: string;
  architectureScope: ArchitectureScopeRef;
  riskTier: ReviewRiskTier;
  assertionIds: string[];
  identityCandidateIds: string[];
  architectureFactRevisionIds?: string[];
  evidenceRefs: string[];
  coverage: ReviewCoverage;
  blockingIssues: string[];
}

export interface PromotionDecisionInput {
  id: string;
  reviewBundleId: string;
  architectureScope: ArchitectureScopeRef;
  decision: "APPROVE" | "REJECT";
  approvedAssertionIds: string[];
  approvedIdentityCandidateIds: string[];
  approvedArchitectureFactRevisionIds?: string[];
  evidenceRefs: string[];
  reason: string;
}

export interface BaselineInput {
  id: string;
  streamId: string;
  changeSetId: string;
  architectureScope: ArchitectureScopeRef;
  sourceRevisionIds: string[];
  architectureFactRevisionIds?: string[];
  relationshipVersion: string;
  reconciliationReceiptId?: string;
  /** Kept optional at the type boundary for source compatibility; publication rejects its absence. */
  reconciliationStatus?: "CONVERGED" | "DRIFTED" | "BLOCKED";
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
      riskTier: assertion.riskTier ?? "T1",
      domainCluster: assertion.domainCluster ?? null,
      generatedByActorId: assertion.generatedByActorId ?? null,
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
      riskTier: assertion.riskTier ?? "T1",
      domainCluster: assertion.domainCluster ?? null,
      generatedByActorId: assertion.generatedByActorId ?? null,
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

export async function createKnowledgeReviewBundle(input: ReviewBundleInput): Promise<ReviewBundle> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (!input.id || !input.designChangeSessionId) throw new Error("REVIEW_BUNDLE_IDENTITY_REQUIRED");
  const assertionIds = [...new Set(input.assertionIds)];
  const identityCandidateIds = [...new Set(input.identityCandidateIds)];
  const architectureFactRevisionIds = [...new Set(input.architectureFactRevisionIds ?? [])];
  const evidenceRefs = [...new Set(input.evidenceRefs)];
  const blockingIssues = [...new Set(input.blockingIssues)];
  const status = evaluateReviewBundle(input.coverage, blockingIssues);
  const digest = reviewBundleDigest({ architectureScope: scope, designChangeSessionId: input.designChangeSessionId, riskTier: input.riskTier, assertionIds, identityCandidateIds, architectureFactRevisionIds, evidenceRefs, coverage: input.coverage, blockingIssues });
  await ensureMcpPersistenceSchema();
  const row = await prisma.$transaction(async (transaction) => {
    const session = await transaction.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (["BLOCKED", "CLOSED"].includes(session.status)) throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");
    const [assertions, candidates, unitRevisions, membershipRevisions, mappingRevisions] = await Promise.all([
      transaction.knowledgeAssertion.findMany({ where: { ...scope, id: { in: assertionIds } }, select: { id: true } }),
      transaction.identityCandidate.findMany({ where: { ...scope, id: { in: identityCandidateIds } }, select: { id: true } }),
      transaction.architectureUnitRevision.findMany({ where: { ...scope, id: { in: architectureFactRevisionIds } }, select: { id: true } }),
      transaction.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: architectureFactRevisionIds } }, select: { id: true } }),
      transaction.architectureUnitMappingRevision.findMany({ where: { ...scope, id: { in: architectureFactRevisionIds } }, select: { id: true } })
    ]);
    const architectureCount = unitRevisions.length + membershipRevisions.length + mappingRevisions.length;
    if (assertions.length !== assertionIds.length || candidates.length !== identityCandidateIds.length || architectureCount !== architectureFactRevisionIds.length) throw new Error("REVIEW_BUNDLE_FACT_SCOPE_MISMATCH");
    const existing = await transaction.knowledgeReviewBundle.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
    if (existing) {
      if (existing.digest !== digest) throw new Error("REVIEW_BUNDLE_IDEMPOTENCY_CONFLICT");
      return existing;
    }
    const created = await transaction.knowledgeReviewBundle.create({ data: { ...scope, id: input.id, designChangeSessionId: input.designChangeSessionId, status, riskTier: input.riskTier, assertionIds, identityCandidateIds, architectureFactRevisionIds, evidenceRefs, coverage: jsonValue(input.coverage), blockingIssues, digest, createdBy: writableActor().actorId } });
    await transaction.designChangeSession.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } }, data: { status: status === "READY" ? "WAITING_FOR_REVIEW" : "CONFLICTED" } });
    await appendGovernanceEvent(transaction, scope, input.designChangeSessionId, "KNOWLEDGE_REVIEW_BUNDLE_CREATED", `knowledge-review-bundle:${scope.applicationServiceId}:${scope.scopePath}:${input.id}`, { reviewBundleId: input.id, status, riskTier: input.riskTier, assertionIds, identityCandidateIds, architectureFactRevisionIds, blockingIssues });
    return created;
  });
  return reviewBundleFromRow(row);
}

export async function decideKnowledgeReviewBundle(input: PromotionDecisionInput): Promise<KnowledgePromotionDecision> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const row = await prisma.$transaction(async (transaction) => {
    const bundle = await transaction.knowledgeReviewBundle.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.reviewBundleId } } });
    if (!bundle) throw new Error("REVIEW_BUNDLE_NOT_FOUND");
    const bundleValue = reviewBundleFromRow(bundle);
    assertPromotionDecisionValid({ decision: input.decision, reason: input.reason, evidenceRefs: input.evidenceRefs, approvedAssertionIds: input.approvedAssertionIds, approvedIdentityCandidateIds: input.approvedIdentityCandidateIds, approvedArchitectureFactRevisionIds: input.approvedArchitectureFactRevisionIds ?? [] }, bundleValue);
    if (input.decision === "APPROVE") {
      const bundleAssertions = await transaction.knowledgeAssertion.findMany({ where: { ...scope, id: { in: bundleValue.assertionIds } } });
      if (bundleAssertions.length !== bundleValue.assertionIds.length) throw new Error("REVIEW_BUNDLE_FACT_SCOPE_MISMATCH");
      assertCandidateApprovalPolicy(bundleValue, bundleAssertions.map(assertionFromRow), writableActor());
    }
    const existing = await transaction.knowledgePromotionDecision.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
    if (existing) return existing;
    const session = await transaction.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: bundle.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    const approvedAssertionIds = [...new Set(input.approvedAssertionIds)];
    const approvedIdentityCandidateIds = [...new Set(input.approvedIdentityCandidateIds)];
    const approvedArchitectureFactRevisionIds = [...new Set(input.approvedArchitectureFactRevisionIds ?? [])];
    if (input.decision === "APPROVE") {
      const [assertions, candidates, unitRevisions, membershipRevisions, mappingRevisions] = await Promise.all([
        transaction.knowledgeAssertion.findMany({ where: { ...scope, id: { in: approvedAssertionIds } }, select: { id: true } }),
        transaction.identityCandidate.findMany({ where: { ...scope, id: { in: approvedIdentityCandidateIds } }, select: { id: true } }),
        transaction.architectureUnitRevision.findMany({ where: { ...scope, id: { in: approvedArchitectureFactRevisionIds } }, select: { id: true } }),
        transaction.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: approvedArchitectureFactRevisionIds } }, select: { id: true } }),
        transaction.architectureUnitMappingRevision.findMany({ where: { ...scope, id: { in: approvedArchitectureFactRevisionIds } }, select: { id: true } })
      ]);
      if (assertions.length !== approvedAssertionIds.length || candidates.length !== approvedIdentityCandidateIds.length || unitRevisions.length + membershipRevisions.length + mappingRevisions.length !== approvedArchitectureFactRevisionIds.length) throw new Error("PROMOTION_TARGET_SCOPE_MISMATCH");
      await transaction.knowledgeAssertion.updateMany({ where: { ...scope, id: { in: approvedAssertionIds } }, data: { status: "ACCEPTED" } });
      await transaction.identityCandidate.updateMany({ where: { ...scope, id: { in: approvedIdentityCandidateIds } }, data: { decision: "ACCEPTED", reviewedBy: writableActor().actorId, reviewedAt: new Date() } });
    }
    const created = await transaction.knowledgePromotionDecision.create({ data: { ...scope, id: input.id, reviewBundleId: input.reviewBundleId, designChangeSessionId: bundle.designChangeSessionId, decision: input.decision, approvedAssertionIds, approvedIdentityCandidateIds, approvedArchitectureFactRevisionIds, evidenceRefs: [...new Set(input.evidenceRefs)], reason: input.reason, actorId: writableActor().actorId } });
    await transaction.knowledgeReviewBundle.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.reviewBundleId } }, data: { status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED" } });
    await transaction.designChangeSession.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: bundle.designChangeSessionId } }, data: { status: input.decision === "APPROVE" ? "WAITING_FOR_DELIVERY" : "BLOCKED", closureReason: input.decision === "REJECT" ? input.reason : null } });
    await appendGovernanceEvent(transaction, scope, bundle.designChangeSessionId, "KNOWLEDGE_PROMOTION_DECISION_RECORDED", `knowledge-promotion-decision:${scope.applicationServiceId}:${scope.scopePath}:${input.id}`, { promotionDecisionId: input.id, reviewBundleId: input.reviewBundleId, decision: input.decision, approvedAssertionIds, approvedIdentityCandidateIds, approvedArchitectureFactRevisionIds });
    return created;
  });
  return promotionDecisionFromRow(row);
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
  const architectureFactRevisionIds = [...new Set(input.architectureFactRevisionIds ?? [])];
  if ((input.assetRevisionIds.length > 0 || input.relationshipRevisionIds.length > 0 || architectureFactRevisionIds.length > 0) && !input.promotionDecisionId) throw new Error("PROMOTION_DECISION_REQUIRED");
  await ensureMcpPersistenceSchema();
  const row = await prisma.$transaction(async (transaction) => {
    const stream = await transaction.workingStream.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } } });
    if (!stream) throw new Error("WORKING_STREAM_NOT_FOUND");
    if (stream.status !== "ACTIVE") throw new Error("WORKING_STREAM_NOT_ACTIVE");
    if (input.promotionDecisionId) {
      const decision = await transaction.knowledgePromotionDecision.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.promotionDecisionId } } });
      if (!decision || decision.decision !== "APPROVE") throw new Error("PROMOTION_DECISION_NOT_APPROVED");
      const approvedIds = new Set([...(decision.approvedAssertionIds as string[]), ...(decision.approvedIdentityCandidateIds as string[]), ...(decision.approvedArchitectureFactRevisionIds as string[])]);
      if ([...input.assetRevisionIds, ...input.relationshipRevisionIds, ...architectureFactRevisionIds].some((id) => !approvedIds.has(id))) throw new Error("CHANGESET_TARGET_NOT_APPROVED");
    }
    await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `knowledge-changeset:${scope.applicationServiceId}:${scope.scopePath}:${input.streamId}`);
    const existing = await transaction.knowledgeChangeSet.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
    if (existing) return existing;
    const previous = await transaction.knowledgeChangeSet.findFirst({ where: { ...scope, streamId: input.streamId }, orderBy: { sequence: "desc" } });
    const sequence = Number(previous?.sequence ?? 0n) + 1;
    const digest = changeSetDigest({ architectureScope: scope, streamId: input.streamId, sequence, assetRevisionIds: input.assetRevisionIds, relationshipRevisionIds: input.relationshipRevisionIds, architectureFactRevisionIds, evidenceRefs: input.evidenceRefs });
    const changeSet = await transaction.knowledgeChangeSet.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      create: { ...scope, id: input.id, streamId: input.streamId, sequence, status: "COMMITTED", assetRevisionIds: input.assetRevisionIds, relationshipRevisionIds: input.relationshipRevisionIds, architectureFactRevisionIds, evidenceRefs: input.evidenceRefs, digest, promotionDecisionId: input.promotionDecisionId ?? null, committedAt: new Date() },
      update: { status: "COMMITTED", sequence, assetRevisionIds: input.assetRevisionIds, relationshipRevisionIds: input.relationshipRevisionIds, architectureFactRevisionIds, evidenceRefs: input.evidenceRefs, digest, promotionDecisionId: input.promotionDecisionId ?? null, committedAt: new Date() }
    });
    await transaction.workingStream.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } }, data: { headChangeSetId: input.id } });
    return changeSet;
  });
  return changeSetFromRow(row);
}

export async function publishKnowledgeBaseline(input: BaselineInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  if (!input.reconciliationReceiptId) throw new Error("BASELINE_RECONCILIATION_RECEIPT_REQUIRED");
  const reconciliation = await loadConvergedReconciliation(scope, input.reconciliationReceiptId);
  if (reconciliation.changeSetId !== input.changeSetId) throw new Error("BASELINE_RECONCILIATION_CHANGESET_MISMATCH");
  if (!sameIds(reconciliation.assetRevisionIds, input.sourceRevisionIds)) throw new Error("BASELINE_RECONCILIATION_ASSET_MISMATCH");
  const architectureFactRevisionIds = [...new Set(input.architectureFactRevisionIds ?? reconciliation.architectureFactRevisionIds ?? [])];
  if (reconciliation.architectureFactRevisionIds.length > 0 && !sameIds(reconciliation.architectureFactRevisionIds, architectureFactRevisionIds)) throw new Error("BASELINE_RECONCILIATION_ARCHITECTURE_FACT_MISMATCH");
  if (reconciliation.relationshipVersion !== input.relationshipVersion) throw new Error("BASELINE_RECONCILIATION_RELATIONSHIP_VERSION_MISMATCH");
  const manifest: BaselineManifest = {
    architectureScope: scope,
    baselineId: input.id,
    changeSetId: input.changeSetId,
    sourceRevisionIds: input.sourceRevisionIds,
    architectureFactRevisionIds,
    relationshipVersion: input.relationshipVersion,
    promotionReceiptId: reconciliation.promotionReceiptId,
    reconciliationReceiptId: reconciliation.id,
    scanSessionDigest: reconciliation.scanSessionDigest,
    publishedAt: new Date().toISOString()
  };
  assertBaselinePublishable({ status: "PUBLISHED", manifest }, reconciliation.status);
  const row = await prisma.$transaction(async (transaction) => {
    const changeSet = await transaction.knowledgeChangeSet.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.changeSetId } } });
    if (!changeSet || changeSet.streamId !== input.streamId || changeSet.status !== "COMMITTED") throw new Error("CHANGESET_NOT_COMMITTED");
    if (!sameIds(changeSet.architectureFactRevisionIds as string[], architectureFactRevisionIds)) throw new Error("BASELINE_CHANGESET_ARCHITECTURE_FACT_MISMATCH");
    await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `knowledge-baseline:${scope.applicationServiceId}:${scope.scopePath}:${input.streamId}`);
    const existing = await transaction.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
    if (existing) {
      const existingManifest = existing.manifest as unknown as BaselineManifest;
      if (existing.streamId !== input.streamId || existing.changeSetId !== input.changeSetId || existingManifest.reconciliationReceiptId !== manifest.reconciliationReceiptId) throw new Error("BASELINE_IMMUTABLE");
      return existing;
    }
    const created = await transaction.knowledgeBaseline.create({ data: { ...scope, id: input.id, streamId: input.streamId, changeSetId: input.changeSetId, status: "PUBLISHED", manifest: jsonValue(manifest), publishedAt: new Date(manifest.publishedAt) } });
    await transaction.knowledgeBaseline.updateMany({ where: { ...scope, streamId: input.streamId, status: "PUBLISHED", id: { not: input.id } }, data: { status: "SUPERSEDED" } });
    return created;
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
  return { id: row.id, semanticIdentity: row.semanticIdentity, factType: row.factType, layer: row.layer, aspect: row.aspect, value: row.value as Record<string, unknown>, status: row.status, confidence: row.confidence, matchingEvidence: row.matchingEvidence as string[], counterEvidence: row.counterEvidence as string[], unresolvedQuestions: row.unresolvedQuestions as string[], evidenceRefs: row.evidenceRefs as string[], sourceObservationIds: row.sourceObservationIds as string[], extractorId: row.extractorId, riskTier: row.riskTier ?? undefined, domainCluster: row.domainCluster ?? undefined, generatedByActorId: row.generatedByActorId ?? undefined, revision: row.revision, changeSetId: row.changeSetId ?? undefined, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function changeSetFromRow(row: any): ChangeSet {
  return { id: row.id, streamId: row.streamId, sequence: Number(row.sequence), status: row.status, assetRevisionIds: row.assetRevisionIds as string[], relationshipRevisionIds: row.relationshipRevisionIds as string[], architectureFactRevisionIds: (row.architectureFactRevisionIds ?? []) as string[], evidenceRefs: row.evidenceRefs as string[], digest: row.digest, ...(row.promotionDecisionId ? { promotionDecisionId: row.promotionDecisionId } : {}), architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), committedAt: row.committedAt?.toISOString() };
}

function reviewBundleFromRow(row: any): ReviewBundle {
  return { id: row.id, designChangeSessionId: row.designChangeSessionId, status: row.status, riskTier: row.riskTier, assertionIds: row.assertionIds as string[], identityCandidateIds: row.identityCandidateIds as string[], architectureFactRevisionIds: (row.architectureFactRevisionIds ?? []) as string[], evidenceRefs: row.evidenceRefs as string[], coverage: row.coverage as ReviewCoverage, blockingIssues: row.blockingIssues as string[], digest: row.digest, createdBy: row.createdBy, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function promotionDecisionFromRow(row: any): KnowledgePromotionDecision {
  return { id: row.id, reviewBundleId: row.reviewBundleId, designChangeSessionId: row.designChangeSessionId, decision: row.decision, approvedAssertionIds: row.approvedAssertionIds as string[], approvedIdentityCandidateIds: row.approvedIdentityCandidateIds as string[], approvedArchitectureFactRevisionIds: (row.approvedArchitectureFactRevisionIds ?? []) as string[], evidenceRefs: row.evidenceRefs as string[], reason: row.reason, actorId: row.actorId, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString() };
}

async function appendGovernanceEvent(transaction: any, scope: ArchitectureScopeRef, designChangeSessionId: string, eventType: string, idempotencyKey: string, payload: Record<string, unknown>): Promise<void> {
  await transaction.federationOutbox.upsert({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey } }, create: { ...scope, eventType, payload: jsonValue(payload), idempotencyKey, status: "PENDING", designChangeSessionId }, update: {} });
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function sameIds(left: string[], right: string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}
