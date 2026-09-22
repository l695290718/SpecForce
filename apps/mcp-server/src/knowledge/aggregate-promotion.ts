import {
  changeSetDigest,
  contentDigest,
  promotionReviewSetDigest,
  reviewSetCoverage,
  type ArchitectureScopeRef,
  type KnowledgePromotionReceipt,
  type KnowledgeReviewSetCoverage,
  type KnowledgeReviewSetPromotionInput,
  type ReviewBundle
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import {
  configuredRelationshipScope,
  ensureMcpPersistenceSchema,
  prisma,
  resolveWritableScope,
  writableActor
} from "../persistence";
import { createTrustedRelationshipExecutionContext, RelationshipCommandService } from "../relationships/command-service";
import { PrismaRelationshipRepository } from "../relationships/repository";
import {
  assertStoredDecisionApprovalPolicy,
  assertionFromRow,
  ensureRootNode,
  endpointIdentity,
  evidenceRevision,
  isAssetRevision,
  isRelationshipRevision,
  jsonValue,
  loadReceiptInTransaction,
  mapKnowledgeAssertionForPromotion,
  persistImmutableAsset,
  promotionEventKey,
  resolveEndpoint,
  reviewBundleFromRow,
  type PromotionAssetRevision,
  type PromotionRelationshipRevision,
  PromotionTransactionRelationshipRepository
} from "./promotion";

const promotionEventType = "KNOWLEDGE_CANDIDATES_PROMOTED";

export interface PromoteKnowledgeReviewSetInput {
  architectureScope: ArchitectureScopeRef;
  reviewSetId: string;
  scanSessionId: string;
  designChangeSessionId: string;
  streamId: string;
  expectedReviewBundleIds: string[];
  promotionDecisionIds: string[];
  evidenceRefs: string[];
}

export async function promoteKnowledgeReviewSet(input: PromoteKnowledgeReviewSetInput): Promise<KnowledgePromotionReceipt> {
  const actor = writableActor();
  const scope = resolveWritableScope(actor, input.architectureScope);
  validateInput(input);
  await ensureMcpPersistenceSchema();

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `knowledge-review-set:${scope.applicationServiceId}:${scope.scopePath}:${input.reviewSetId}`
      );

      const expectedBundleIds = sortedUnique(input.expectedReviewBundleIds);
      const decisionIds = sortedUnique(input.promotionDecisionIds);
      const [bundleRows, decisionRows, stream, scanSession, sourceRows] = await Promise.all([
        tx.knowledgeReviewBundle.findMany({ where: { ...scope, id: { in: expectedBundleIds } }, orderBy: { id: "asc" } }),
        tx.knowledgePromotionDecision.findMany({ where: { ...scope, id: { in: decisionIds } }, orderBy: { id: "asc" } }),
        tx.workingStream.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } } }),
        tx.knowledgeScanSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.scanSessionId } } }),
        tx.sourceObservation.findMany({
          where: { ...scope, payload: { path: ["scanSessionId"], equals: input.scanSessionId } },
          select: { id: true },
          orderBy: { id: "asc" }
        })
      ]);

      if (bundleRows.length !== expectedBundleIds.length) throw new Error("REVIEW_SET_BUNDLE_COVERAGE_MISMATCH");
      if (decisionRows.length !== decisionIds.length) throw new Error("REVIEW_SET_DECISION_COVERAGE_MISMATCH");
      if (!stream || stream.status !== "ACTIVE") throw new Error("WORKING_STREAM_NOT_ACTIVE");
      if (!scanSession || scanSession.designChangeSessionId !== input.designChangeSessionId) throw new Error("PROMOTION_SCAN_SESSION_SCOPE_MISMATCH");
      if (scanSession.status !== "READY_FOR_ANALYSIS" || !scanSession.finalizationDigest) throw new Error("PROMOTION_SCAN_SESSION_NOT_FINALIZED");
      if (scanSession.observationCount !== sourceRows.length) throw new Error("REVIEW_SET_SOURCE_COVERAGE_INCOMPLETE");

      const bundles = bundleRows.map(reviewBundleFromRow);
      const bundleById = new Map(bundles.map((bundle) => [bundle.id, bundle]));
      const decisionsByBundle = new Map<string, typeof decisionRows[number]>();
      for (const decision of decisionRows) {
        if (decision.decision !== "APPROVE" || decision.designChangeSessionId !== input.designChangeSessionId) throw new Error("REVIEW_SET_DECISION_NOT_APPROVED");
        if (!bundleById.has(decision.reviewBundleId) || decisionsByBundle.has(decision.reviewBundleId)) throw new Error("REVIEW_SET_DECISION_COVERAGE_MISMATCH");
        decisionsByBundle.set(decision.reviewBundleId, decision);
      }
      if (decisionsByBundle.size !== bundles.length) throw new Error("REVIEW_SET_DECISION_COVERAGE_MISMATCH");
      if (sortedUnique([...decisionsByBundle.values()].map((decision) => decision.id).concat()).join("\u0000") !== decisionIds.join("\u0000")) throw new Error("REVIEW_SET_DECISION_COVERAGE_MISMATCH");

      const assertionIds = sortedUnique([...decisionsByBundle.values()].flatMap((decision) => jsonStrings(decision.approvedAssertionIds)));
      const identityCandidateIds = sortedUnique([...decisionsByBundle.values()].flatMap((decision) => jsonStrings(decision.approvedIdentityCandidateIds)));
      const rawAssertionIds = [...decisionsByBundle.values()].flatMap((decision) => jsonStrings(decision.approvedAssertionIds));
      const rawIdentityCandidateIds = [...decisionsByBundle.values()].flatMap((decision) => jsonStrings(decision.approvedIdentityCandidateIds));
      if (rawAssertionIds.length !== assertionIds.length || rawIdentityCandidateIds.length !== identityCandidateIds.length) throw new Error("REVIEW_SET_DUPLICATE_TARGET");

      for (const bundle of bundles) {
        const decision = decisionsByBundle.get(bundle.id)!;
        if (bundle.status !== "APPROVED" || !bundle.coverage.complete || bundle.blockingIssues.length > 0) throw new Error("PROMOTION_REVIEW_NOT_APPROVED");
        if (bundle.designChangeSessionId !== input.designChangeSessionId) throw new Error("PROMOTION_SESSION_MISMATCH");
        if (!sameSet(jsonStrings(decision.approvedAssertionIds), bundle.assertionIds) || !sameSet(jsonStrings(decision.approvedIdentityCandidateIds), bundle.identityCandidateIds)) throw new Error("REVIEW_SET_PARTIAL_APPROVAL");
      }

      const assertionRows = await tx.knowledgeAssertion.findMany({ where: { ...scope, id: { in: assertionIds } }, orderBy: { id: "asc" } });
      if (assertionRows.length !== assertionIds.length || assertionRows.some((assertion) => assertion.status !== "ACCEPTED")) throw new Error("PROMOTION_ASSERTION_SCOPE_MISMATCH");
      const assertions = assertionRows.map(assertionFromRow);
      for (const bundle of bundles) {
        const bundleAssertions = assertions.filter((assertion) => bundle.assertionIds.includes(assertion.id));
        assertStoredDecisionApprovalPolicy(bundle, bundleAssertions, decisionsByBundle.get(bundle.id)!.actorId);
      }

      const identityRows = await tx.identityCandidate.findMany({ where: { ...scope, id: { in: identityCandidateIds } } });
      if (identityRows.length !== identityCandidateIds.length || identityRows.some((candidate) => candidate.decision !== "ACCEPTED")) throw new Error("PROMOTION_IDENTITY_NOT_ACCEPTED");
      if (assertions.length === 0) throw new Error("PROMOTION_TARGETS_REQUIRED");
      if (assertions.some((assertion) => assertion.value.agentProvenance && typeof assertion.value.agentProvenance === "object" && (assertion.value.agentProvenance as Record<string, unknown>).sessionId !== input.scanSessionId)) throw new Error("PROMOTION_SCAN_SESSION_SCOPE_MISMATCH");

      const approvedSourceObservationIds = sortedUnique(assertions.flatMap((assertion) => assertion.sourceObservationIds));
      const coverage = reviewSetCoverage({ expected: sourceRows.map((row) => row.id), approved: approvedSourceObservationIds });
      if (!coverage.complete) throw new Error("REVIEW_SET_SOURCE_COVERAGE_INCOMPLETE");

      const evidenceRefs = sortedUnique([
        ...input.evidenceRefs,
        ...decisionsByBundleValues(decisionsByBundle).flatMap((decision) => jsonStrings(decision.evidenceRefs)),
        ...bundles.flatMap((bundle) => bundle.evidenceRefs),
        ...assertions.flatMap((assertion) => assertion.evidenceRefs),
        `scan-session:${scanSession.id}:${scanSession.finalizationDigest}`
      ]);
      const aggregateInput: KnowledgeReviewSetPromotionInput = {
        architectureScope: scope,
        reviewSetId: input.reviewSetId,
        scanSessionId: input.scanSessionId,
        designChangeSessionId: input.designChangeSessionId,
        streamId: input.streamId,
        expectedReviewBundleIds: expectedBundleIds,
        promotionDecisionIds: decisionIds,
        approvedAssertionIds: assertionIds,
        approvedIdentityCandidateIds: identityCandidateIds,
        sourceObservationIds: approvedSourceObservationIds,
        evidenceRefs
      };
      const sourceDigest = promotionReviewSetDigest(aggregateInput);
      const priorReceipt = await tx.knowledgePromotionReceipt.findFirst({ where: { ...scope, reviewSetId: input.reviewSetId } });
      if (priorReceipt) {
        if (priorReceipt.sourceDigest !== sourceDigest) throw new Error("PROMOTION_IDEMPOTENCY_CONFLICT");
        return loadReceiptInTransaction(tx, scope, priorReceipt.id, true);
      }

      const mapped = assertions.map((assertion) => mapKnowledgeAssertionForPromotion(assertion, scope));
      const assetRevisions = mapped.filter(isAssetRevision);
      const relationshipRevisions = mapped.filter(isRelationshipRevision);
      if (assetRevisions.length === 0 && relationshipRevisions.length === 0) throw new Error("PROMOTION_TARGETS_REQUIRED");
      const assetRevisionIds: string[] = [];
      for (const revision of assetRevisions) {
        await persistImmutableAsset(tx, scope, revision);
        assetRevisionIds.push(revision.id);
      }
      for (const evidenceRef of evidenceRefs) {
        const revision = evidenceRevision(evidenceRef, scope, scanSession.createdAt.toISOString());
        await persistImmutableAsset(tx, scope, revision);
        assetRevisionIds.push(revision.id);
      }

      const endpoints = new Map(assetRevisions.map((asset) => [asset.semanticIdentity, { assetId: asset.id, assetType: asset.assetType }]));
      const relationshipRevisionIds: string[] = [];
      const relationshipScope = configuredRelationshipScope(scope);
      const repository = new PromotionTransactionRelationshipRepository(tx);
      await repository.lockScope(relationshipScope);
      const relationshipCommands = new RelationshipCommandService(repository, createTrustedRelationshipExecutionContext({ enterpriseId: relationshipScope.enterpriseId, scope, actor }));
      for (const revision of relationshipRevisions) {
        const source = await resolveEndpoint(tx, scope, endpoints, revision.source);
        const target = await resolveEndpoint(tx, scope, endpoints, revision.target);
        await ensureRootNode(repository, relationshipScope, source);
        await ensureRootNode(repository, relationshipScope, target);
        const commandReceipt = await relationshipCommands.upsertRelationship({
          channel: "mcp",
          correlationId: `knowledge-review-set:${input.reviewSetId}`,
          idempotencyKey: `knowledge-review-set:${input.reviewSetId}:${revision.assertionId}`,
          source: { identity: endpointIdentity(scope, source) },
          target: { identity: endpointIdentity(scope, target) },
          relationType: revision.relationType,
          relationshipSource: "knowledge-promotion",
          sourceReference: `knowledge-review-set:${input.reviewSetId}:${revision.assertionId}`,
          confidence: assertionRows.find((row) => row.id === revision.assertionId)?.confidence ?? 1,
          metadata: { reviewSetId: input.reviewSetId, promotionDecisionIds: decisionIds, evidenceRefs }
        });
        if (!commandReceipt.eventId) throw new Error("PROMOTION_RELATIONSHIP_EVENT_REQUIRED");
        await tx.assetLink.create({ data: { id: commandReceipt.eventId, sourceType: source.assetType, sourceId: source.assetId, targetType: target.assetType, targetId: target.assetId, relationType: revision.relationType, description: revision.description, ...scope } });
        relationshipRevisionIds.push(commandReceipt.eventId);
      }

      const uniqueAssetRevisionIds = sortedUnique(assetRevisionIds);
      const uniqueRelationshipRevisionIds = sortedUnique(relationshipRevisionIds);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `knowledge-changeset:${scope.applicationServiceId}:${scope.scopePath}:${input.streamId}`);
      const previous = await tx.knowledgeChangeSet.findFirst({ where: { ...scope, streamId: input.streamId }, orderBy: { sequence: "desc" } });
      const sequence = Number(previous?.sequence ?? 0n) + 1;
      const changeSetId = `knowledge-changeset:${contentDigest({ reviewSetId: input.reviewSetId, sourceDigest })}`;
      const digest = changeSetDigest({ architectureScope: scope, streamId: input.streamId, sequence, assetRevisionIds: uniqueAssetRevisionIds, relationshipRevisionIds: uniqueRelationshipRevisionIds, architectureFactRevisionIds: [], evidenceRefs });
      await tx.knowledgeChangeSet.create({ data: { ...scope, id: changeSetId, streamId: input.streamId, sequence, status: "COMMITTED", assetRevisionIds: uniqueAssetRevisionIds, relationshipRevisionIds: uniqueRelationshipRevisionIds, architectureFactRevisionIds: [], evidenceRefs, digest, promotionDecisionId: null, committedAt: new Date() } });
      await tx.workingStream.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } }, data: { headChangeSetId: changeSetId } });
      await tx.knowledgeAssertion.updateMany({ where: { ...scope, id: { in: assertionIds } }, data: { status: "ACCEPTED", changeSetId } });

      const relationshipVersion = (await repository.currentGraphVersion(relationshipScope)).toString();
      const receiptId = `knowledge-promotion-review-set:${input.reviewSetId}`;
      const receiptRow = await tx.knowledgePromotionReceipt.create({
        data: {
          ...scope,
          id: receiptId,
          promotionDecisionId: null,
          reviewSetId: input.reviewSetId,
          reviewBundleIds: expectedBundleIds,
          promotionDecisionIds: decisionIds,
          sourceDigest,
          assetRevisionIds: uniqueAssetRevisionIds,
          relationshipRevisionIds: uniqueRelationshipRevisionIds,
          architectureFactRevisionIds: [],
          sourceObservationIds: approvedSourceObservationIds,
          coverage: jsonValue(coverage)
        }
      });
      const receipt: KnowledgePromotionReceipt = {
        id: receiptId,
        architectureScope: scope,
        reviewSetId: input.reviewSetId,
        reviewBundleIds: expectedBundleIds,
        promotionDecisionIds: decisionIds,
        scanSessionId: scanSession.id,
        scanSessionDigest: scanSession.finalizationDigest,
        sourceDigest,
        streamId: input.streamId,
        changeSetId,
        changeSetSequence: sequence,
        assetRevisionIds: uniqueAssetRevisionIds,
        relationshipRevisionIds: uniqueRelationshipRevisionIds,
        architectureFactRevisionIds: [],
        sourceObservationIds: approvedSourceObservationIds,
        coverage,
        evidenceRefs,
        relationshipVersion,
        idempotent: false,
        createdAt: receiptRow.createdAt.toISOString()
      };
      await tx.federationOutbox.create({ data: { ...scope, eventType: promotionEventType, payload: jsonValue({ receipt }), idempotencyKey: promotionEventKey(receiptId), status: "PENDING", designChangeSessionId: input.designChangeSessionId } });
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (/^(PROMOTION_|REVIEW_|SCOPE_|WORKING_STREAM_|DESIGN_CHANGE_SESSION_)/u.test(message)) throw error;
    throw new Error(`PROMOTION_TRANSACTION_FAILED:${message}`, { cause: error });
  }
}

function validateInput(input: PromoteKnowledgeReviewSetInput): void {
  if (![input.reviewSetId, input.scanSessionId, input.designChangeSessionId, input.streamId].every((value) => value?.trim())) throw new Error("REVIEW_SET_IDENTITY_REQUIRED");
  if (input.expectedReviewBundleIds.length === 0 || input.promotionDecisionIds.length === 0) throw new Error("REVIEW_SET_TARGETS_REQUIRED");
  if (new Set(input.expectedReviewBundleIds).size !== input.expectedReviewBundleIds.length) throw new Error("REVIEW_SET_DUPLICATE_BUNDLE");
  if (new Set(input.promotionDecisionIds).size !== input.promotionDecisionIds.length) throw new Error("REVIEW_SET_DUPLICATE_DECISION");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) throw new Error("PROMOTION_EVIDENCE_REQUIRED");
}

function decisionsByBundleValues(values: Map<string, { evidenceRefs: Prisma.JsonValue }>): Array<{ evidenceRefs: Prisma.JsonValue }> {
  return [...values.values()];
}

function jsonStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}
