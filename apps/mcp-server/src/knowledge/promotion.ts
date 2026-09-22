import {
  changeSetDigest,
  contentDigest,
  hasBilingualCandidateContent,
  relationshipOntology,
  type ArchitectureScopeRef,
  type AssetType,
  type KnowledgeAssertion,
  type KnowledgePromotionReceipt,
  type KnowledgeReconciliationResult,
  type RelationshipCode,
  type ReviewBundle,
  type ReviewCoverage
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
import { PrismaRelationshipRepository, type RelationshipCommandRepository } from "../relationships/repository";
import { assessReviewCandidates } from "./risk-policy";

const factAssetTypes = Object.freeze({
  "domain-concept": "domain",
  "business-rule": "businessRule",
  "api-contract": "api",
  "event-contract": "event",
  "data-model": "dataModel",
  "state-machine": "stateMachine",
  "architecture-decision": "adr",
  integration: "integration",
  quality: "quality",
  observability: "observability",
  "service-feature": "serviceFeature",
  "functional-feature": "functionalFeature",
  proposal: "proposal",
  "context-pack": "contextPack",
  evidence: "evidence"
} satisfies Record<string, AssetType>);

const typedRelationshipFactType = "typed-relationship";
const promotionEventType = "KNOWLEDGE_CANDIDATES_PROMOTED";
const reconciliationEventType = "KNOWLEDGE_BASELINE_RECONCILED";

export interface PromoteKnowledgeCandidatesInput {
  architectureScope: ArchitectureScopeRef;
  promotionDecisionId: string;
  streamId: string;
}

export interface ReconcileKnowledgeBaselineInput {
  architectureScope: ArchitectureScopeRef;
  promotionReceiptId: string;
}

export interface PromotionAssetRevision {
  id: string;
  assetType: AssetType;
  semanticIdentity: string;
  revisionDigest: string;
  name: string;
  description: string;
  domainId?: string;
  payload: Record<string, unknown>;
}

export interface PromotionRelationshipRevision {
  assertionId: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  relationType: RelationshipCode;
  description: string;
}

interface RelationshipEndpoint {
  semanticIdentity?: string;
  assetId?: string;
  assetType?: AssetType;
}

interface MaterializedEndpoint {
  assetId: string;
  assetType: AssetType;
}

interface PromotionEventPayload {
  receipt: KnowledgePromotionReceipt;
}

export function mapKnowledgeAssertionForPromotion(assertion: KnowledgeAssertion, scope: ArchitectureScopeRef): PromotionAssetRevision | PromotionRelationshipRevision {
  assertAssertionScope(assertion, scope);
  assertHumanFacingContent(assertion);
  if (assertion.factType === typedRelationshipFactType) return mapRelationship(assertion);
  const assetType = factAssetTypes[assertion.factType as keyof typeof factAssetTypes];
  if (!assetType) throw new Error(`PROMOTION_MAPPING_UNSUPPORTED:${assertion.factType}`);

  const canonical = record(assertion.value.canonicalContent, "PROMOTION_CANONICAL_CONTENT_REQUIRED");
  const localized = record(assertion.value.localizedContent, "PROMOTION_LOCALIZED_CONTENT_REQUIRED");
  const chinese = record(localized.zh, "PROMOTION_CHINESE_CONTENT_REQUIRED");
  const revisionDigest = candidateRevisionDigest(assertion, canonical, chinese);
  const id = `knowledge-asset:${assetType}:${contentDigest({ semanticIdentity: assertion.semanticIdentity, revisionDigest })}`;
  const name = preferredText(canonical, ["name", "title", "summary"]) ?? assertion.semanticIdentity;
  const description = preferredText(canonical, ["description", "summary", "decision", "action"]) ?? name;
  const chineseName = preferredText(chinese, ["name", "title", "summary"])!;
  const chineseDescription = preferredText(chinese, ["description", "summary", "decision", "action"]) ?? chineseName;
  const now = assertion.updatedAt;
  const payload = {
    ...canonical,
    id,
    name,
    description,
    code: stringValue(canonical.code) ?? assertion.semanticIdentity,
    domainId: assertion.domainCluster,
    architectureScope: scope,
    localizedContent: { zh: { ...chinese, name: chineseName, description: chineseDescription } },
    knowledgeRevision: {
      sourceAssertionId: assertion.id,
      semanticIdentity: assertion.semanticIdentity,
      factType: assertion.factType,
      revisionDigest,
      evidenceRefs: sortedUnique(assertion.evidenceRefs),
      sourceObservationIds: sortedUnique(assertion.sourceObservationIds)
    },
    createdAt: now,
    updatedAt: now
  };
  return { id, assetType, semanticIdentity: assertion.semanticIdentity, revisionDigest, name, description, domainId: assertion.domainCluster, payload };
}

export function promotionInputDigest(input: {
  architectureScope: ArchitectureScopeRef;
  promotionDecisionId: string;
  reviewBundleDigest: string;
  scanSessionId: string;
  scanSessionDigest: string;
  streamId: string;
  assertionDigests: Array<{ id: string; digest: string }>;
  identityCandidateIds: string[];
}): string {
  return contentDigest({
    ...input,
    assertionDigests: [...input.assertionDigests].sort((a, b) => a.id.localeCompare(b.id)),
    identityCandidateIds: sortedUnique(input.identityCandidateIds)
  });
}

export async function promoteKnowledgeCandidates(input: PromoteKnowledgeCandidatesInput): Promise<KnowledgePromotionReceipt> {
  const actor = writableActor();
  const scope = resolveWritableScope(actor, input.architectureScope);
  if (!input.promotionDecisionId?.trim() || !input.streamId?.trim()) throw new Error("PROMOTION_IDENTITY_REQUIRED");
  await ensureMcpPersistenceSchema();

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `knowledge-promotion:${scope.applicationServiceId}:${scope.scopePath}:${input.promotionDecisionId}`);
      await tx.$executeRawUnsafe(
        `SELECT 1 FROM "KnowledgePromotionDecision" WHERE "applicationServiceId" = $1 AND "scopePath" = $2 AND id = $3 FOR UPDATE`,
        scope.applicationServiceId,
        scope.scopePath,
        input.promotionDecisionId
      );
      const decision = await tx.knowledgePromotionDecision.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.promotionDecisionId } } });
      if (!decision || decision.decision !== "APPROVE") throw new Error("PROMOTION_DECISION_NOT_APPROVED");
      await tx.$executeRawUnsafe(
        `SELECT 1 FROM "KnowledgeReviewBundle" WHERE "applicationServiceId" = $1 AND "scopePath" = $2 AND id = $3 FOR UPDATE`,
        scope.applicationServiceId,
        scope.scopePath,
        decision.reviewBundleId
      );
      const bundleRow = await tx.knowledgeReviewBundle.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: decision.reviewBundleId } } });
      if (!bundleRow) throw new Error("REVIEW_BUNDLE_NOT_FOUND");
      const bundle = reviewBundleFromRow(bundleRow);
      if (bundle.status !== "APPROVED" || !bundle.coverage.complete || bundle.blockingIssues.length > 0) throw new Error("PROMOTION_REVIEW_NOT_APPROVED");
      if (bundle.designChangeSessionId !== decision.designChangeSessionId) throw new Error("PROMOTION_SESSION_MISMATCH");

      const assertionIds = sortedUnique(decision.approvedAssertionIds as string[]);
      const identityCandidateIds = sortedUnique(decision.approvedIdentityCandidateIds as string[]);
      const assertionRows = await tx.knowledgeAssertion.findMany({ where: { ...scope, id: { in: assertionIds } }, orderBy: { id: "asc" } });
      if (assertionRows.length !== assertionIds.length) throw new Error("PROMOTION_ASSERTION_SCOPE_MISMATCH");
      const assertions = assertionRows.map(assertionFromRow);
      if (assertions.some((assertion) => assertion.status !== "ACCEPTED")) throw new Error("PROMOTION_ASSERTION_NOT_ACCEPTED");
      assertStoredDecisionApprovalPolicy(bundle, assertions, decision.actorId);

      const identityRows = await tx.identityCandidate.findMany({ where: { ...scope, id: { in: identityCandidateIds } } });
      if (identityRows.length !== identityCandidateIds.length || identityRows.some((candidate) => candidate.decision !== "ACCEPTED")) throw new Error("PROMOTION_IDENTITY_NOT_ACCEPTED");
      const stream = await tx.workingStream.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } } });
      if (!stream || stream.status !== "ACTIVE") throw new Error("WORKING_STREAM_NOT_ACTIVE");

      const scanSessionId = singleScanSession(assertions);
      const scanSession = await tx.knowledgeScanSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: scanSessionId } } });
      if (!scanSession || scanSession.designChangeSessionId !== decision.designChangeSessionId) throw new Error("PROMOTION_SCAN_SESSION_SCOPE_MISMATCH");
      if (scanSession.status !== "READY_FOR_ANALYSIS" || !scanSession.finalizationDigest) throw new Error("PROMOTION_SCAN_SESSION_NOT_FINALIZED");
      await assertSourceObservations(tx, scope, scanSession.id, assertions);

      const sourceDigest = promotionInputDigest({
        architectureScope: scope,
        promotionDecisionId: decision.id,
        reviewBundleDigest: bundle.digest,
        scanSessionId: scanSession.id,
        scanSessionDigest: scanSession.finalizationDigest,
        streamId: input.streamId,
        assertionDigests: assertions.map((assertion) => ({ id: assertion.id, digest: candidateRevisionDigest(assertion) })),
        identityCandidateIds
      });
      const priorReceipt = await tx.knowledgePromotionReceipt.findFirst({ where: { ...scope, promotionDecisionId: decision.id } });
      if (priorReceipt) {
        if (priorReceipt.sourceDigest !== sourceDigest) throw new Error("PROMOTION_IDEMPOTENCY_CONFLICT");
        return loadReceiptInTransaction(tx, scope, priorReceipt.id, true);
      }

      const mapped = assertions.map((assertion) => mapKnowledgeAssertionForPromotion(assertion, scope));
      const assetRevisions = mapped.filter(isAssetRevision);
      const relationshipRevisions = mapped.filter(isRelationshipRevision);
      if (assetRevisions.length === 0 && relationshipRevisions.length === 0) throw new Error("PROMOTION_TARGETS_REQUIRED");

      const evidenceRefs = sortedUnique([
        ...(decision.evidenceRefs as string[]),
        ...(bundle.evidenceRefs as string[]),
        ...assertions.flatMap((assertion) => assertion.evidenceRefs),
        `scan-session:${scanSession.id}:${scanSession.finalizationDigest}`
      ]);
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
          correlationId: `knowledge-promotion:${decision.id}`,
          idempotencyKey: `knowledge-promotion:${decision.id}:${revision.assertionId}`,
          source: { identity: endpointIdentity(scope, source) },
          target: { identity: endpointIdentity(scope, target) },
          relationType: revision.relationType,
          relationshipSource: "knowledge-promotion",
          sourceReference: `knowledge-promotion:${decision.id}:${revision.assertionId}`,
          confidence: assertionRows.find((row) => row.id === revision.assertionId)?.confidence ?? 1,
          metadata: { promotionDecisionId: decision.id, assertionId: revision.assertionId, evidenceRefs }
        });
        if (!commandReceipt.eventId) throw new Error("PROMOTION_RELATIONSHIP_EVENT_REQUIRED");
        await tx.assetLink.create({
          data: {
            id: commandReceipt.eventId,
            sourceType: source.assetType,
            sourceId: source.assetId,
            targetType: target.assetType,
            targetId: target.assetId,
            relationType: revision.relationType,
            description: revision.description,
            ...scope
          }
        });
        relationshipRevisionIds.push(commandReceipt.eventId);
      }

      const uniqueAssetRevisionIds = sortedUnique(assetRevisionIds);
      const uniqueRelationshipRevisionIds = sortedUnique(relationshipRevisionIds);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `knowledge-changeset:${scope.applicationServiceId}:${scope.scopePath}:${input.streamId}`);
      const previous = await tx.knowledgeChangeSet.findFirst({ where: { ...scope, streamId: input.streamId }, orderBy: { sequence: "desc" } });
      const sequence = Number(previous?.sequence ?? 0n) + 1;
      const changeSetId = `knowledge-changeset:${contentDigest({ promotionDecisionId: decision.id, sourceDigest })}`;
      const digest = changeSetDigest({ architectureScope: scope, streamId: input.streamId, sequence, assetRevisionIds: uniqueAssetRevisionIds, relationshipRevisionIds: uniqueRelationshipRevisionIds, architectureFactRevisionIds: [], evidenceRefs });
      await tx.knowledgeChangeSet.create({
        data: { ...scope, id: changeSetId, streamId: input.streamId, sequence, status: "COMMITTED", assetRevisionIds: uniqueAssetRevisionIds, relationshipRevisionIds: uniqueRelationshipRevisionIds, architectureFactRevisionIds: [], evidenceRefs, digest, promotionDecisionId: decision.id, committedAt: new Date() }
      });
      await tx.workingStream.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.streamId } }, data: { headChangeSetId: changeSetId } });
      await tx.knowledgeAssertion.updateMany({ where: { ...scope, id: { in: assertionIds } }, data: { status: "ACCEPTED", changeSetId } });

      const relationshipVersion = (await repository.currentGraphVersion(relationshipScope)).toString();
      const receiptId = `knowledge-promotion:${decision.id}`;
      const receiptRow = await tx.knowledgePromotionReceipt.create({ data: { ...scope, id: receiptId, promotionDecisionId: decision.id, sourceDigest, assetRevisionIds: uniqueAssetRevisionIds, relationshipRevisionIds: uniqueRelationshipRevisionIds, architectureFactRevisionIds: [] } });
      const receipt: KnowledgePromotionReceipt = {
        id: receiptId,
        architectureScope: scope,
        promotionDecisionId: decision.id,
        reviewBundleId: bundle.id,
        scanSessionId: scanSession.id,
        scanSessionDigest: scanSession.finalizationDigest,
        sourceDigest,
        streamId: input.streamId,
        changeSetId,
        changeSetSequence: sequence,
        assetRevisionIds: uniqueAssetRevisionIds,
        relationshipRevisionIds: uniqueRelationshipRevisionIds,
        architectureFactRevisionIds: [],
        evidenceRefs,
        relationshipVersion,
        idempotent: false,
        createdAt: receiptRow.createdAt.toISOString()
      };
      await tx.federationOutbox.create({ data: { ...scope, eventType: promotionEventType, payload: jsonValue({ receipt }), idempotencyKey: promotionEventKey(receiptId), status: "PENDING", designChangeSessionId: decision.designChangeSessionId } });
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (isGovernedPromotionError(message)) throw error;
    throw new Error(`PROMOTION_TRANSACTION_FAILED:${message}`, { cause: error });
  }
}

