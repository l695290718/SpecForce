import { contentDigest, evaluateObservation, hasCompleteBilingualLocalization, reconcileFacts, type ArchitectureScopeRef, type CandidateFactStatus, type ConnectorCapability, type ConnectorStatus, type DesignChangeSession, type DesignChangeSessionStatus, type FactAuthority, type FederatedFactEnvelope, type ReconciliationReport, type SourceObservation } from "@specforge/core";
import { Prisma } from "@prisma/client";
import { prisma, readableScope, resolveWritableScope, writableActor } from "../persistence";

export interface ConnectorInstance {
  id: string;
  kind: string;
  capabilities: readonly ConnectorCapability[];
  status: ConnectorStatus;
  secretReference?: string;
  architectureScope: ArchitectureScopeRef;
}

export interface FederationOutboxRecord {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: string;
  availableAt: string;
  sentAt?: string;
  attemptCount: number;
  lastError?: string;
  designChangeSessionId?: string;
  architectureScope: ArchitectureScopeRef;
}

export interface RegisterConnectorInput extends Omit<ConnectorInstance, "architectureScope"> {
  architectureScope: ArchitectureScopeRef;
}

export interface RecordObservationInput extends Omit<SourceObservation, "architectureScope" | "connectorInstanceId"> {
  connectorId: string;
  architectureScope: ArchitectureScopeRef;
  idempotencyKey: string;
}

export interface PromoteCandidateInput {
  candidateId: string;
  architectureScope: ArchitectureScopeRef;
  approvalReason: string;
}

export interface CreateDesignChangeSessionInput extends Omit<DesignChangeSession, "architectureScope" | "openedAt" | "updatedAt"> {
  architectureScope: ArchitectureScopeRef;
  openedAt?: string;
}

export interface AppendFederationOutboxInput {
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  architectureScope: ArchitectureScopeRef;
  designChangeSessionId?: string;
  availableAt?: string;
}

export interface CloseDesignChangeSessionInput {
  id: string;
  architectureScope: ArchitectureScopeRef;
  status: Extract<DesignChangeSessionStatus, "CONVERGED" | "BLOCKED">;
  verificationEvidenceRefs: string[];
  closureReason?: string;
}

export interface ReconcilePersistedScopeInput {
  architectureScope: ArchitectureScopeRef;
  relationshipDrift?: boolean;
  evidenceDrift?: boolean;
  localizationDrift?: boolean;
}

export interface ArchiveFederationOutboxInput {
  architectureScope: ArchitectureScopeRef;
  before: string;
  statuses: string[];
  limit: number;
  reason: string;
}

type FederationTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function registerConnector(input: RegisterConnectorInput): Promise<ConnectorInstance> {
  const scope = writableScope(input.architectureScope);
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", connectorLockKey(scope, input.id));
    const row = await tx.connectorInstance.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      create: { ...scope, id: input.id, kind: input.kind, capabilities: json(input.capabilities), status: input.status, secretReference: input.secretReference ?? null },
      update: { kind: input.kind, capabilities: json(input.capabilities), status: input.status, secretReference: input.secretReference ?? null }
    });
    await createOutbox(tx, {
      eventType: "FEDERATION_CONNECTOR_REGISTERED",
      payload: { connectorId: input.id, kind: input.kind, status: input.status, capabilities: input.capabilities },
      idempotencyKey: federationEventKey("FEDERATION_CONNECTOR_REGISTERED", scope, input.id),
      architectureScope: scope
    });
    return connector(row);
  });
}

export async function listConnectors(scopeInput: ArchitectureScopeRef): Promise<ConnectorInstance[]> {
  const scope = readableExactScope(scopeInput);
  return (await prisma.connectorInstance.findMany({ where: scope, orderBy: { id: "asc" } })).map(connector);
}

