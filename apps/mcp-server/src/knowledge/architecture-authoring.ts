import { Prisma } from "@prisma/client";
import {
  contentDigest,
  type KnowledgeReconciliationResult,
  type ArchitectureFactBatchReceipt,
  type ArchitectureFactBatchSubmission,
  type ArchitectureFactPromotionReceipt,
  type ArchitectureFactResolution,
  type ArchitectureScopeRef,
  type ValidatedArchitectureFactBatch,
  validateArchitectureFactBatch
} from "@specforge/core";
import { configuredRelationshipScope, ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";
import { PrismaRelationshipRepository } from "../relationships/repository";

export interface ArchitectureFactBatchInput extends ArchitectureFactBatchSubmission {}

export interface ArchitectureFactPromotionInput {
  architectureScope: ArchitectureScopeRef;
  promotionDecisionId: string;
  streamId: string;
  evidenceRefs: string[];
}

export interface ReconcileArchitectureFactsInput {
  architectureScope: ArchitectureScopeRef;
  promotionReceiptId: string;
}

export async function submit3aArchitectureFactBatch(input: ArchitectureFactBatchInput): Promise<ArchitectureFactBatchReceipt> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const submission = { ...input, architectureScope: scope };
  await ensureMcpPersistenceSchema();
  const resolved = await resolveArchitectureFactReferences(scope, submission);
  const validated = validateArchitectureFactBatch(submission, resolved);
  return prisma.$transaction(async (tx) => {
    const session = await tx.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: validated.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (["BLOCKED", "CLOSED"].includes(session.status)) throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");
    const existing = await tx.architectureFactBatch.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: validated.idempotencyKey } } });
    if (existing) {
      if (existing.contentDigest !== validated.contentDigest) throw new Error("ARCHITECTURE_FACT_BATCH_IDEMPOTENCY_CONFLICT");
      return batchReceipt(existing, true, scope);
    }
    const unitRevisionIds = validated.units.map((unit) => unit.id);
    const membershipRevisionIds = validated.memberships.map((membership) => membership.id);
    const mappingRevisionIds = validated.mappings.map((mapping) => mapping.id);
    const batch = await tx.architectureFactBatch.create({
      data: {
        ...scope,
        id: validated.id,
        idempotencyKey: validated.idempotencyKey,
        designChangeSessionId: validated.designChangeSessionId,
        status: "CANDIDATE",
        provenance: jsonValue(validated.provenance),
        evidenceRefs: jsonValue(validated.evidenceRefs),
        unitRevisionIds: jsonValue(unitRevisionIds),
        membershipRevisionIds: jsonValue(membershipRevisionIds),
        mappingRevisionIds: jsonValue(mappingRevisionIds),
        canonicalBytes: validated.canonicalBytes,
        contentDigest: validated.contentDigest
      }
    });
    for (const unit of validated.units) {
      await tx.architectureUnitRevision.create({ data: unitRow(unit, validated, scope) });
    }
    for (const membership of validated.memberships) {
      await tx.architectureUnitMembershipRevision.create({ data: membershipRow(membership, validated, scope) });
    }
    for (const mapping of validated.mappings) {
      await tx.architectureUnitMappingRevision.create({ data: mappingRow(mapping, validated, scope) });
    }
    await tx.federationOutbox.upsert({
      where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: `architecture-fact-batch:${validated.id}` } },
      create: { ...scope, eventType: "ARCHITECTURE_FACT_BATCH_SUBMITTED", payload: jsonValue({ batchId: validated.id, contentDigest: validated.contentDigest, unitRevisionIds, membershipRevisionIds, mappingRevisionIds }), idempotencyKey: `architecture-fact-batch:${validated.id}`, status: "PENDING", designChangeSessionId: validated.designChangeSessionId },
      update: {}
    });
    return batchReceipt(batch, false, scope);
  });
}