export async function reconcileKnowledgeBaseline(input: ReconcileKnowledgeBaselineInput): Promise<KnowledgeReconciliationResult> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const receipt = await loadPromotionReceipt(scope, input.promotionReceiptId);
  const relationshipScope = configuredRelationshipScope(scope);
  const [changeSet, assets, events, links, outboxes, scanSession, currentGraphVersion] = await Promise.all([
    prisma.knowledgeChangeSet.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: receipt.changeSetId } } }),
    prisma.designAsset.findMany({ where: { ...scope, id: { in: receipt.assetRevisionIds } }, select: { id: true } }),
    prisma.relationshipEvent.findMany({ where: { ...relationshipScope, dbId: { in: receipt.relationshipRevisionIds } }, select: { dbId: true, graphVersion: true } }),
    prisma.assetLink.findMany({ where: { ...scope, id: { in: receipt.relationshipRevisionIds } }, select: { id: true } }),
    prisma.relationshipOutbox.findMany({ where: { ...relationshipScope, relationshipEventId: { in: receipt.relationshipRevisionIds } }, select: { relationshipEventId: true } }),
    prisma.knowledgeScanSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: receipt.scanSessionId } } }),
    new PrismaRelationshipRepository(prisma).currentGraphVersion(relationshipScope)
  ]);
  const issues: string[] = [];
  const changeSetPromotionDecisionId = changeSet?.promotionDecisionId ?? null;
  const receiptPromotionDecisionId = receipt.promotionDecisionId ?? null;
  if (!changeSet || changeSet.status !== "COMMITTED" || changeSetPromotionDecisionId !== receiptPromotionDecisionId) issues.push("RECONCILIATION_CHANGESET_MISMATCH");
  if (!sameSet(assets.map((asset) => asset.id), receipt.assetRevisionIds)) issues.push("RECONCILIATION_ASSET_REVISIONS_MISMATCH");
  if (!sameSet(events.map((event) => event.dbId), receipt.relationshipRevisionIds)) issues.push("RECONCILIATION_RELATIONSHIP_EVENTS_MISMATCH");
  if (!sameSet(links.map((link) => link.id), receipt.relationshipRevisionIds)) issues.push("RECONCILIATION_TYPED_LINKS_MISMATCH");
  if (!sameSet(outboxes.map((outbox) => outbox.relationshipEventId), receipt.relationshipRevisionIds)) issues.push("RECONCILIATION_RELATIONSHIP_OUTBOX_MISMATCH");
  if (!changeSet || !sameSet(changeSet.assetRevisionIds as string[], receipt.assetRevisionIds) || !sameSet(changeSet.relationshipRevisionIds as string[], receipt.relationshipRevisionIds) || !sameSet(changeSet.architectureFactRevisionIds as string[], receipt.architectureFactRevisionIds) || !sameSet(changeSet.evidenceRefs as string[], receipt.evidenceRefs)) issues.push("RECONCILIATION_CHANGESET_CONTENT_MISMATCH");
  if (!scanSession || scanSession.finalizationDigest !== receipt.scanSessionDigest) issues.push("RECONCILIATION_SCAN_SESSION_DIGEST_MISMATCH");
  const relationshipVersion = currentGraphVersion.toString();
  if (relationshipVersion !== receipt.relationshipVersion) issues.push("RECONCILIATION_RELATIONSHIP_VERSION_MISMATCH");
  const status = issues.length === 0 ? "CONVERGED" : "DRIFTED";
  const reconciledAt = new Date().toISOString();
  const stateDigest = contentDigest({ receiptId: receipt.id, changeSet: changeSet?.digest, assets: assets.map((row) => row.id).sort(), events: events.map((row) => row.dbId).sort(), links: links.map((row) => row.id).sort(), outboxes: outboxes.map((row) => row.relationshipEventId).sort(), scanSessionDigest: scanSession?.finalizationDigest, issues });
  const result: KnowledgeReconciliationResult = {
    id: `knowledge-reconciliation:${receipt.id}:${stateDigest}`,
    architectureScope: scope,
    promotionReceiptId: receipt.id,
    promotionSourceDigest: receipt.sourceDigest,
    scanSessionId: receipt.scanSessionId,
    scanSessionDigest: receipt.scanSessionDigest,
    changeSetId: receipt.changeSetId,
    status,
    issues,
    assetRevisionIds: receipt.assetRevisionIds,
    relationshipRevisionIds: receipt.relationshipRevisionIds,
    architectureFactRevisionIds: receipt.architectureFactRevisionIds,
    evidenceRefs: receipt.evidenceRefs,
    relationshipVersion: receipt.relationshipVersion,
    reconciledAt
  };
  await prisma.federationOutbox.upsert({
    where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: result.id } },
    create: { ...scope, eventType: reconciliationEventType, payload: jsonValue({ result }), idempotencyKey: result.id, status: "PENDING" },
    update: {}
  });
  return result;
}