export async function recordObservation(input: RecordObservationInput): Promise<SourceObservation> {
  const scope = writableScope(input.architectureScope);
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", connectorLockKey(scope, input.connectorId));
    const connectorRow = await tx.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.connectorId } } });
    if (!connectorRow) {
      const connectorInAnotherScope = await tx.connectorInstance.findFirst({ where: { id: input.connectorId } });
      if (connectorInAnotherScope) throw new Error("SCOPE_MISMATCH");
      throw new Error("CONNECTOR_NOT_FOUND");
    }
    if (connectorRow.applicationServiceId !== scope.applicationServiceId || connectorRow.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
    if (connectorRow.status !== "ACTIVE") throw new Error("CONNECTOR_NOT_ACTIVE");
    if (!Array.isArray(connectorRow.capabilities) || !connectorRow.capabilities.includes("OBSERVE")) throw new Error("CONNECTOR_CAPABILITY_MISSING");
    const existing = await tx.sourceObservation.findUnique({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: input.idempotencyKey } } });
    if (existing) return observation(existing);
    const persisted = await tx.sourceObservation.upsert({
      where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: input.idempotencyKey } },
      create: {
        ...scope,
        id: input.id,
        connectorId: input.connectorId,
        sourceNamespace: input.sourceNamespace,
        externalAssetType: input.externalAssetType,
        externalId: input.externalId,
        payload: json(input.payload),
        normalizedDigest: input.normalizedDigest,
        sourceVersion: input.sourceVersion,
        observedAt: new Date(input.observedAt),
        status: input.status,
        provenance: json(input.provenance),
        idempotencyKey: input.idempotencyKey
      },
      update: {}
    });
    await createOutbox(tx, {
      eventType: "FEDERATION_OBSERVATION_RECORDED",
      payload: { observationId: input.id, connectorId: input.connectorId, normalizedDigest: input.normalizedDigest },
      idempotencyKey: `federation-observation:${input.idempotencyKey}`,
      architectureScope: scope
    });
    return observation(persisted);
  });
}

export async function promoteCandidate(input: PromoteCandidateInput): Promise<FederatedFactEnvelope> {
  assertPromotionInput(input);
  const scope = writableScope(input.architectureScope);
  return prisma.$transaction((transaction) => promoteCandidateInTransaction(transaction as Prisma.TransactionClient, input, scope));
}

