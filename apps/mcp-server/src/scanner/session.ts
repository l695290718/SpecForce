import { validateScanFinalization, type AssetCapability, type AssetCoveragePlan, type ScanFinalization, type ScanLimits, type ScanPolicyReceipt, type ScanSessionDescriptor, type TechnologyProfile } from "@specforge/scan-contract";
import { contentDigest, type ArchitectureScopeRef } from "@specforge/core";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";
import { assertScannerReleaseAvailable, selectScannerRelease, type ScannerCapabilities } from "./release";
import { resolvePersistedEffectiveScanGovernance } from "./governance-persistence";
import { assessScanFinalization } from "./finalization";

const MAX_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_LIFETIME_MS = 30 * 60 * 1000;

export interface StartKnowledgeScanInput {
  architectureScope: ArchitectureScopeRef;
  connectorId: string;
  designChangeSessionId: string;
  scannerReleaseId?: string;
  scannerCapabilities?: ScannerCapabilities;
  runtimeProfileId?: string;
  snapshotIdentity: Record<string, unknown>;
  repositoryPolicy?: { allowDirtyWorktree: boolean; ignorePatterns: string[] };
  evidencePolicy?: Record<string, unknown>;
  parserPolicy?: Record<string, unknown>;
  budgets?: Partial<ScanLimits>;
  expiresAt?: string;
}

export interface ScopedScanSessionInput {
  sessionId: string;
  architectureScope: ArchitectureScopeRef;
}

export interface FinalizeKnowledgeScanInput extends ScopedScanSessionInput {
  finalization: ScanFinalization | Record<string, unknown>;
}

export function createScanSessionNonce(): { value: string; digest: string } {
  const value = randomBytes(32).toString("base64url");
  return { value, digest: sha256(value) };
}

export function assertScanSessionScope(authoritative: ArchitectureScopeRef, assertion: ArchitectureScopeRef): void {
  if (authoritative.applicationServiceId !== assertion.applicationServiceId || authoritative.scopePath !== assertion.scopePath) {
    throw new Error("SCOPE_MISMATCH");
  }
}