export async function loadPromotionReceipt(scope: ArchitectureScopeRef, receiptId: string): Promise<KnowledgePromotionReceipt> {
  const row = await prisma.knowledgePromotionReceipt.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: receiptId } } });
  if (!row) throw new Error("PROMOTION_RECEIPT_NOT_FOUND");
  return loadReceiptFromEvent(scope, row.id, false);
}

export async function loadConvergedReconciliation(scope: ArchitectureScopeRef, receiptId: string): Promise<KnowledgeReconciliationResult> {
  const event = await prisma.federationOutbox.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: receiptId } } });
  const result = event?.eventType === reconciliationEventType ? reconciliationFromPayload(event.payload) : undefined;
  if (!result || result.status !== "CONVERGED") throw new Error("BASELINE_RECONCILIATION_RECEIPT_NOT_CONVERGED");
  assertScope(result.architectureScope, scope);
  return result;
}

export async function loadReceiptInTransaction(tx: Prisma.TransactionClient, scope: ArchitectureScopeRef, receiptId: string, idempotent: boolean): Promise<KnowledgePromotionReceipt> {
  const event = await tx.federationOutbox.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: promotionEventKey(receiptId) } } });
  const receipt = event?.eventType === promotionEventType ? promotionReceiptFromPayload(event.payload) : undefined;
  if (!receipt) throw new Error("PROMOTION_RECEIPT_INCOMPLETE");
  return { ...receipt, idempotent };
}