async function promoteCandidateInTransaction(transaction: Prisma.TransactionClient, input: PromoteCandidateInput, scope: ArchitectureScopeRef): Promise<FederatedFactEnvelope> {
  const candidate = await transaction.sourceObservation.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.candidateId } } });
  if (!candidate) {
    const candidateInAnotherScope = await transaction.sourceObservation.findFirst({ where: { id: input.candidateId } });
    if (candidateInAnotherScope) throw new Error("SCOPE_MISMATCH");
    throw new Error("CANDIDATE_NOT_FOUND");
  }
  if (candidate.status === "PROMOTED") {
    const promotedFact = persistedCanonicalFact(candidate.payload);
    if (!promotedFact) throw new Error("CANONICAL_FACT_INVALID");
    if (promotedFact.architectureScope.applicationServiceId !== scope.applicationServiceId || promotedFact.architectureScope.scopePath !== scope.scopePath) {
      throw new Error("SCOPE_MISMATCH");
    }
    if (contentDigest(promotedFact.payload) !== promotedFact.normalizedDigest) throw new Error("CANDIDATE_DIGEST_INVALID");
    if (!hasCompleteBilingualLocalization(promotedFact.localizedContent)) throw new Error("LOCALIZATION_INCOMPLETE");
    return promotedFact;
  }
  if (candidate.status !== "CANDIDATE") throw new Error("CANDIDATE_STATUS_INVALID");
  const candidateEnvelope = candidateEnvelopeFromPayload(candidate.payload);
  if (!candidateEnvelope || !hasCompleteBilingualLocalization(candidateEnvelope.localizedContent)) throw new Error("LOCALIZATION_INCOMPLETE");
  if (contentDigest(candidateEnvelope.payload) !== candidate.normalizedDigest) throw new Error("CANDIDATE_DIGEST_INVALID");
  if (!hasValidCandidateProvenance(candidate)) throw new Error("CANDIDATE_PROVENANCE_INVALID");
  const mappingIdentity = { connectorId: candidate.connectorId, sourceNamespace: candidate.sourceNamespace, externalAssetType: candidate.externalAssetType, externalId: candidate.externalId };
  const mapping = await transaction.externalIdentityMapping.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace_externalAssetType_externalId: { ...scope, ...mappingIdentity } } });
  if (!mapping) {
    const mappingInAnotherScope = await transaction.externalIdentityMapping.findFirst({ where: mappingIdentity });
    if (mappingInAnotherScope) throw new Error("SCOPE_MISMATCH");
    throw new Error("IDENTITY_MAPPING_MISSING");
  }
  if (mapping.applicationServiceId !== scope.applicationServiceId || mapping.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  if (!mapping.assetId) throw new Error("IDENTITY_MAPPING_INVALID");
  await transaction.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    promotionLockKey(scope, mapping.assetId)
  );
  const policies = await transaction.authorityPolicy.findMany({ where: { ...scope, assetType: mapping.assetType, fieldPath: "$" } });
  if (policies.length > 1) throw new Error("AUTHORITY_POLICY_AMBIGUOUS");
  const policy = policies[0];
  const decision = evaluateObservation({
    authority: policy?.authority as FactAuthority | undefined,
    identityMatch: mapping.matchStatus as "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS",
    policyAllowsPromotion: policy?.promotionMode === "AUTO",
    humanFacing: true,
    hasCompleteChineseLocalization: hasCompleteBilingualLocalization(candidateEnvelope.localizedContent)
  });
  if (decision.action !== "PROMOTE") throw new Error(decision.reason);
  const promotedFact: FederatedFactEnvelope = {
    id: mapping.assetId,
    assetType: mapping.assetType,
    schemaVersion: "1",
    payload: candidateEnvelope.payload,
    localizedContent: candidateEnvelope.localizedContent,
    normalizedDigest: candidate.normalizedDigest,
    architectureScope: scope,
    status: "PROMOTED",
    authority: policy!.authority as FactAuthority,
    confidence: 1,
    provenance: canonicalCandidateProvenance(candidate),
    relationshipRefs: [],
    evidenceRefs: []
  };
  const previousPromotedRows = await transaction.sourceObservation.findMany({ where: { ...scope, status: "PROMOTED" } });
  for (const previousRow of previousPromotedRows) {
    const previousFact = persistedCanonicalFact(previousRow.payload);
    if (previousFact?.id === promotedFact.id) {
      await transaction.sourceObservation.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: previousRow.id } }, data: { status: "TOMBSTONED" } });
    }
  }
  await transaction.sourceObservation.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.candidateId } }, data: { status: "PROMOTED", payload: json(promotedFact) } });
  await createOutbox(transaction as FederationTransaction, {
    eventType: "FEDERATION_CANDIDATE_PROMOTED",
    payload: { candidateId: input.candidateId, assetId: promotedFact.id, normalizedDigest: promotedFact.normalizedDigest },
    idempotencyKey: federationEventKey("FEDERATION_CANDIDATE_PROMOTED", scope, input.candidateId),
    architectureScope: scope
  });
  return promotedFact;
}

function assertPromotionInput(input: unknown): asserts input is PromoteCandidateInput {
  if (!isRecord(input) || Object.keys(input).some((key) => !["candidateId", "approvalReason", "architectureScope"].includes(key)) ||
    !nonEmptyString(input.candidateId) || !nonEmptyString(input.approvalReason) || !isRecord(input.architectureScope) ||
    !nonEmptyString(input.architectureScope.applicationServiceId) || !nonEmptyString(input.architectureScope.scopePath)) {
    throw new Error("PROMOTION_INPUT_INVALID");
  }
}

