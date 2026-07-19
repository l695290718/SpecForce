import { evaluateObservation, reconcileFacts, type ArchitectureScopeRef, type CandidateFactStatus, type ConnectorCapability, type ConnectorStatus, type DesignChangeSession, type DesignChangeSessionStatus, type FactAuthority, type FederatedFactEnvelope, type ReconciliationReport, type SourceObservation } from "@specforge/core";
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
  fact: Omit<FederatedFactEnvelope, "architectureScope" | "status">;
  fieldPath?: string;
  humanFacing: boolean;
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

export interface ReconcilePersistedScopeInput {
  architectureScope: ArchitectureScopeRef;
  acceptedFacts: FederatedFactEnvelope[];
  relationshipDrift?: boolean;
  evidenceDrift?: boolean;
  localizationDrift?: boolean;
}

type FederationTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function registerConnector(input: RegisterConnectorInput): Promise<ConnectorInstance> {
  const scope = writableScope(input.architectureScope);
  const row = await prisma.connectorInstance.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
    create: { ...scope, id: input.id, kind: input.kind, capabilities: json(input.capabilities), status: input.status, secretReference: input.secretReference ?? null },
    update: { kind: input.kind, capabilities: json(input.capabilities), status: input.status, secretReference: input.secretReference ?? null }
  });
  return connector(row);
}

export async function listConnectors(scopeInput: ArchitectureScopeRef): Promise<ConnectorInstance[]> {
  const scope = readableExactScope(scopeInput);
  return (await prisma.connectorInstance.findMany({ where: scope, orderBy: { id: "asc" } })).map(connector);
}

export async function recordObservation(input: RecordObservationInput): Promise<SourceObservation> {
  const scope = writableScope(input.architectureScope);
  const connectorRow = await prisma.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.connectorId } } });
  if (!connectorRow) {
    const connectorInAnotherScope = await prisma.connectorInstance.findFirst({ where: { id: input.connectorId } });
    if (connectorInAnotherScope) throw new Error("SCOPE_MISMATCH");
    throw new Error("CONNECTOR_NOT_FOUND");
  }
  if (connectorRow.applicationServiceId !== scope.applicationServiceId || connectorRow.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");

  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
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
  const scope = writableScope(input.architectureScope);
  if (typeof input.humanFacing !== "boolean") throw new Error("HUMAN_FACING_REQUIRED");
  const candidate = await prisma.sourceObservation.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.candidateId } } });
  if (!candidate) {
    const candidateInAnotherScope = await prisma.sourceObservation.findFirst({ where: { id: input.candidateId } });
    if (candidateInAnotherScope) throw new Error("SCOPE_MISMATCH");
    throw new Error("CANDIDATE_NOT_FOUND");
  }
  if (candidate.status !== "CANDIDATE") throw new Error("CANDIDATE_STATUS_INVALID");
  const mappingIdentity = { connectorId: candidate.connectorId, sourceNamespace: candidate.sourceNamespace, externalAssetType: candidate.externalAssetType, externalId: candidate.externalId };
  const mapping = await prisma.externalIdentityMapping.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace_externalAssetType_externalId: { ...scope, ...mappingIdentity } } });
  if (!mapping) {
    const mappingInAnotherScope = await prisma.externalIdentityMapping.findFirst({ where: mappingIdentity });
    if (mappingInAnotherScope) throw new Error("SCOPE_MISMATCH");
    throw new Error("IDENTITY_MAPPING_MISSING");
  }
  if (mapping.applicationServiceId !== scope.applicationServiceId || mapping.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  if (mapping.assetType !== input.fact.assetType || (mapping.assetId && mapping.assetId !== input.fact.id)) throw new Error("IDENTITY_MAPPING_INVALID");
  const policies = await prisma.authorityPolicy.findMany({ where: { ...scope, assetType: input.fact.assetType, fieldPath: input.fieldPath ?? "$" } });
  if (policies.length > 1) throw new Error("AUTHORITY_POLICY_AMBIGUOUS");
  const policy = policies[0];
  const decision = evaluateObservation({
    authority: policy?.authority as FactAuthority | undefined,
    identityMatch: mapping.matchStatus as "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS",
    policyAllowsPromotion: policy?.promotionMode === "AUTO",
    humanFacing: input.humanFacing,
    hasCompleteChineseLocalization: hasCompleteChineseLocalization(input.fact)
  });
  if (decision.action !== "PROMOTE") throw new Error(decision.reason);
  await prisma.sourceObservation.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.candidateId } }, data: { status: "PROMOTED" } });
  return { ...input.fact, architectureScope: scope, status: "PROMOTED", provenance: { ...input.fact.provenance, connectorInstanceId: candidate.connectorId, observedAt: candidate.observedAt.toISOString() } };
}