async function loadReceiptFromEvent(scope: ArchitectureScopeRef, receiptId: string, idempotent: boolean): Promise<KnowledgePromotionReceipt> {
  const event = await prisma.federationOutbox.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: promotionEventKey(receiptId) } } });
  const receipt = event?.eventType === promotionEventType ? promotionReceiptFromPayload(event.payload) : undefined;
  if (!receipt) throw new Error("PROMOTION_RECEIPT_INCOMPLETE");
  assertScope(receipt.architectureScope, scope);
  return { ...receipt, idempotent };
}

function mapRelationship(assertion: KnowledgeAssertion): PromotionRelationshipRevision {
  const canonical = record(assertion.value.canonicalContent, "PROMOTION_CANONICAL_CONTENT_REQUIRED");
  const source = relationshipEndpoint(canonical.source, "SOURCE");
  const target = relationshipEndpoint(canonical.target, "TARGET");
  const relationType = stringValue(canonical.relationType)?.toUpperCase() as RelationshipCode | undefined;
  if (!relationType || !relationshipOntology.has(relationType)) throw new Error("PROMOTION_RELATIONSHIP_TYPE_UNSUPPORTED");
  return { assertionId: assertion.id, source, target, relationType, description: preferredText(canonical, ["description", "summary"]) ?? `${relationType} relationship` };
}