export async function createDesignChangeSession(input: CreateDesignChangeSessionInput): Promise<DesignChangeSession> {
  const scope = writableScope(input.architectureScope);
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    const row = await tx.designChangeSession.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      create: { ...scope, id: input.id, actorId: input.actorId, intent: input.intent, affectedFactIds: json(input.affectedFactIds), expectedEvidenceRefs: json(input.expectedEvidenceRefs), preflightDigest: input.preflightDigest ?? null, preflightRelationshipDigest: input.preflightRelationshipDigest ?? null, preflightReadAssetIds: json(input.preflightReadAssetIds ?? []), closureReason: input.closureReason ?? null, status: input.status, openedAt: input.openedAt ? new Date(input.openedAt) : undefined },
      update: { actorId: input.actorId, intent: input.intent, affectedFactIds: json(input.affectedFactIds), expectedEvidenceRefs: json(input.expectedEvidenceRefs), preflightDigest: input.preflightDigest ?? null, preflightRelationshipDigest: input.preflightRelationshipDigest ?? null, preflightReadAssetIds: json(input.preflightReadAssetIds ?? []), closureReason: input.closureReason ?? null, status: input.status }
    });
    await createOutbox(tx, {
      eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CREATED",
      payload: { designChangeSessionId: input.id, actorId: input.actorId, affectedFactIds: input.affectedFactIds },
      idempotencyKey: federationEventKey("FEDERATION_DESIGN_CHANGE_SESSION_CREATED", scope, input.id),
      designChangeSessionId: input.id,
      architectureScope: scope
    });
    return session(row);
  });
}

export async function closeDesignChangeSession(input: CloseDesignChangeSessionInput): Promise<DesignChangeSession> {
  const scope = writableScope(input.architectureScope);
  if (!input.verificationEvidenceRefs.length) throw new Error("DESIGN_CHANGE_SESSION_EVIDENCE_REQUIRED");
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    const row = await tx.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
    if (!row) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if ((row.status === "CONVERGED" || row.status === "BLOCKED") && row.status !== input.status) {
      throw new Error("DESIGN_CHANGE_SESSION_ALREADY_CLOSED");
    }
    const existingEvidenceRefs = Array.isArray(row.expectedEvidenceRefs) ? row.expectedEvidenceRefs as string[] : [];
    const expectedEvidenceRefs = [...new Set([...existingEvidenceRefs, ...input.verificationEvidenceRefs])];
    const updated = await tx.designChangeSession.update({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
      data: { status: input.status, expectedEvidenceRefs: json(expectedEvidenceRefs), closureReason: input.closureReason ?? null }
    });
    await createOutbox(tx, {
      eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CLOSED",
      payload: { designChangeSessionId: input.id, status: input.status, verificationEvidenceRefs: input.verificationEvidenceRefs, closureReason: input.closureReason },
      idempotencyKey: federationEventKey("FEDERATION_DESIGN_CHANGE_SESSION_CLOSED", scope, `${input.id}:${input.status}`),
      designChangeSessionId: input.id,
      architectureScope: scope
    });
    return session(updated);
  });
}

export async function appendFederationOutbox(input: AppendFederationOutboxInput): Promise<FederationOutboxRecord> {
  const scope = writableScope(input.architectureScope);
  return prisma.$transaction((transaction) => createOutbox(transaction as FederationTransaction, { ...input, architectureScope: scope }));
}

export async function reconcilePersistedScope(input: ReconcilePersistedScopeInput): Promise<ReconciliationReport> {
  const scope = readableExactScope(input.architectureScope);
  const [acceptedFacts, observations, mappings] = await Promise.all([
    listPersistedCanonicalFederatedFacts(scope),
    prisma.sourceObservation.findMany({ where: { ...scope, status: { not: "TOMBSTONED" } } }),
    prisma.externalIdentityMapping.findMany({ where: scope })
  ]);
  const report = reconcileFacts({
    architectureScope: scope,
    acceptedFacts,
    observations: observations.map(observation),
    identityMappings: mappings.map((mapping) => ({ id: mapping.id, architectureScope: scope, connectorInstanceId: mapping.connectorId, sourceNamespace: mapping.sourceNamespace, externalAssetType: mapping.externalAssetType, externalId: mapping.externalId, assetType: mapping.assetType, assetId: mapping.assetId ?? undefined, matchStatus: mapping.matchStatus as "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS", normalizedDigest: mapping.normalizedDigest })),
    relationshipDrift: input.relationshipDrift,
    evidenceDrift: input.evidenceDrift,
    localizationDrift: input.localizationDrift
  });
  return report;
}