export async function promote3aArchitectureFacts(input: ArchitectureFactPromotionInput): Promise<ArchitectureFactPromotionReceipt> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const evidenceRefs = [...new Set(input.evidenceRefs.map((value) => value.trim()).filter(Boolean))];
  if (!input.promotionDecisionId || !input.streamId || evidenceRefs.length === 0) throw new Error("ARCHITECTURE_FACT_PROMOTION_INPUT_INVALID");
  return prisma.$transaction(async (tx) => {
    const decision = await tx.knowledgePromotionDecision.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.promotionDecisionId } } });
    if (!decision || decision.decision !== "APPROVE") throw new Error("PROMOTION_DECISION_NOT_APPROVED");
    const revisionIds = [...new Set((decision.approvedArchitectureFactRevisionIds as string[] | null) ?? [])];
    if (revisionIds.length === 0) throw new Error("ARCHITECTURE_FACT_PROMOTION_TARGETS_REQUIRED");
    const bundle = await tx.knowledgeReviewBundle.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: decision.reviewBundleId } } });
    if (!bundle || !(bundle.architectureFactRevisionIds as string[]).every((id) => revisionIds.includes(id))) throw new Error("ARCHITECTURE_FACT_REVIEW_BUNDLE_MISMATCH");
    const [units, memberships, mappings] = await Promise.all([
      tx.architectureUnitRevision.findMany({ where: { ...scope, id: { in: revisionIds } } }),
      tx.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: revisionIds } } }),
      tx.architectureUnitMappingRevision.findMany({ where: { ...scope, id: { in: revisionIds } } })
    ]);
    if (units.length + memberships.length + mappings.length !== revisionIds.length) throw new Error("ARCHITECTURE_FACT_PROMOTION_SCOPE_MISMATCH");
    const batchIds = [...new Set([...units.map((row) => row.batchId), ...memberships.map((row) => row.batchId), ...mappings.map((row) => row.batchId)])];
    if (batchIds.length !== 1) throw new Error("ARCHITECTURE_FACT_BATCH_MISMATCH");
    const batchId = batchIds[0]!;
    const stream = await tx.workingStream.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } } });
    if (!stream || stream.status !== "ACTIVE") throw new Error("WORKING_STREAM_NOT_ACTIVE");
    const receiptId = `architecture-fact-promotion:${input.promotionDecisionId}:${batchId}`;
    const existingEvent = await tx.federationOutbox.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: receiptId } } });
    if (existingEvent) return (jsonRecord(existingEvent.payload).receipt as unknown) as ArchitectureFactPromotionReceipt;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `architecture-fact-promotion:${scope.applicationServiceId}:${scope.scopePath}:${input.streamId}`);
    const previous = await tx.knowledgeChangeSet.findFirst({ where: { ...scope, streamId: input.streamId }, orderBy: { sequence: "desc" } });
    const sequence = Number(previous?.sequence ?? 0n) + 1;
    const sourceDigest = contentDigest({ scope, promotionDecisionId: input.promotionDecisionId, batchId, revisionIds, evidenceRefs });
    const changeSetId = `architecture-fact-changeset:${sourceDigest}`;
    const digest = contentDigest({ architectureScope: scope, streamId: input.streamId, sequence, assetRevisionIds: [], relationshipRevisionIds: [], architectureFactRevisionIds: revisionIds, evidenceRefs });
    await tx.knowledgeChangeSet.create({ data: { ...scope, id: changeSetId, streamId: input.streamId, sequence, status: "COMMITTED", assetRevisionIds: [], relationshipRevisionIds: [], architectureFactRevisionIds: revisionIds, evidenceRefs, digest, promotionDecisionId: input.promotionDecisionId, committedAt: new Date() } });
    await Promise.all([
      tx.architectureUnitRevision.updateMany({ where: { ...scope, id: { in: revisionIds } }, data: { status: "ACCEPTED", changeSetId } }),
      tx.architectureUnitMembershipRevision.updateMany({ where: { ...scope, id: { in: revisionIds } }, data: { status: "ACCEPTED", changeSetId } }),
      tx.architectureUnitMappingRevision.updateMany({ where: { ...scope, id: { in: revisionIds } }, data: { status: "ACCEPTED", changeSetId } }),
      tx.architectureFactBatch.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: batchId } }, data: { status: "ACCEPTED" } }),
      tx.workingStream.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } }, data: { headChangeSetId: changeSetId } })
    ]);
    const receipt: ArchitectureFactPromotionReceipt = { id: receiptId, architectureScope: scope, promotionDecisionId: input.promotionDecisionId, architectureFactBatchId: batchId, architectureFactRevisionIds: revisionIds, changeSetId, changeSetSequence: sequence, sourceDigest, idempotent: false, createdAt: new Date().toISOString() };
    await tx.federationOutbox.create({ data: { ...scope, eventType: "ARCHITECTURE_FACTS_PROMOTED", payload: jsonValue({ receipt }), idempotencyKey: receiptId, status: "PENDING", designChangeSessionId: decision.designChangeSessionId } });
    return receipt;
  });
}