function relationshipEndpoint(value: unknown, label: string): RelationshipEndpoint {
  const endpoint = record(value, `PROMOTION_RELATIONSHIP_${label}_REQUIRED`);
  const semanticIdentity = stringValue(endpoint.semanticIdentity);
  const assetId = stringValue(endpoint.assetId);
  const assetType = stringValue(endpoint.assetType) as AssetType | undefined;
  if (!semanticIdentity && !assetId) throw new Error(`PROMOTION_RELATIONSHIP_${label}_IDENTITY_REQUIRED`);
  return { semanticIdentity, assetId, assetType };
}

export async function resolveEndpoint(tx: Prisma.TransactionClient, scope: ArchitectureScopeRef, promoted: Map<string, MaterializedEndpoint>, endpoint: RelationshipEndpoint): Promise<MaterializedEndpoint> {
  if (endpoint.semanticIdentity && promoted.has(endpoint.semanticIdentity)) return promoted.get(endpoint.semanticIdentity)!;
  const assetId = endpoint.assetId;
  if (!assetId) throw new Error("PROMOTION_RELATIONSHIP_ENDPOINT_NOT_FOUND");
  const row = await tx.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: assetId } } });
  if (!row) throw new Error("PROMOTION_RELATIONSHIP_ENDPOINT_NOT_FOUND");
  if (endpoint.assetType && row.type !== endpoint.assetType) throw new Error("PROMOTION_RELATIONSHIP_ENDPOINT_TYPE_MISMATCH");
  return { assetId: row.id, assetType: row.type as AssetType };
}