export async function createDesignChangeSession(input: CreateDesignChangeSessionInput): Promise<DesignChangeSession> {
  const scope = writableScope(input.architectureScope);
  const row = await prisma.designChangeSession.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
    create: { ...scope, id: input.id, actorId: input.actorId, intent: input.intent, affectedFactIds: json(input.affectedFactIds), expectedEvidenceRefs: json(input.expectedEvidenceRefs), status: input.status, openedAt: input.openedAt ? new Date(input.openedAt) : undefined },
    update: { actorId: input.actorId, intent: input.intent, affectedFactIds: json(input.affectedFactIds), expectedEvidenceRefs: json(input.expectedEvidenceRefs), status: input.status }
  });
  return session(row);
}

export async function appendFederationOutbox(input: AppendFederationOutboxInput): Promise<FederationOutboxRecord> {
  const scope = writableScope(input.architectureScope);
  return prisma.$transaction((transaction) => createOutbox(transaction as FederationTransaction, { ...input, architectureScope: scope }));
}

export async function reconcilePersistedScope(input: ReconcilePersistedScopeInput): Promise<ReconciliationReport> {
  const scope = readableExactScope(input.architectureScope);
  const [observations, mappings] = await Promise.all([
    prisma.sourceObservation.findMany({ where: scope }),
    prisma.externalIdentityMapping.findMany({ where: scope })
  ]);
  const report = reconcileFacts({
    architectureScope: scope,
    acceptedFacts: input.acceptedFacts,
    observations: observations.map(observation),
    identityMappings: mappings.map((mapping) => ({ id: mapping.id, architectureScope: scope, connectorInstanceId: mapping.connectorId, sourceNamespace: mapping.sourceNamespace, externalAssetType: mapping.externalAssetType, externalId: mapping.externalId, assetType: mapping.assetType, assetId: mapping.assetId ?? undefined, matchStatus: mapping.matchStatus as "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS", normalizedDigest: mapping.normalizedDigest })),
    relationshipDrift: input.relationshipDrift,
    evidenceDrift: input.evidenceDrift,
    localizationDrift: input.localizationDrift
  });
  return report;
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

async function createOutbox(client: Pick<FederationTransaction, "federationOutbox" | "designChangeSession"> | typeof prisma, input: AppendFederationOutboxInput): Promise<FederationOutboxRecord> {
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

function hasCompleteChineseLocalization(fact: Omit<FederatedFactEnvelope, "architectureScope" | "status">): boolean {
  const zh = fact.localizedContent.zh;
  if (!isRecord(zh) || Object.keys(zh).length === 0 || !hasOnlyCompleteLocalizedValues(zh)) return false;
  return fact.localizedContent.en === undefined || hasChineseOverlayForEnglish(fact.localizedContent.en, zh);
}

function hasChineseOverlayForEnglish(english: unknown, chinese: unknown): boolean {
  if (typeof english === "string") return typeof chinese === "string" && chinese.trim().length > 0;
  if (Array.isArray(english)) return Array.isArray(chinese) && english.length === chinese.length && english.every((value, index) => hasChineseOverlayForEnglish(value, chinese[index]));
  if (isRecord(english)) return isRecord(chinese) && Object.entries(english).every(([key, value]) => key in chinese && hasChineseOverlayForEnglish(value, chinese[key]));
  return chinese !== undefined && chinese !== null;
}

function hasOnlyCompleteLocalizedValues(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(hasOnlyCompleteLocalizedValues);
  return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every(hasOnlyCompleteLocalizedValues);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function connector(row: { id: string; kind: string; capabilities: Prisma.JsonValue; status: string; secretReference: string | null; applicationServiceId: string; scopePath: string }): ConnectorInstance {
  return { id: row.id, kind: row.kind, capabilities: row.capabilities as ConnectorCapability[], status: row.status as ConnectorStatus, secretReference: row.secretReference ?? undefined, architectureScope: scopeOf(row) };
}

function observation(row: { id: string; connectorId: string; sourceNamespace: string; externalAssetType: string; externalId: string; payload: Prisma.JsonValue; normalizedDigest: string; sourceVersion: string; observedAt: Date; status: string; provenance: Prisma.JsonValue; applicationServiceId: string; scopePath: string }): SourceObservation {
  return { id: row.id, connectorInstanceId: row.connectorId, sourceNamespace: row.sourceNamespace, externalAssetType: row.externalAssetType, externalId: row.externalId, payload: row.payload as Record<string, unknown>, normalizedDigest: row.normalizedDigest, sourceVersion: row.sourceVersion, observedAt: row.observedAt.toISOString(), status: row.status as CandidateFactStatus, provenance: row.provenance as unknown as SourceObservation["provenance"], architectureScope: scopeOf(row) };
}

function session(row: { id: string; actorId: string; intent: string; affectedFactIds: Prisma.JsonValue; expectedEvidenceRefs: Prisma.JsonValue; status: string; openedAt: Date; updatedAt: Date; applicationServiceId: string; scopePath: string }): DesignChangeSession {
  return { id: row.id, actorId: row.actorId, intent: row.intent, affectedFactIds: row.affectedFactIds as string[], expectedEvidenceRefs: row.expectedEvidenceRefs as string[], status: row.status as DesignChangeSessionStatus, openedAt: row.openedAt.toISOString(), updatedAt: row.updatedAt.toISOString(), architectureScope: scopeOf(row) };
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