export async function reconcile3aArchitectureFacts(input: ReconcileArchitectureFactsInput): Promise<KnowledgeReconciliationResult> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  if (!input.promotionReceiptId) throw new Error("ARCHITECTURE_FACT_PROMOTION_RECEIPT_REQUIRED");
  const relationshipVersion = (await new PrismaRelationshipRepository(prisma).currentGraphVersion(configuredRelationshipScope(scope))).toString();
  return prisma.$transaction(async (tx) => {
    const event = await tx.federationOutbox.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: input.promotionReceiptId } } });
    if (!event || event.eventType !== "ARCHITECTURE_FACTS_PROMOTED") throw new Error("ARCHITECTURE_FACT_PROMOTION_RECEIPT_NOT_FOUND");
    const receipt = jsonRecord(jsonRecord(event.payload).receipt) as unknown as ArchitectureFactPromotionReceipt;
    const existing = await tx.federationOutbox.findFirst({ where: { ...scope, eventType: "KNOWLEDGE_BASELINE_RECONCILED", payload: { path: ["result", "promotionReceiptId"], equals: receipt.id } } });
    if (existing) return jsonRecord(jsonRecord(existing.payload).result) as unknown as KnowledgeReconciliationResult;
    const [changeSet, batch, units, memberships, mappings] = await Promise.all([
      tx.knowledgeChangeSet.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: receipt.changeSetId } } }),
      tx.architectureFactBatch.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: receipt.architectureFactBatchId } } }),
      tx.architectureUnitRevision.findMany({ where: { ...scope, id: { in: receipt.architectureFactRevisionIds }, status: "ACCEPTED", changeSetId: receipt.changeSetId }, select: { id: true } }),
      tx.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: receipt.architectureFactRevisionIds }, status: "ACCEPTED", changeSetId: receipt.changeSetId }, select: { id: true } }),
      tx.architectureUnitMappingRevision.findMany({ where: { ...scope, id: { in: receipt.architectureFactRevisionIds }, status: "ACCEPTED", changeSetId: receipt.changeSetId }, select: { id: true } })
    ]);
    const revisionCount = units.length + memberships.length + mappings.length;
    const issues: string[] = [];
    if (!changeSet || changeSet.status !== "COMMITTED") issues.push("ARCHITECTURE_FACT_RECONCILIATION_CHANGESET_MISSING");
    if (!batch || batch.status !== "ACCEPTED") issues.push("ARCHITECTURE_FACT_RECONCILIATION_BATCH_MISSING");
    if (revisionCount !== receipt.architectureFactRevisionIds.length) issues.push("ARCHITECTURE_FACT_RECONCILIATION_REVISION_MISMATCH");
    if (!changeSet || !sameIds(changeSet.architectureFactRevisionIds as string[], receipt.architectureFactRevisionIds)) issues.push("ARCHITECTURE_FACT_RECONCILIATION_CHANGESET_CONTENT_MISMATCH");
    const scanSessionId = `architecture-fact-batch:${receipt.architectureFactBatchId}`;
    const scanSessionDigest = batch?.contentDigest ?? receipt.sourceDigest;
    const evidenceRefs = Array.isArray(batch?.evidenceRefs) ? batch.evidenceRefs as string[] : [];
    const reconciledAt = new Date().toISOString();
    const stateDigest = contentDigest({ receiptId: receipt.id, changeSet: changeSet?.digest, batch: batch?.contentDigest, revisionIds: receipt.architectureFactRevisionIds, relationshipVersion, issues });
    const result: KnowledgeReconciliationResult = {
      id: `knowledge-reconciliation:${receipt.id}:${stateDigest}`,
      architectureScope: scope,
      promotionReceiptId: receipt.id,
      promotionSourceDigest: receipt.sourceDigest,
      scanSessionId,
      scanSessionDigest,
      changeSetId: receipt.changeSetId,
      status: issues.length === 0 ? "CONVERGED" : "DRIFTED",
      issues,
      assetRevisionIds: [],
      relationshipRevisionIds: [],
      architectureFactRevisionIds: receipt.architectureFactRevisionIds,
      evidenceRefs,
      relationshipVersion,
      reconciledAt
    };
    await tx.federationOutbox.create({ data: { ...scope, eventType: "KNOWLEDGE_BASELINE_RECONCILED", payload: jsonValue({ result }), idempotencyKey: result.id, status: "PENDING" } });
    return result;
  });
}