export async function persistImmutableAsset(tx: Prisma.TransactionClient, scope: ArchitectureScopeRef, revision: PromotionAssetRevision): Promise<void> {
  const existing = await tx.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: revision.id } } });
  if (existing) {
    const payload = parseJsonRecord(existing.payload);
    if (existing.type !== revision.assetType || nestedString(payload, "knowledgeRevision", "revisionDigest") !== revision.revisionDigest) throw new Error("PROMOTION_ASSET_REVISION_CONFLICT");
    return;
  }
  await tx.designAsset.create({
    data: { id: revision.id, type: revision.assetType, name: revision.name, code: stringValue(revision.payload.code), description: revision.description, domainId: revision.domainId ?? null, ...scope, payload: JSON.stringify(revision.payload) }
  });
}

export function evidenceRevision(evidenceRef: string, scope: ArchitectureScopeRef, timestamp: string): PromotionAssetRevision {
  const revisionDigest = contentDigest({ evidenceRef });
  const id = `knowledge-evidence:${revisionDigest}`;
  const payload = {
    id,
    name: `Evidence ${evidenceRef}`,
    description: `Evidence retained from ${evidenceRef}.`,
    decisionId: "knowledge-promotion",
    command: "legacy-baseline-evidence",
    result: evidenceRef,
    status: "passed",
    recordedAt: timestamp,
    architectureScope: scope,
    localizedContent: { zh: { name: `证据 ${evidenceRef}`, description: `保留自 ${evidenceRef} 的证据。`, command: "存量基线证据", result: evidenceRef } },
    knowledgeRevision: { semanticIdentity: `evidence:${evidenceRef}`, factType: "evidence", revisionDigest, evidenceRefs: [evidenceRef], sourceObservationIds: [] },
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return { id, assetType: "evidence", semanticIdentity: `evidence:${evidenceRef}`, revisionDigest, name: String(payload.name), description: String(payload.description), payload };
}

async function assertSourceObservations(tx: Prisma.TransactionClient, scope: ArchitectureScopeRef, scanSessionId: string, assertions: KnowledgeAssertion[]): Promise<void> {
  const ids = sortedUnique(assertions.flatMap((assertion) => assertion.sourceObservationIds));
  if (ids.length === 0) throw new Error("PROMOTION_EVIDENCE_REQUIRED");
  const rows = await tx.sourceObservation.findMany({ where: { ...scope, id: { in: ids }, payload: { path: ["scanSessionId"], equals: scanSessionId } }, select: { id: true } });
  if (rows.length !== ids.length) throw new Error("PROMOTION_SOURCE_OBSERVATION_MISMATCH");
}

export async function ensureRootNode(repository: PrismaRelationshipRepository, scope: ReturnType<typeof configuredRelationshipScope>, endpoint: MaterializedEndpoint): Promise<void> {
  const identity = { nodeType: endpoint.assetType, logicalId: endpoint.assetId };
  if (await repository.findNode(scope, identity)) return;
  await repository.upsertNode(scope, { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, ...identity, rootAssetType: endpoint.assetType, rootAssetId: endpoint.assetId, nodePath: `${endpoint.assetType}/${endpoint.assetId}`, displayName: endpoint.assetId, metadata: { source: "knowledge-promotion" } });
}

export function endpointIdentity(scope: ArchitectureScopeRef, endpoint: MaterializedEndpoint) {
  return { ...scope, nodeType: endpoint.assetType, logicalId: endpoint.assetId, rootAssetType: endpoint.assetType, rootAssetId: endpoint.assetId };
}

function singleScanSession(assertions: KnowledgeAssertion[]): string {
  const sessionIds = sortedUnique(assertions.map((assertion) => nestedString(assertion.value, "agentProvenance", "sessionId") ?? "").filter(Boolean));
  if (sessionIds.length !== 1) throw new Error("PROMOTION_SCAN_SESSION_AMBIGUOUS");
  return sessionIds[0]!;
}

function candidateRevisionDigest(assertion: KnowledgeAssertion, canonical?: Record<string, unknown>, chinese?: Record<string, unknown>): string {
  return contentDigest({
    semanticIdentity: assertion.semanticIdentity,
    factType: assertion.factType,
    canonical: canonical ?? assertion.value.canonicalContent,
    chinese: chinese ?? record(assertion.value.localizedContent, "PROMOTION_LOCALIZED_CONTENT_REQUIRED").zh
  });
}

function assertHumanFacingContent(assertion: KnowledgeAssertion): void {
  if (!hasBilingualCandidateContent(assertion.value)) throw new Error(`PROMOTION_BILINGUAL_CONTENT_REQUIRED:${assertion.id}`);
  if (assertion.evidenceRefs.length === 0 || assertion.sourceObservationIds.length === 0) throw new Error(`PROMOTION_EVIDENCE_REQUIRED:${assertion.id}`);
  if (assertion.unresolvedQuestions.length > 0) throw new Error(`PROMOTION_UNRESOLVED_QUESTIONS:${assertion.id}`);
}

export function assertStoredDecisionApprovalPolicy(bundle: ReviewBundle, assertions: KnowledgeAssertion[], decisionActorId: string): void {
  const governed = assertions.filter((assertion) => Boolean(assertion.generatedByActorId));
  const assessment = assessReviewCandidates(governed);
  if (assessment.blockingIssues.length > 0) throw new Error(`CANDIDATE_REVIEW_BLOCKED:${assessment.blockingIssues.join(",")}`);
  if (assessment.riskTier !== bundle.riskTier) throw new Error("REVIEW_BUNDLE_RISK_MISMATCH");
  if (bundle.riskTier === "T1" && governed.some((assertion) => assertion.generatedByActorId === decisionActorId)) throw new Error("REVIEW_ACTOR_SEPARATION_REQUIRED");
}

function assertAssertionScope(assertion: KnowledgeAssertion, scope: ArchitectureScopeRef): void {
  assertScope(assertion.architectureScope, scope);
}

function assertScope(actual: ArchitectureScopeRef, expected: ArchitectureScopeRef): void {
  if (actual.applicationServiceId !== expected.applicationServiceId || actual.scopePath !== expected.scopePath) throw new Error("SCOPE_MISMATCH");
}

export function assertionFromRow(row: any): KnowledgeAssertion {
  return { id: row.id, semanticIdentity: row.semanticIdentity, factType: row.factType, layer: row.layer, aspect: row.aspect, value: row.value as Record<string, unknown>, status: row.status, confidence: row.confidence, matchingEvidence: row.matchingEvidence as string[], counterEvidence: row.counterEvidence as string[], unresolvedQuestions: row.unresolvedQuestions as string[], evidenceRefs: row.evidenceRefs as string[], sourceObservationIds: row.sourceObservationIds as string[], extractorId: row.extractorId, riskTier: row.riskTier, domainCluster: row.domainCluster ?? undefined, generatedByActorId: row.generatedByActorId ?? undefined, revision: row.revision, changeSetId: row.changeSetId ?? undefined, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function reviewBundleFromRow(row: any): ReviewBundle {
  return { id: row.id, designChangeSessionId: row.designChangeSessionId, status: row.status, riskTier: row.riskTier, assertionIds: row.assertionIds as string[], identityCandidateIds: row.identityCandidateIds as string[], architectureFactRevisionIds: (row.architectureFactRevisionIds ?? []) as string[], evidenceRefs: row.evidenceRefs as string[], coverage: row.coverage as ReviewCoverage, blockingIssues: row.blockingIssues as string[], digest: row.digest, createdBy: row.createdBy, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function promotionReceiptFromPayload(value: Prisma.JsonValue): KnowledgePromotionReceipt | undefined {
  const payload = jsonRecord(value);
  const receipt = jsonRecord(payload.receipt);
  return typeof receipt.id === "string" && typeof receipt.sourceDigest === "string" ? { ...receipt, architectureFactRevisionIds: Array.isArray(receipt.architectureFactRevisionIds) ? receipt.architectureFactRevisionIds : [] } as unknown as KnowledgePromotionReceipt : undefined;
}

function reconciliationFromPayload(value: Prisma.JsonValue): KnowledgeReconciliationResult | undefined {
  const payload = jsonRecord(value);
  const result = jsonRecord(payload.result);
  return typeof result.id === "string" && typeof result.status === "string" ? { ...result, architectureFactRevisionIds: Array.isArray(result.architectureFactRevisionIds) ? result.architectureFactRevisionIds : [] } as unknown as KnowledgeReconciliationResult : undefined;
}

export function promotionEventKey(receiptId: string): string {
  return `knowledge-promotion-receipt:${receiptId}`;
}

export function isAssetRevision(value: PromotionAssetRevision | PromotionRelationshipRevision): value is PromotionAssetRevision {
  return "assetType" in value;
}

export function isRelationshipRevision(value: PromotionAssetRevision | PromotionRelationshipRevision): value is PromotionRelationshipRevision {
  return "relationType" in value;
}

function record(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try { return record(JSON.parse(value), "PROMOTION_ASSET_PAYLOAD_INVALID"); } catch { throw new Error("PROMOTION_ASSET_PAYLOAD_INVALID"); }
}

function nestedString(value: Record<string, unknown>, parent: string, field: string): string | undefined {
  const nested = value[parent];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? stringValue((nested as Record<string, unknown>)[field]) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function preferredText(value: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const candidate = stringValue(value[field]);
    if (candidate) return candidate;
  }
  return undefined;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isGovernedPromotionError(message: string): boolean {
  return /^(PROMOTION_|REVIEW_|CANDIDATE_|SCOPE_|WORKING_STREAM_|DESIGN_CHANGE_SESSION_)/u.test(message);
}

export class PromotionTransactionRelationshipRepository extends PrismaRelationshipRepository {
  override async transaction<T>(operation: (repository: RelationshipCommandRepository) => Promise<T>): Promise<T> {
    return operation(this);
  }
}