export async function listPersistedCanonicalFederatedFacts(scopeInput: ArchitectureScopeRef): Promise<FederatedFactEnvelope[]> {
  const scope = readableExactScope(scopeInput);
  const rows = await prisma.sourceObservation.findMany({ where: { ...scope, status: "PROMOTED" }, orderBy: [{ observedAt: "asc" }, { id: "asc" }] });
  return rows.flatMap((row) => {
    const fact = persistedCanonicalFact(row.payload);
    if (!fact) throw new Error("CANONICAL_FACT_INVALID");
    if (fact.architectureScope.applicationServiceId !== scope.applicationServiceId || fact.architectureScope.scopePath !== scope.scopePath) {
      throw new Error("SCOPE_MISMATCH");
    }
    return [fact];
  });
}

export async function persistReconciliationSnapshot(input: ReconcilePersistedScopeInput): Promise<ReconciliationReport> {
  const scope = writableScope(input.architectureScope);
  const report = await reconcilePersistedScope({ ...input, architectureScope: scope });
  await prisma.reconciliationSnapshot.upsert({
    where: { applicationServiceId_scopePath_root: { ...scope, root: report.root } },
    create: { ...scope, root: report.root, issues: json(report.issues), status: report.status, factDigests: json(report.factDigests) },
    update: { issues: json(report.issues), status: report.status, factDigests: json(report.factDigests) }
  });
  return report;
}

function writableScope(scope: ArchitectureScopeRef): ArchitectureScopeRef {
  return resolveWritableScope(writableActor(), scope);
}

function readableExactScope(scope: ArchitectureScopeRef): ArchitectureScopeRef {
  const readable = readableScope(scope.applicationServiceId);
  if (readable.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  return readable;
}

function promotionLockKey(scope: ArchitectureScopeRef, factId: string): string {
  return `${scope.applicationServiceId}|${scope.scopePath}|${factId}`;
}

function connectorLockKey(scope: ArchitectureScopeRef, connectorId: string): string {
  return `${scope.applicationServiceId}|${scope.scopePath}|connector|${connectorId}`;
}

function federationEventKey(eventType: string, scope: ArchitectureScopeRef, subjectId: string): string {
  return `${eventType}:${contentDigest({ architectureScope: scope, subjectId })}`;
}

export async function createOutbox(client: Pick<FederationTransaction, "federationOutbox" | "designChangeSession"> | typeof prisma, input: AppendFederationOutboxInput): Promise<FederationOutboxRecord> {
  const scope = input.architectureScope;
  if (input.designChangeSessionId) {
    const session = await client.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_SCOPE_MISMATCH");
  }
  const row = await client.federationOutbox.upsert({
    where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: input.idempotencyKey } },
    create: { ...scope, eventType: input.eventType, payload: json(input.payload), idempotencyKey: input.idempotencyKey, status: "PENDING", availableAt: input.availableAt ? new Date(input.availableAt) : undefined, designChangeSessionId: input.designChangeSessionId ?? null },
    update: {}
  });
  return outbox(row);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type CandidateObservationRow = {
  connectorId: string;
  sourceNamespace: string;
  externalAssetType: string;
  externalId: string;
  sourceVersion: string;
  observedAt: Date;
  provenance: Prisma.JsonValue;
};

function hasValidCandidateProvenance(candidate: CandidateObservationRow): boolean {
  if (!isRecord(candidate.provenance)) return false;
  return candidate.provenance.sourceSystem === candidate.sourceNamespace &&
    candidate.provenance.connectorInstanceId === candidate.connectorId &&
    candidate.provenance.externalIdentity === `${candidate.externalAssetType}:${candidate.externalId}` &&
    candidate.provenance.externalVersion === candidate.sourceVersion &&
    candidate.provenance.observedAt === candidate.observedAt.toISOString();
}

function canonicalCandidateProvenance(candidate: CandidateObservationRow): FederatedFactEnvelope["provenance"] {
  return {
    ...(candidate.provenance as unknown as FederatedFactEnvelope["provenance"]),
    connectorInstanceId: candidate.connectorId,
    externalIdentity: `${candidate.externalAssetType}:${candidate.externalId}`,
    externalVersion: candidate.sourceVersion,
    observedAt: candidate.observedAt.toISOString()
  };
}