export function assertScanSessionWritable(
  session: { actorId: string; status: string; expiresAt: Date },
  actorId: string,
  now = new Date()
): void {
  if (session.actorId !== actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
  if (session.expiresAt.getTime() <= now.getTime() || session.status === "EXPIRED") throw new Error("SCAN_SESSION_EXPIRED");
  if (!new Set(["OPEN", "RECEIVING", "FINALIZING"]).has(session.status)) throw new Error("SCAN_SESSION_NOT_WRITABLE");
}

export async function startKnowledgeScan(input: StartKnowledgeScanInput): Promise<ScanSessionDescriptor> {
  if (!input.connectorId || !input.designChangeSessionId) throw new Error("SCAN_SESSION_IDENTITY_REQUIRED");
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const now = new Date();
  const expiresAt = normalizeExpiry(input.expiresAt, now);
  const contract = await loadScanContract();
  const governance = await resolvePersistedEffectiveScanGovernance(scope, input.runtimeProfileId ?? "default-repository-scan");
  const limits = normalizeScanLimits(input.budgets, governance.budgets);
  const repositoryPolicy = {
    allowDirtyWorktree: input.repositoryPolicy?.allowDirtyWorktree ?? false,
    ignorePatterns: [...new Set([...(input.repositoryPolicy?.ignorePatterns ?? []), ...governance.overlay.excludePaths])].sort()
  };
  const technologyProfile: TechnologyProfile = { detections: [], conflicts: [], digest: contentDigest({ detections: [], conflicts: [] }) };
  const coveragePlan = initialCoveragePlan(governance.records.ASSET_INFERENCE_POLICY.payload.assetFamilies);
  const policyReceipt = {
    systemGovernanceDigest: governance.systemDigest,
    extractorCatalogDigest: governance.records.EXTRACTOR_CATALOG.contentDigest,
    semanticPromptPackDigest: governance.records.SEMANTIC_PROMPT_PACK.contentDigest,
    scopeRuntimeProfileDigest: governance.overlayDigest,
    effectivePolicyDigest: governance.effectiveDigest
  };
  const nonce = createScanSessionNonce();
  const actorId = writableActor().actorId;
  await ensureMcpPersistenceSchema();

  const release = input.scannerCapabilities
    ? await selectScannerRelease({
      requestedReleaseId: input.scannerReleaseId,
      capabilities: input.scannerCapabilities,
      contractVersion: "2.0",
      now
    })
    : input.scannerReleaseId
      ? await prisma.scannerRelease.findUnique({ where: { id: input.scannerReleaseId } })
      : await prisma.scannerRelease.findFirst({ where: { status: "ACTIVE" }, orderBy: { publishedAt: "desc" } });
  if (!release) throw new Error("SCANNER_RELEASE_NOT_FOUND");
  assertScannerReleaseAvailable(release, now);

  const descriptor = contract.validateScanSession({
    contractVersion: release.contractVersion,
    sessionId: `knowledge-scan:${randomUUID()}`,
    architectureScope: scope,
    actorId,
    connectorId: input.connectorId,
    scannerReleaseId: release.id,
    sessionNonce: nonce.value,
    expiresAt: expiresAt.toISOString(),
    repositoryPolicy,
    limits,
    policyReceipt,
    technologyProfile,
    coveragePlan,
    expectedPreviousBatchDigest: null
  });

  await prisma.$transaction(async (tx) => {
    const designChangeSession = await tx.designChangeSession.findUnique({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } }
    });
    if (!designChangeSession) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (designChangeSession.status !== "OPEN") throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");
    const connector = await tx.connectorInstance.findUnique({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.connectorId } }
    });
    if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
    if (connector.status !== "ACTIVE") throw new Error("CONNECTOR_NOT_ACTIVE");
    if (!Array.isArray(connector.capabilities) || !connector.capabilities.includes("OBSERVE")) throw new Error("CONNECTOR_CAPABILITY_MISSING");
    await tx.knowledgeScanSession.create({
      data: {
        ...scope,
        id: descriptor.sessionId,
        actorId,
        connectorId: input.connectorId,
        designChangeSessionId: input.designChangeSessionId,
        scannerReleaseId: release.id,
        contractVersion: descriptor.contractVersion,
        nonceDigest: nonce.digest,
        snapshotIdentity: jsonValue(input.snapshotIdentity),
        repositoryPolicy: jsonValue(repositoryPolicy),
        evidencePolicy: jsonValue({ ...(input.evidencePolicy ?? {}), policyReceipt }),
        parserPolicy: jsonValue({ ...(input.parserPolicy ?? {}), technologyProfile, coveragePlan }),
        budgets: jsonValue(limits),
        status: "OPEN",
        expiresAt
      }
    });
  });
  return descriptor;
}