async function resolveArchitectureFactReferences(scope: ArchitectureScopeRef, submission: ArchitectureFactBatchSubmission): Promise<ArchitectureFactResolution> {
  const assertionIds = [...new Set(submission.memberships.flatMap((membership) => membership.assertionId ? [membership.assertionId] : []))];
  const assetKeys = [...new Set(submission.memberships.flatMap((membership) => membership.assetType && membership.assetId ? [`${membership.assetType}:${membership.assetId}`] : []))];
  const relationshipIdentities = [...new Set(submission.mappings.flatMap((mapping) => mapping.relationshipIdentities))];
  const [units, assertions, assets, links, events] = await Promise.all([
    prisma.architectureUnitRevision.findMany({ where: { ...scope }, select: { unitIdentity: true } }),
    prisma.knowledgeAssertion.findMany({ where: { ...scope, id: { in: assertionIds } }, select: { id: true } }),
    prisma.designAsset.findMany({ where: { ...scope }, select: { id: true, type: true } }),
    prisma.assetLink.findMany({ where: { ...scope }, select: { id: true } }),
    prisma.relationshipEvent.findMany({ where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, select: { dbId: true, idempotencyKey: true } })
  ]);
  return {
    unitIdentities: new Set(units.map((unit) => unit.unitIdentity)),
    assertionIds: new Set(assertions.map((assertion) => assertion.id)),
    assetKeys: new Set(assets.map((asset) => `${asset.type}:${asset.id}`)),
    relationshipIdentities: new Set([...links.map((link) => link.id), ...events.flatMap((event) => [event.dbId, event.idempotencyKey]), ...relationshipIdentities.filter((id) => id.startsWith("relationship:"))])
  };
}

function unitRow(unit: ValidatedArchitectureFactBatch["units"][number], batch: ValidatedArchitectureFactBatch, scope: ArchitectureScopeRef) {
  return { ...scope, id: unit.id, unitIdentity: unit.unitIdentity, revision: unit.revision, layer: unit.layer, kind: unit.kind, parentUnitIdentity: unit.parentUnitIdentity ?? null, canonicalName: unit.canonicalName, canonicalDescription: unit.canonicalDescription, localizedContent: jsonValue(unit.localizedContent), aliases: jsonValue(unit.aliases), criticality: unit.criticality, evidenceRefs: jsonValue(unit.evidenceRefs), status: "CANDIDATE", batchId: batch.id, contentDigest: contentDigest(unit) };
}

function membershipRow(membership: ValidatedArchitectureFactBatch["memberships"][number], batch: ValidatedArchitectureFactBatch, scope: ArchitectureScopeRef) {
  return { ...scope, id: membership.id, membershipIdentity: membership.membershipIdentity, revision: membership.revision, unitIdentity: membership.unitIdentity, assertionId: membership.assertionId ?? null, assetType: membership.assetType ?? null, assetId: membership.assetId ?? null, semanticIdentity: membership.semanticIdentity, confidence: membership.confidence, evidenceRefs: jsonValue(membership.evidenceRefs), status: "CANDIDATE", batchId: batch.id, contentDigest: contentDigest(membership) };
}

function mappingRow(mapping: ValidatedArchitectureFactBatch["mappings"][number], batch: ValidatedArchitectureFactBatch, scope: ArchitectureScopeRef) {
  return { ...scope, id: mapping.id, mappingIdentity: mapping.mappingIdentity, revision: mapping.revision, sourceUnitIdentity: mapping.sourceUnitIdentity, targetUnitIdentity: mapping.targetUnitIdentity, mappingFamily: mapping.mappingFamily, confidence: mapping.confidence, relationshipIdentities: jsonValue(mapping.relationshipIdentities), evidenceRefs: jsonValue(mapping.evidenceRefs), status: "CANDIDATE", batchId: batch.id, contentDigest: contentDigest(mapping) };
}

function batchReceipt(row: any, idempotent: boolean, scope: ArchitectureScopeRef): ArchitectureFactBatchReceipt {
  return { id: row.id, idempotencyKey: row.idempotencyKey, architectureScope: scope, designChangeSessionId: row.designChangeSessionId, status: row.status, unitRevisionIds: row.unitRevisionIds as string[], membershipRevisionIds: row.membershipRevisionIds as string[], mappingRevisionIds: row.mappingRevisionIds as string[], evidenceRefs: row.evidenceRefs as string[], contentDigest: row.contentDigest, idempotent, createdAt: row.createdAt.toISOString() };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sameIds(left: string[], right: string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}