function candidateEnvelopeFromPayload(value: Prisma.JsonValue): { payload: Record<string, unknown>; localizedContent: FederatedFactEnvelope["localizedContent"] } | undefined {
  if (!isRecord(value) || !isRecord(value.localizedContent) || !isRecord(value.localizedContent.en) || !isRecord(value.localizedContent.zh)) return undefined;
  const { localizedContent: _localizedContent, ...payload } = value;
  return { payload, localizedContent: value.localizedContent as unknown as FederatedFactEnvelope["localizedContent"] };
}

function persistedCanonicalFact(value: Prisma.JsonValue): FederatedFactEnvelope | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.assetType) || !nonEmptyString(value.schemaVersion) ||
    !isRecord(value.payload) || !isRecord(value.localizedContent) || !isRecord(value.localizedContent.en) || !isRecord(value.localizedContent.zh) || !nonEmptyString(value.normalizedDigest) ||
    !isRecord(value.provenance) || !nonEmptyString(value.provenance.sourceSystem) || !nonEmptyString(value.provenance.connectorInstanceId) ||
    !nonEmptyString(value.provenance.observedAt) || !isRecord(value.architectureScope) || !nonEmptyString(value.architectureScope.applicationServiceId) ||
    !nonEmptyString(value.architectureScope.scopePath) || !["EXTERNAL", "SPECFORGE", "SHARED"].includes(String(value.authority)) ||
    typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 || value.status !== "PROMOTED") {
    return undefined;
  }
  if (!optionalString(value.designChangeSessionId) || !stringArray(value.relationshipRefs) || !stringArray(value.evidenceRefs)) return undefined;
  if (!optionalString(value.provenance.externalIdentity) || !optionalString(value.provenance.externalVersion) ||
    !optionalString(value.provenance.sourceTimestamp) || !optionalString(value.provenance.repositoryCommit)) return undefined;
  return value as unknown as FederatedFactEnvelope;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || nonEmptyString(value);
}

function stringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(nonEmptyString));
}

function connector(row: { id: string; kind: string; capabilities: Prisma.JsonValue; status: string; secretReference: string | null; applicationServiceId: string; scopePath: string }): ConnectorInstance {
  return { id: row.id, kind: row.kind, capabilities: row.capabilities as ConnectorCapability[], status: row.status as ConnectorStatus, secretReference: row.secretReference ?? undefined, architectureScope: scopeOf(row) };
}

function observation(row: { id: string; connectorId: string; sourceNamespace: string; externalAssetType: string; externalId: string; payload: Prisma.JsonValue; normalizedDigest: string; sourceVersion: string; observedAt: Date; status: string; provenance: Prisma.JsonValue; applicationServiceId: string; scopePath: string }): SourceObservation {
  return { id: row.id, connectorInstanceId: row.connectorId, sourceNamespace: row.sourceNamespace, externalAssetType: row.externalAssetType, externalId: row.externalId, payload: row.payload as Record<string, unknown>, normalizedDigest: row.normalizedDigest, sourceVersion: row.sourceVersion, observedAt: row.observedAt.toISOString(), status: row.status as CandidateFactStatus, provenance: row.provenance as unknown as SourceObservation["provenance"], architectureScope: scopeOf(row) };
}

function session(row: { id: string; actorId: string; intent: string; affectedFactIds: Prisma.JsonValue; expectedEvidenceRefs: Prisma.JsonValue; preflightDigest?: string | null; preflightRelationshipDigest?: string | null; preflightReadAssetIds?: Prisma.JsonValue; closureReason?: string | null; status: string; openedAt: Date; updatedAt: Date; applicationServiceId: string; scopePath: string }): DesignChangeSession {
  return { id: row.id, actorId: row.actorId, intent: row.intent, affectedFactIds: row.affectedFactIds as string[], expectedEvidenceRefs: row.expectedEvidenceRefs as string[], ...(row.preflightDigest ? { preflightDigest: row.preflightDigest } : {}), ...(row.preflightRelationshipDigest ? { preflightRelationshipDigest: row.preflightRelationshipDigest } : {}), preflightReadAssetIds: (row.preflightReadAssetIds as string[] | undefined) ?? [], ...(row.closureReason ? { closureReason: row.closureReason } : {}), status: row.status as DesignChangeSessionStatus, openedAt: row.openedAt.toISOString(), updatedAt: row.updatedAt.toISOString(), architectureScope: scopeOf(row) };
}