function initialCoveragePlan(assetFamiliesValue: unknown): AssetCoveragePlan {
  const assetFamilies = Array.isArray(assetFamiliesValue) && assetFamiliesValue.every((item) => typeof item === "string")
    ? [...new Set(assetFamiliesValue)] as string[]
    : ["domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "serviceFeature", "functionalFeature", "adr", "proposal", "contextPack", "evidence", "typedRelationship"];
  const capabilities: AssetCapability[] = assetFamilies.map((assetFamily) => ({
    assetFamily,
    framework: "repository",
    state: "DISCOVERY_ONLY",
    required: true,
    reasonCodes: ["TECHNOLOGY_PROFILE_PENDING"],
    extractorIds: []
  }));
  const plan = { assetFamilies, capabilities, complete: false, digest: "" } satisfies AssetCoveragePlan;
  return { ...plan, digest: contentDigest({ assetFamilies, capabilities, complete: false }) };
}

export async function getScanCheckpoint(input: ScopedScanSessionInput) {
  await ensureMcpPersistenceSchema();
  const session = await findSessionByOpaqueId(prisma, input.sessionId);
  const scope = scopeOf(session);
  assertScanSessionScope(scope, input.architectureScope);
  if (session.actorId !== writableActor().actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
  return {
    contractVersion: "2.0" as const,
    sessionId: session.id,
    architectureScope: scope,
    latestAcceptedSequence: session.acceptedSequence,
    cumulativeDigest: session.acceptedBatchDigest,
    observationCount: session.observationCount,
    status: effectiveStatus(session)
  };
}

export async function finalizeKnowledgeScan(input: FinalizeKnowledgeScanInput) {
  await ensureMcpPersistenceSchema();
  const result = await prisma.$transaction(async (tx) => {
    const session = await findAndLockSession(tx, input.sessionId);
    const scope = scopeOf(session);
    assertScanSessionScope(scope, input.architectureScope);
    const finalization = requireFinalization(input.finalization);
    assertScanSessionScope(scope, finalization.architectureScope);
    if (finalization.sessionId !== session.id) throw new Error("SCAN_SESSION_MISMATCH");
    const finalizationDigest = sha256(canonicalJson(finalization));
    if (session.finalizationDigest) {
      if (session.finalizationDigest !== finalizationDigest) throw new Error("SCAN_FINALIZATION_CONFLICT");
      return { session, finalizationDigest, idempotent: true };
    }
    assertScanSessionWritable(session, writableActor().actorId);
    const release = await tx.scannerRelease.findUnique({ where: { id: session.scannerReleaseId } });
    if (!release) throw new Error("SCANNER_RELEASE_NOT_FOUND");
    assertScannerReleaseAvailable(release);
    assertFinalizationMatches(session, finalization);
    const assessment = assessScanFinalization({ finalization, expectedPolicyReceipt: readPolicyReceipt(session.evidencePolicy) });
    const blockingIssues = assessment.blockingIssues;
    const status = assessment.status === "READY" ? "READY_FOR_ANALYSIS" : "BLOCKED";
    const updated = await tx.knowledgeScanSession.update({
      where: { dbId: session.dbId },
      data: {
        status,
        blockedReason: blockingIssues.length > 0 ? blockingIssues.join("; ") : null,
        finalizationManifest: jsonValue(finalization),
        finalizationDigest,
        finalizedAt: new Date()
      }
    });
    return { session: updated, finalizationDigest, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return {
    sessionId: result.session.id,
    architectureScope: scopeOf(result.session),
    status: result.session.status,
    acceptedSequence: result.session.acceptedSequence,
    cumulativeDigest: result.session.acceptedBatchDigest,
    observationCount: result.session.observationCount,
    finalizationDigest: result.finalizationDigest,
    idempotent: result.idempotent
  };
}

export async function findSessionByOpaqueId(
  client: Pick<typeof prisma, "knowledgeScanSession">,
  sessionId: string
) {
  if (!sessionId) throw new Error("SCAN_SESSION_ID_REQUIRED");
  const matches = await client.knowledgeScanSession.findMany({ where: { id: sessionId }, take: 2 });
  if (matches.length === 0) throw new Error("SCAN_SESSION_NOT_FOUND");
  if (matches.length > 1) throw new Error("SCAN_SESSION_ID_AMBIGUOUS");
  return matches[0]!;
}

export function verifySessionNonceDigest(expected: string, actual: string): void {
  if (!/^[0-9a-f]{64}$/.test(expected) || !/^[0-9a-f]{64}$/.test(actual)) throw new Error("SCAN_NONCE_DIGEST_INVALID");
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"))) throw new Error("SCAN_NONCE_MISMATCH");
}

export function normalizeScanLimits(requested: Partial<ScanLimits> | undefined, hardLimits: Readonly<ScanLimits>): ScanLimits {
  const result = { ...hardLimits, ...requested };
  for (const [key, ceiling] of Object.entries(hardLimits) as Array<[keyof ScanLimits, number]>) {
    const value = result[key];
    const minimum = key === "maxExcerptBytes" ? 0 : 1;
    if (!Number.isInteger(value) || value < minimum || value > ceiling) throw new Error("SCAN_LIMITS_EXCEEDED");
  }
  return result;
}

async function loadScanContract(): Promise<{
  SCAN_LIMITS: Readonly<ScanLimits>;
  validateScanSession(value: unknown): ScanSessionDescriptor;
}> {
  const packageName = "@specforge/scan-contract";
  return import(packageName) as Promise<{
    SCAN_LIMITS: Readonly<ScanLimits>;
    validateScanSession(value: unknown): ScanSessionDescriptor;
  }>;
}

function normalizeExpiry(value: string | undefined, now: Date): Date {
  const expiresAt = value ? new Date(value) : new Date(now.getTime() + DEFAULT_SESSION_LIFETIME_MS);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) throw new Error("SCAN_SESSION_EXPIRY_INVALID");
  if (expiresAt.getTime() - now.getTime() > MAX_SESSION_LIFETIME_MS) throw new Error("SCAN_SESSION_EXPIRY_EXCEEDS_POLICY");
  return expiresAt;
}

async function findAndLockSession(tx: Prisma.TransactionClient, sessionId: string) {
  const session = await findSessionByOpaqueId(tx, sessionId);
  await tx.$queryRaw`SELECT "dbId" FROM "KnowledgeScanSession" WHERE "dbId" = ${session.dbId}::uuid FOR UPDATE`;
  return tx.knowledgeScanSession.findUniqueOrThrow({ where: { dbId: session.dbId } });
}

function requireFinalization(value: ScanFinalization | Record<string, unknown>): ScanFinalization {
  return validateScanFinalization(value);
}

function readPolicyReceipt(value: Prisma.JsonValue): ScanPolicyReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SCAN_POLICY_RECEIPT_MISSING");
  const policyReceipt = (value as Record<string, unknown>).policyReceipt;
  if (!policyReceipt || typeof policyReceipt !== "object" || Array.isArray(policyReceipt)) throw new Error("SCAN_POLICY_RECEIPT_MISSING");
  return policyReceipt as ScanPolicyReceipt;
}

function assertFinalizationMatches(session: Awaited<ReturnType<typeof findAndLockSession>>, finalization: ScanFinalization): void {
  if (session.acceptedSequence < 0 || session.acceptedBatchDigest === null) throw new Error("SCAN_SESSION_EMPTY");
  if (finalization.finalBatchDigest !== session.acceptedBatchDigest) throw new Error("SCAN_FINAL_DIGEST_MISMATCH");
  if (finalization.batchCount !== session.acceptedSequence + 1) throw new Error("SCAN_FINAL_BATCH_COUNT_MISMATCH");
  if (finalization.observationCount !== session.observationCount || finalization.coverage.observationCount !== session.observationCount) throw new Error("SCAN_FINAL_OBSERVATION_COUNT_MISMATCH");
  const snapshot = session.snapshotIdentity as Record<string, unknown>;
  if (snapshot.snapshotDigest !== finalization.repositorySnapshotDigest) throw new Error("SCAN_REPOSITORY_SNAPSHOT_MISMATCH");
}

function scopeOf(session: { applicationServiceId: string; scopePath: string }): ArchitectureScopeRef {
  return { applicationServiceId: session.applicationServiceId, scopePath: session.scopePath };
}

function effectiveStatus(session: { status: string; expiresAt: Date }) {
  return session.expiresAt.getTime() <= Date.now() && new Set(["OPEN", "RECEIVING", "FINALIZING"]).has(session.status)
    ? "EXPIRED"
    : session.status;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("CANONICAL_JSON_VALUE_INVALID");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