export async function archiveFederationOutbox(input: ArchiveFederationOutboxInput) {
  const scope = writableScope(input.architectureScope);
  const cutoff = new Date(input.before);
  if (!Number.isFinite(cutoff.getTime())) throw new Error("OUTBOX_ARCHIVE_CUTOFF_INVALID");
  if (!input.reason.trim()) throw new Error("OUTBOX_ARCHIVE_REASON_REQUIRED");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 5000) throw new Error("OUTBOX_ARCHIVE_LIMIT_INVALID");
  const allowedStatuses = new Set(["PENDING", "DELIVERING", "DEAD_LETTER"]);
  if (!input.statuses.length || input.statuses.some((status) => !allowedStatuses.has(status))) throw new Error("OUTBOX_ARCHIVE_STATUS_INVALID");

  return prisma.$transaction(async (transaction) => {
    const candidates = await transaction.federationOutbox.findMany({
      where: { ...scope, status: { in: input.statuses }, createdAt: { lt: cutoff } },
      orderBy: [{ createdAt: "asc" }, { dbId: "asc" }],
      take: input.limit,
      select: { dbId: true, eventType: true, status: true, createdAt: true, designChangeSessionId: true }
    });
    if (!candidates.length) {
      return { architectureScope: scope, cutoff: cutoff.toISOString(), statuses: input.statuses, archivedCount: 0, archivedIds: [] as string[], reason: input.reason };
    }
    const update = await transaction.federationOutbox.updateMany({
      where: { ...scope, dbId: { in: candidates.map((candidate) => candidate.dbId) }, status: { in: input.statuses } },
      data: { status: "ARCHIVED", sentAt: null }
    });
    await transaction.auditLog.create({
      data: {
        actorType: "system",
        actorId: writableActor().actorId,
        channel: "mcp",
        action: "archive_stale_federation_outbox",
        targetType: "FederationOutbox",
        targetId: `${scope.applicationServiceId}:${cutoff.toISOString()}`,
        inputSummary: JSON.stringify({ architectureScope: scope, before: cutoff.toISOString(), statuses: input.statuses, limit: input.limit, reason: input.reason }),
        outputSummary: JSON.stringify({ archivedCount: update.count, archivedIds: candidates.map((candidate) => candidate.dbId), eventTypes: [...new Set(candidates.map((candidate) => candidate.eventType))] }),
        status: "COMPLETED",
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath
      }
    });
    return { architectureScope: scope, cutoff: cutoff.toISOString(), statuses: input.statuses, archivedCount: update.count, archivedIds: candidates.slice(0, update.count).map((candidate) => candidate.dbId), reason: input.reason };
  });
}

function outbox(row: { dbId: string; eventType: string; payload: Prisma.JsonValue; idempotencyKey: string; status: string; availableAt: Date; sentAt: Date | null; attemptCount: number; lastError: string | null; designChangeSessionId: string | null; applicationServiceId: string; scopePath: string }): FederationOutboxRecord {
  return { id: row.dbId, eventType: row.eventType, payload: row.payload as Record<string, unknown>, idempotencyKey: row.idempotencyKey, status: row.status, availableAt: row.availableAt.toISOString(), sentAt: row.sentAt?.toISOString(), attemptCount: row.attemptCount, lastError: row.lastError ?? undefined, designChangeSessionId: row.designChangeSessionId ?? undefined, architectureScope: scopeOf(row) };
}

function scopeOf(row: { applicationServiceId: string; scopePath: string }): ArchitectureScopeRef {
  return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
