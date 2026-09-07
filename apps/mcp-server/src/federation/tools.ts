import { contentDigest, scopeById, type ArchitectureScopeRef, type ConnectorCapability, type Permission, type ScopedPrincipal } from "@specforge/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { listPersistedAssetLinks, prisma, resolveWritableScope } from "../persistence";
import { loadScopedAssetCatalog } from "../scoped-derived";
import {
  closeDesignChangeSession,
  createDesignChangeSession,
  archiveFederationOutbox,
  promoteCandidate,
  reconcilePersistedScope,
  recordObservation,
  registerConnector,
  type PromoteCandidateInput
} from "./persistence";
import { getContinuousObservationCursor, submitContinuousObservationBatch } from "./continuous-persistence";
import { createConnectorRun, getConnectorHealth, getConnectorRun, setConnectorRunStatus, submitContinuousObservationBatchV2 } from "../connectors/v2-persistence";
import { issueChangeAttestation } from "./attestation";
import { verifyPersistedChangeAttestation } from "./attestation-verification";
import { principalFromAuthInfo, withRequestPrincipal, type McpAuthInfo } from "../auth";
import { upsertPolicyOverlay } from "../knowledge-readiness/repository";
import { evaluateScopedKnowledgeReadiness, type KnowledgeReadRequest } from "../knowledge-readiness/service";
import { readSystemKnowledge } from "../knowledge-readiness/read";
import { recordBudgetFailure, recordCursorInvalidation, recordReadinessEvaluation, recordReceiptReuse } from "../knowledge-readiness/metrics";

const architectureScopeSchema = z.object({
  applicationServiceId: z.string().min(1),
  scopePath: z.string().min(1)
});

const knowledgeProfileSchema = z.enum(["ARCHITECTURE_OVERVIEW", "CHANGE_ASSESSMENT", "RUNTIME_DIAGNOSIS"]);
const knowledgeSourceRoleSchema = z.enum(["DESIGN_CATALOG", "SOURCE_CODE", "API_SCHEMA", "DATA_SCHEMA", "TEST_EVIDENCE", "DEPLOYMENT", "RUNTIME_TELEMETRY"]);
const knowledgeDimensionSchema = z.enum(["DESIGN_INTENT", "IMPLEMENTATION", "RUNTIME"]);
const knowledgeSourceRequirementSchema = z.object({
  role: knowledgeSourceRoleSchema,
  dimension: knowledgeDimensionSchema,
  maximumFreshnessSeconds: z.number().int().positive(),
  maximumClockSkewSeconds: z.number().int().nonnegative(),
  requireFullSnapshot: z.boolean()
}).strict();
const knowledgePolicyOverlaySchema = z.object({
  id: z.string().min(1).max(200),
  version: z.number().int().positive(),
  profileId: knowledgeProfileSchema,
  additionalSources: z.array(knowledgeSourceRequirementSchema).max(16).optional(),
  maximumFreshnessSeconds: z.record(knowledgeSourceRoleSchema, z.number().int().positive()).optional(),
  maximumClockSkewSeconds: z.record(knowledgeSourceRoleSchema, z.number().int().nonnegative()).optional(),
  responseBudget: z.object({
    assets: z.number().int().positive().optional(),
    relationships: z.number().int().positive().optional(),
    bytes: z.number().int().positive().optional(),
    executionMilliseconds: z.number().int().positive().optional()
  }).strict().optional(),
  receiptTtlSeconds: z.number().int().positive().optional(),
  retentionDays: z.number().int().positive().optional()
}).strict();
const knowledgeSelectorsSchema = z.array(z.object({
  assetTypes: z.array(z.string().min(1).max(100)).max(100).optional(),
  assetIds: z.array(z.string().min(1).max(200)).max(100).optional(),
  relationshipTypes: z.array(z.string().min(1).max(100)).max(100).optional()
}).strict()).max(32);
const knowledgeReadInputSchema = {
  knowledgeProfile: knowledgeProfileSchema,
  selectors: knowledgeSelectorsSchema.default([]),
  purpose: z.string().min(1).max(500),
  locale: z.enum(["en", "zh"]).default("en"),
  receiptId: z.string().min(1).max(200).optional(),
  pageSize: z.number().int().positive().max(200).optional(),
  cursor: z.string().min(1).optional(),
  architectureScope: architectureScopeSchema
};

type FederationRequestExtra = {
  authInfo?: McpAuthInfo;
};

type FederationCaller = ScopedPrincipal;

type ToolHandler<T> = (input: T, caller: FederationCaller) => Promise<unknown>;

class FederationToolError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
  }
}

function textResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown): CallToolResult {
  const code = errorCode(error);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message: safeClientMessage(code) } }) }] };
}

const stableErrorCodes = new Set([
  "AUTHENTICATION_REQUIRED",
  "ATTESTATION_INPUT_INVALID",
  "ATTESTATION_PAYLOAD_INVALID",
  "ATTESTATION_REPOSITORY_MISMATCH",
  "ATTESTATION_TREE_MISMATCH",
  "ATTESTATION_PARENT_COMMIT_MISMATCH",
  "ATTESTATION_MANIFEST_MISMATCH",
  "ATTESTATION_SCOPE_MAPPING_MISMATCH",
  "ATTESTATION_SCOPE_COVERAGE_INCOMPLETE",
  "ATTESTATION_EXPIRED",
  "ATTESTATION_KEY_INVALID",
  "ATTESTATION_KEY_REVOKED",
  "ATTESTATION_KEY_UNTRUSTED",
  "ATTESTATION_SIGNATURE_INVALID",
  "ATTESTATION_SESSION_NOT_FOUND",
  "ATTESTATION_SESSION_NOT_CONVERGED",
  "ATTESTATION_RECONCILIATION_NOT_CONVERGED",
  "ATTESTATION_SIGNING_KEY_INVALID",
  "ATTESTATION_SIGNING_KEY_UNAVAILABLE",
  "AUDIT_PERSISTENCE_FAILED",
  "AUTHORITY_CONFLICT",
  "AUTHORITY_MISSING",
  "AUTHORITY_POLICY_AMBIGUOUS",
  "CANDIDATE_INPUT_UNSUPPORTED",
  "CANDIDATE_LOCALIZATION_MISMATCH",
  "CANDIDATE_CONTENT_MISMATCH",
  "CANDIDATE_DIGEST_INVALID",
  "CANDIDATE_DIGEST_MISMATCH",
  "CANDIDATE_NOT_FOUND",
  "CANDIDATE_PROVENANCE_INVALID",
  "CANDIDATE_PROVENANCE_MISMATCH",
  "CANDIDATE_STATUS_INVALID",
  "CONNECTOR_NOT_FOUND",
  "CONNECTOR_NOT_ACTIVE",
  "CONNECTOR_CAPABILITY_MISSING",
  "OBSERVATION_BATCH_CONTRACT_MISMATCH",
  "OBSERVATION_BATCH_CONTRACT_UNSUPPORTED",
  "OBSERVATION_BATCH_BUDGET_EXCEEDED",
  "OBSERVATION_BATCH_CHAIN_MISMATCH",
  "OBSERVATION_BATCH_DIGEST_MISMATCH",
  "OBSERVATION_BATCH_DUPLICATE_IDENTITY",
  "OBSERVATION_BATCH_INPUT_INVALID",
  "OBSERVATION_BATCH_SEQUENCE_CONFLICT",
  "OBSERVATION_BATCH_SEQUENCE_GAP",
  "OBSERVATION_IDENTITY_CONFLICT",
  "DELIVERY_BLOCKED",
  "DESIGN_CHANGE_SESSION_SCOPE_MISMATCH",
  "DESIGN_CHANGE_SESSION_EVIDENCE_REQUIRED",
  "DESIGN_CHANGE_SESSION_NOT_FOUND",
  "DESIGN_CHANGE_SESSION_ALREADY_CLOSED",
  "DESIGN_CHANGE_SESSION_BLOCKED",
  "DESIGN_CONTEXT_FACT_NOT_FOUND",
  "DESIGN_CONTEXT_RECONCILIATION_BLOCKED",
  "FEDERATION_TOOL_ERROR",
  "HUMAN_FACING_REQUIRED",
  "IDENTITY_CONFLICT",
  "IDENTITY_MAPPING_INVALID",
  "IDENTITY_MAPPING_MISSING",
  "LOCALIZATION_INCOMPLETE",
  "KNOWLEDGE_POLICY_VERSION_MUST_INCREASE",
  "KNOWLEDGE_POLICY_VIOLATION",
  "KNOWLEDGE_SOURCE_NOT_CONFIGURED",
  "KNOWLEDGE_COVERAGE_INCOMPLETE",
  "KNOWLEDGE_STALE",
  "KNOWLEDGE_FULL_SNAPSHOT_REQUIRED",
  "KNOWLEDGE_PENDING_PROMOTION",
  "KNOWLEDGE_RECONCILIATION_BLOCKED",
  "KNOWLEDGE_CONFLICT_UNRESOLVED",
  "KNOWLEDGE_RECEIPT_STALE",
  "KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED",
  "KNOWLEDGE_SCOPE_ACCESS_DENIED",
  "OUTBOX_ARCHIVE_CUTOFF_INVALID",
  "OUTBOX_ARCHIVE_LIMIT_INVALID",
  "OUTBOX_ARCHIVE_REASON_REQUIRED",
  "OUTBOX_ARCHIVE_STATUS_INVALID",
  "PERMISSION_DENIED",
  "PROMOTION_INPUT_INVALID",
  "POLICY_DISABLED",
  "SCOPE_MISMATCH"
]);

function errorCode(error: unknown): string {
  if (error instanceof FederationToolError) return error.code;
  if (error instanceof Error) {
    if (["AUTHORITY_MISSING", "AUTHORITY_POLICY_AMBIGUOUS", "POLICY_DISABLED"].includes(error.message)) return "AUTHORITY_CONFLICT";
    if (["OUTBOX_WRITE_FAILED", "DESIGN_CHANGE_SESSION_SCOPE_MISMATCH"].includes(error.message)) return "DELIVERY_BLOCKED";
    if (stableErrorCodes.has(error.message)) return error.message;
  }
  return "FEDERATION_TOOL_ERROR";
}

function safeClientMessage(code: string): string {
  return {
    AUTHENTICATION_REQUIRED: "An authenticated MCP caller is required.",
    ATTESTATION_INPUT_INVALID: "The change attestation request is incomplete.",
    ATTESTATION_PAYLOAD_INVALID: "The change attestation payload is invalid.",
    ATTESTATION_REPOSITORY_MISMATCH: "The change attestation targets a different repository.",
    ATTESTATION_TREE_MISMATCH: "The committed tree does not match the change attestation.",
    ATTESTATION_PARENT_COMMIT_MISMATCH: "The parent commit does not match the change attestation.",
    ATTESTATION_MANIFEST_MISMATCH: "The file manifest does not match the change attestation.",
    ATTESTATION_SCOPE_MAPPING_MISMATCH: "The Scope mapping does not match the change attestation.",
    ATTESTATION_SCOPE_COVERAGE_INCOMPLETE: "The change attestation does not cover every required Scope.",
    ATTESTATION_EXPIRED: "The change attestation has expired.",
    ATTESTATION_KEY_INVALID: "The change attestation public key is invalid.",
    ATTESTATION_KEY_REVOKED: "The change attestation key has been revoked.",
    ATTESTATION_KEY_UNTRUSTED: "The change attestation key is not trusted.",
    ATTESTATION_SIGNATURE_INVALID: "The change attestation signature is invalid.",
    ATTESTATION_SESSION_NOT_FOUND: "The attestation references a missing design change session.",
    ATTESTATION_SESSION_NOT_CONVERGED: "The attestation references a design change session that is not converged.",
    ATTESTATION_RECONCILIATION_NOT_CONVERGED: "The attestation Scope is not reconciled.",
    ATTESTATION_SIGNING_KEY_INVALID: "The attestation signing key is invalid.",
    ATTESTATION_SIGNING_KEY_UNAVAILABLE: "The attestation signing key is not configured.",
    AUDIT_PERSISTENCE_FAILED: "The federation audit record could not be persisted.",
    AUTHORITY_CONFLICT: "The requested fact has an authority conflict.",
    CANDIDATE_INPUT_UNSUPPORTED: "Promotion accepts only the selected candidate and exact Scope.",
    CANDIDATE_LOCALIZATION_MISMATCH: "The supplied localization does not match the selected candidate.",
    CANDIDATE_CONTENT_MISMATCH: "The promoted fact does not match the selected candidate observation.",
    CANDIDATE_DIGEST_INVALID: "The selected candidate observation failed content validation.",
    CANDIDATE_DIGEST_MISMATCH: "The promoted fact does not match the selected candidate observation.",
    CANDIDATE_PROVENANCE_INVALID: "The selected candidate observation failed provenance validation.",
    CANDIDATE_PROVENANCE_MISMATCH: "The promoted fact does not match the selected candidate observation.",
    DELIVERY_BLOCKED: "Federation delivery is currently blocked.",
    DESIGN_CHANGE_SESSION_EVIDENCE_REQUIRED: "A design change session requires verification evidence before it can close.",
    DESIGN_CHANGE_SESSION_NOT_FOUND: "The design change session was not found in the requested Scope.",
    DESIGN_CHANGE_SESSION_ALREADY_CLOSED: "The design change session is already closed with a different final status.",
    DESIGN_CHANGE_SESSION_BLOCKED: "The design change session is blocked.",
    DESIGN_CONTEXT_FACT_NOT_FOUND: "One or more affected design facts were not found in the requested Scope.",
    DESIGN_CONTEXT_RECONCILIATION_BLOCKED: "The requested Scope has a blocked design reconciliation state.",
    CONNECTOR_NOT_ACTIVE: "The federation connector is not active.",
    CONNECTOR_CAPABILITY_MISSING: "The federation connector does not support observation.",
    OBSERVATION_BATCH_CONTRACT_MISMATCH: "The observation stream contract does not match its persisted cursor.",
    OBSERVATION_BATCH_CONTRACT_UNSUPPORTED: "The observation stream contract is not supported.",
    OBSERVATION_BATCH_BUDGET_EXCEEDED: "The observation batch exceeds the bounded delivery budget.",
    OBSERVATION_BATCH_CHAIN_MISMATCH: "The observation batch is not linked to the last accepted batch.",
    OBSERVATION_BATCH_DIGEST_MISMATCH: "The observation batch digest does not match its content.",
    OBSERVATION_BATCH_DUPLICATE_IDENTITY: "The observation batch contains duplicate external identities.",
    OBSERVATION_BATCH_INPUT_INVALID: "The observation batch input is invalid.",
    OBSERVATION_BATCH_SEQUENCE_CONFLICT: "The observation sequence was already accepted with different content.",
    OBSERVATION_BATCH_SEQUENCE_GAP: "The observation batch sequence is not the next expected sequence.",
    OBSERVATION_IDENTITY_CONFLICT: "The observation external identity already exists with a different batch.",
    FEDERATION_TOOL_ERROR: "The federation tool request could not be completed.",
    IDENTITY_CONFLICT: "The requested fact has an identity conflict.",
    LOCALIZATION_INCOMPLETE: "The requested fact has incomplete localization.",
    KNOWLEDGE_POLICY_VERSION_MUST_INCREASE: "The knowledge policy version must increase within its exact Scope.",
    KNOWLEDGE_POLICY_VIOLATION: "The knowledge policy cannot weaken the enterprise minimum.",
    KNOWLEDGE_SOURCE_NOT_CONFIGURED: "A required knowledge source is not configured.",
    KNOWLEDGE_COVERAGE_INCOMPLETE: "The requested knowledge is not complete enough for this Profile.",
    KNOWLEDGE_STALE: "A required knowledge source is stale.",
    KNOWLEDGE_FULL_SNAPSHOT_REQUIRED: "A complete snapshot is required for this knowledge read.",
    KNOWLEDGE_PENDING_PROMOTION: "Knowledge candidates are still pending promotion.",
    KNOWLEDGE_RECONCILIATION_BLOCKED: "Knowledge reconciliation is blocked for this Scope.",
    KNOWLEDGE_CONFLICT_UNRESOLVED: "Knowledge conflicts remain unresolved.",
    KNOWLEDGE_RECEIPT_STALE: "The knowledge readiness receipt or continuation cursor is stale.",
    KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED: "The requested knowledge response exceeds its policy budget.",
    KNOWLEDGE_SCOPE_ACCESS_DENIED: "The caller is not authorized to read this architecture Scope.",
    OUTBOX_ARCHIVE_CUTOFF_INVALID: "The federation Outbox archive cutoff is invalid.",
    OUTBOX_ARCHIVE_LIMIT_INVALID: "The federation Outbox archive limit is invalid.",
    OUTBOX_ARCHIVE_REASON_REQUIRED: "A reason is required to archive federation Outbox records.",
    OUTBOX_ARCHIVE_STATUS_INVALID: "The federation Outbox archive status filter is invalid.",
    PERMISSION_DENIED: "The authenticated caller is not authorized for this federation operation.",
    PROMOTION_INPUT_INVALID: "Promotion input is invalid.",
    SCOPE_MISMATCH: "The requested architecture Scope is not authorized.",
  }[code] ?? "The federation tool request could not be completed.";
}

function assertWritableExactScope(scope: ArchitectureScopeRef, caller: FederationCaller): ArchitectureScopeRef {
  try {
    const resolved = resolveWritableScope(caller, scope);
    if (resolved.applicationServiceId !== scope.applicationServiceId || resolved.scopePath !== scope.scopePath) {
      throw new FederationToolError("SCOPE_MISMATCH");
    }
    return resolved;
  } catch (error) {
    if (error instanceof FederationToolError) throw error;
    throw new FederationToolError("SCOPE_MISMATCH", "The supplied architectureScope does not match an authorized application-service Scope.");
  }
}

function assertReadableExactScope(scope: ArchitectureScopeRef, caller: FederationCaller): ArchitectureScopeRef {
  const resolved = scopeById(scope.applicationServiceId);
  if (!resolved || resolved.level !== "applicationService" || resolved.scopePath !== scope.scopePath || !hasExactFederationScopeGrant(caller, resolved, "read")) {
    throw new FederationToolError("SCOPE_MISMATCH", "The supplied architectureScope does not match an authorized application-service Scope.");
  }
  return { applicationServiceId: resolved.id, scopePath: resolved.scopePath };
}

function hasExactFederationScopeGrant(caller: FederationCaller, scope: { id: string; scopePath: string }, action: "read" | "write"): boolean {
  return caller.grants.some((grant) => grant.scopeId === scope.id && grant.action === action && scopeById(grant.scopeId)?.scopePath === scope.scopePath);
}

function federationTarget(name: string, input: Record<string, unknown>) {
  if ("auditId" in input) return { targetType: "federation-audit", targetId: String(input.auditId) };
  if ("connectorId" in input) return { targetType: "federation-connector", targetId: String(input.connectorId) };
  if ("candidateId" in input) return { targetType: "federation-candidate", targetId: String(input.candidateId) };
  if ("id" in input) return { targetType: "federation-connector", targetId: String(input.id) };
  return { targetType: "federation-scope", targetId: String((input.architectureScope as ArchitectureScopeRef | undefined)?.applicationServiceId ?? name) };
}

function requestActor(extra: FederationRequestExtra | undefined): FederationCaller {
  const claims = extra?.authInfo;
  if (!claims && process.env.SPECFORGE_MCP_SEED === "1" && process.env.SPECFORGE_MCP_SEED_SCOPE) {
    const seedScope = scopeById(process.env.SPECFORGE_MCP_SEED_SCOPE);
    if (seedScope) {
      return principalFromAuthInfo({
        clientId: "local-design-context",
        authSource: "seed",
        tenantId: "local-development",
        scopes: ["asset:read", "asset:write", "governance:run", "graph:read", "knowledge:consume"],
        extra: {
          actor: {
            actorType: "agent",
            actorId: "local-design-context",
            grants: [
              { scopeId: seedScope.id, action: "read" },
              { scopeId: seedScope.id, action: "write" }
            ]
          }
        }
      });
    }
  }
  try {
    return principalFromAuthInfo(claims);
  } catch (error) {
    throw new FederationToolError(error instanceof Error ? error.message : "AUTHENTICATION_REQUIRED", "MCP authInfo does not contain a valid normalized principal.");
  }
}

function readableKnowledgeScope(scope: ArchitectureScopeRef, caller: FederationCaller): ArchitectureScopeRef | undefined {
  const resolved = scopeById(scope.applicationServiceId);
  if (!resolved || resolved.level !== "applicationService" || resolved.scopePath !== scope.scopePath || !hasExactFederationScopeGrant(caller, resolved, "read")) return undefined;
  return { applicationServiceId: resolved.id, scopePath: resolved.scopePath };
}

function deniedKnowledgeRead() {
  return {
    accessDecision: "DENY" as const,
    trustStatus: "BLOCKED" as const,
    assets: [],
    relationships: [],
    responseCompleteness: "COMPLETE" as const,
    reasonCodes: ["KNOWLEDGE_SCOPE_ACCESS_DENIED" as const],
    remediationActions: []
  };
}

function recordKnowledgeOutcome(scope: ArchitectureScopeRef, result: { accessDecision: "ALLOW" | "DENY"; profileId?: string; reasonCodes: readonly string[]; receiptId?: string; asOf?: string }, startedAt: number, input: { receiptId?: string; cursor?: string }): void {
  if (result.profileId === "ARCHITECTURE_OVERVIEW" || result.profileId === "CHANGE_ASSESSMENT" || result.profileId === "RUNTIME_DIAGNOSIS") {
    recordReadinessEvaluation(scope, {
      profileId: result.profileId,
      accessDecision: result.accessDecision,
      reasonCodes: result.reasonCodes as never,
      latencyMilliseconds: Date.now() - startedAt
    });
  }
  if (!input.receiptId && result.receiptId && result.asOf && Date.parse(result.asOf) < startedAt) recordReceiptReuse(scope);
  if (input.cursor && result.reasonCodes.includes("KNOWLEDGE_RECEIPT_STALE")) recordCursorInvalidation(scope);
  if (result.reasonCodes.includes("KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED")) recordBudgetFailure(scope);
}

function auditActor(extra: FederationRequestExtra | undefined): { actorType: FederationCaller["actorType"]; actorId: string } {
  try {
    const principal = requestActor(extra);
    return { actorType: principal.actorType, actorId: principal.actorId };
  } catch {
    return { actorType: "agent", actorId: "unauthenticated" };
  }
}

function authorizeCaller(caller: FederationCaller, permissions: Permission[], input: Record<string, unknown>): void {
  const scope = input.architectureScope;
  if (!isArchitectureScope(scope)) throw new FederationToolError("SCOPE_MISMATCH");
  const registered = scopeById(scope.applicationServiceId);
  if (!registered || registered.level !== "applicationService" || registered.scopePath !== scope.scopePath) {
    throw new FederationToolError("SCOPE_MISMATCH");
  }
  const operationGrants = caller.operationGrants;
  if (operationGrants
    ? permissions.some((permission) => !operationGrants.some((grant) => grant.scopeId === registered.id && grant.operation === permission))
    : permissions.some((permission) => !caller.permissions.includes(permission))) {
    throw new FederationToolError("PERMISSION_DENIED");
  }
  if (permissions.includes("asset:write") && !hasExactFederationScopeGrant(caller, registered, "write")) throw new FederationToolError("PERMISSION_DENIED");
  if ((permissions.includes("asset:read") || permissions.includes("governance:run")) && !hasExactFederationScopeGrant(caller, registered, "read")) throw new FederationToolError("PERMISSION_DENIED");
}

type FederationAuditInput = {
  actor: { actorType: FederationCaller["actorType"]; actorId: string };
  action: string;
  targetType: string;
  targetId: string;
  toolInput: unknown;
  output: unknown;
  status: "success" | "failed";
  errorMessage?: string;
};

function auditScopeFromInput(value: unknown): ArchitectureScopeRef | undefined {
  if (!isRecord(value) || !isArchitectureScope(value.architectureScope)) return undefined;
  return value.architectureScope;
}

async function createFederationAudit(input: FederationAuditInput): Promise<string> {
  const architectureScope = auditScopeFromInput(input.toolInput);
  const row = await prisma.auditLog.create({
    data: {
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      channel: "mcp",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      inputSummary: summarizeAuditInput(input.toolInput),
      outputSummary: summarizeAudit(input.output),
      status: "PENDING",
      errorMessage: undefined,
      applicationServiceId: architectureScope?.applicationServiceId,
      scopePath: architectureScope?.scopePath
    }
  });
  if (!row || typeof row.id !== "string") throw new FederationToolError("AUDIT_PERSISTENCE_FAILED");
  return row.id;
}

async function finalizeFederationAudit(id: string, input: FederationAuditInput): Promise<void> {
  await prisma.auditLog.update({
    where: { id },
    data: {
      outputSummary: summarizeAudit(input.output),
      status: input.status,
      errorMessage: input.errorMessage
    }
  });
}

async function finalizeFederationAuditRecoverable(id: string, input: FederationAuditInput): Promise<void> {
  try {
    await finalizeFederationAudit(id, input);
  } catch {
    try {
      await prisma.auditLog.update({
        where: { id },
        data: {
          outputSummary: summarizeAudit(input.output),
          status: input.status === "success" ? "SUCCESS_REPAIR_REQUIRED" : "FAILED_REPAIR_REQUIRED",
          errorMessage: "AUDIT_FINALIZATION_RETRY_REQUIRED"
        }
      });
    } catch {
      // The caller still receives a stable failure if the recovery marker cannot be persisted.
    }
    throw new FederationToolError("AUDIT_PERSISTENCE_FAILED");
  }
}

/** Repairs a durable finalization marker; repeated calls are safe after convergence. */
export async function retryFederationAuditFinalization(id: string, requestedScope: ArchitectureScopeRef): Promise<void> {
  try {
    if (!isArchitectureScope(requestedScope)) throw new FederationToolError("SCOPE_MISMATCH");
    const row = await prisma.auditLog.findFirst({
      where: {
        id,
        applicationServiceId: requestedScope.applicationServiceId,
        scopePath: requestedScope.scopePath
      }
    });
    if (!row || (row.status !== "SUCCESS_REPAIR_REQUIRED" && row.status !== "FAILED_REPAIR_REQUIRED" && row.status !== "success" && row.status !== "failed")) {
      throw new FederationToolError("AUDIT_PERSISTENCE_FAILED");
    }
    const persistedScope = auditScopeFromSummary(row.inputSummary);
    if (!persistedScope || persistedScope.applicationServiceId !== row.applicationServiceId || persistedScope.scopePath !== row.scopePath) {
      throw new FederationToolError("SCOPE_MISMATCH");
    }
    if (row.status === "success" || row.status === "failed") return;
    await prisma.auditLog.update({
      where: { id },
      data: {
        status: row.status === "SUCCESS_REPAIR_REQUIRED" ? "success" : "failed",
        errorMessage: undefined
      }
    });
  } catch (error) {
    if (error instanceof FederationToolError) throw error;
    throw new FederationToolError("AUDIT_PERSISTENCE_FAILED");
  }
}

function summarizeAudit(value: unknown): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(redactAuditValue(value));
    return (text ?? "").slice(0, 500);
  } catch {
    return "[unserializable]";
  }
}

function summarizeAuditInput(value: unknown): string {
  if (isRecord(value) && isArchitectureScope(value.architectureScope)) {
    return summarizeAudit({ architectureScope: value.architectureScope, input: value });
  }
  return summarizeAudit(value);
}

function auditFailureDiagnostic(code: string, action: string, target: { targetType: string; targetId: string }, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const diagnosticRef = contentDigest({ action, targetType: target.targetType, targetId: target.targetId, detail });
  return `${code};diagnosticRef=${diagnosticRef}`;
}

function redactAuditValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && isSensitiveAuditKey(key)) return "[REDACTED]";
  if (key === "payload") return { digest: contentDigest(value), redacted: true };
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => redactAuditValue(item, undefined, seen));
  } else {
    result = Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1)
      .map(([entryKey, entryValue]) => [entryKey, redactAuditValue(entryValue, entryKey, seen)]));
  }
  seen.delete(value);
  return result;
}

function isSensitiveAuditKey(key: string): boolean {
  return /(?:secret|password|token|authorization|credential|private[-_]?key|api[-_]?key|access[-_]?key|cookie)/i.test(key);
}

function auditScopeFromSummary(value: string): ArchitectureScopeRef | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return undefined;
    const directScope = parsed.architectureScope;
    if (isArchitectureScope(directScope)) return directScope;
    const nestedInput = parsed.input;
    if (isRecord(nestedInput) && isArchitectureScope(nestedInput.architectureScope)) return nestedInput.architectureScope;
    return undefined;
  } catch {
    return undefined;
  }
}

function isArchitectureScope(value: unknown): value is ArchitectureScopeRef {
  return isRecord(value) && typeof value.applicationServiceId === "string" && typeof value.scopePath === "string";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scopedCatalogAssetIds(catalog: Record<string, unknown>): Array<{ id: string; type: string }> {
  return Object.entries(catalog).flatMap(([type, value]) => Array.isArray(value)
    ? value.filter(isRecord).flatMap((asset) => typeof asset.id === "string" ? [{ id: asset.id, type }] : [])
    : []);
}

function candidateCanonicalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { localizedContent: _localizedContent, ...canonicalPayload } = payload;
  return canonicalPayload;
}

function registerFederationJsonTool<T extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: T; permissions: Permission[]; readOnly: boolean },
  handler: ToolHandler<z.output<z.ZodObject<T>>>
) {
  server.registerTool(
    name,
    {
      title: config.title,
      description: `${config.description} Required permissions: ${config.permissions.join(", ")}.`,
      inputSchema: config.inputSchema,
      annotations: {
        title: config.title,
        readOnlyHint: config.readOnly,
        destructiveHint: false,
        idempotentHint: config.readOnly,
        openWorldHint: false
      },
      _meta: { permissions: config.permissions, write: !config.readOnly }
    } as Parameters<McpServer["registerTool"]>[1],
    (async (input: unknown, extra: FederationRequestExtra) => {
      const target = federationTarget(name, input as Record<string, unknown>);
      const auditIdentity = auditActor(extra);
      let auditId: string | undefined;
      try {
        auditId = await createFederationAudit({ actor: auditIdentity, action: name, ...target, toolInput: input, output: "pending", status: "failed" });
        const caller = requestActor(extra);
        authorizeCaller(caller, config.permissions, input as Record<string, unknown>);
        const output = await withRequestPrincipal(caller, () => handler(input as z.output<z.ZodObject<T>>, caller));
        try {
          await finalizeFederationAuditRecoverable(auditId, { actor: caller, action: name, ...target, toolInput: input, output, status: "success" });
        } catch (auditError) {
          console.error(`[specforge-mcp] federation success audit finalization failed for ${name}: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
          return errorResult(new FederationToolError("AUDIT_PERSISTENCE_FAILED"));
        }
        return textResult(output);
      } catch (error) {
        const code = errorCode(error);
        const output = { error: { code } };
        if (!auditId) {
          console.error(`[specforge-mcp] federation audit creation failed for ${name}: ${error instanceof Error ? error.message : String(error)}`);
          return errorResult(new FederationToolError("AUDIT_PERSISTENCE_FAILED"));
        }
        try {
          await finalizeFederationAuditRecoverable(auditId, { actor: auditIdentity, action: name, ...target, toolInput: input, output, status: "failed", errorMessage: auditFailureDiagnostic(errorCode(error), name, target, error) });
        } catch (auditError) {
          console.error(`[specforge-mcp] federation audit persistence failed for ${name}: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
          return errorResult(new FederationToolError("AUDIT_PERSISTENCE_FAILED"));
        }
        return errorResult(error);
      }
    }) as Parameters<McpServer["registerTool"]>[2]
  );
}

export function registerFederationTools(server: McpServer): void {
  registerFederationJsonTool(server, "upsert_knowledge_readiness_policy", {
    title: "Upsert knowledge readiness policy",
    description: "Stores a stricter knowledge-readiness policy overlay in one exact application-service Scope.",
    inputSchema: {
      overlay: knowledgePolicyOverlaySchema,
      architectureScope: architectureScopeSchema
    },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, async (input, caller) => upsertPolicyOverlay(prisma, {
    architectureScope: assertWritableExactScope(input.architectureScope, caller),
    actorId: caller.actorId,
    overlay: input.overlay
  }));

  registerFederationJsonTool(server, "evaluate_system_knowledge_readiness", {
    title: "Evaluate system knowledge readiness",
    description: "Evaluates whether one exact Scope has sufficient, current, and converged knowledge for an Agent Profile.",
    inputSchema: knowledgeReadInputSchema,
    permissions: ["knowledge:consume"],
    readOnly: true
  }, async (input, caller) => {
    const architectureScope = readableKnowledgeScope(input.architectureScope, caller);
    if (!architectureScope) return deniedKnowledgeRead();
    const startedAt = Date.now();
    const result = await evaluateScopedKnowledgeReadiness(prisma, { ...input, architectureScope } as KnowledgeReadRequest, caller);
    recordKnowledgeOutcome(architectureScope, result, startedAt, input);
    return result;
  });

  registerFederationJsonTool(server, "read_system_knowledge", {
    title: "Read system knowledge",
    description: "Returns only bounded knowledge facts after exact-Scope readiness evaluation and waterline-bound authorization.",
    inputSchema: knowledgeReadInputSchema,
    permissions: ["knowledge:consume"],
    readOnly: true
  }, async (input, caller) => {
    const architectureScope = readableKnowledgeScope(input.architectureScope, caller);
    if (!architectureScope) return deniedKnowledgeRead();
    const startedAt = Date.now();
    const result = await readSystemKnowledge(prisma, { ...input, architectureScope } as KnowledgeReadRequest, caller);
    recordKnowledgeOutcome(architectureScope, result, startedAt, input);
    return result;
  });

  registerFederationJsonTool(server, "register_connector", {
    title: "Register federation connector",
    description: "Registers a source-neutral connector in one exact architecture Scope.",
    inputSchema: {
      id: z.string().min(1),
      kind: z.string().min(1),
      capabilities: z.array(z.enum(["DISCOVER", "OBSERVE", "PROPOSE", "APPLY"])),
      status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).optional(),
      secretReference: z.string().min(1).optional(),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write"],
    readOnly: false
  }, async (input, caller) => registerConnector({
    ...input,
    capabilities: input.capabilities as ConnectorCapability[],
    status: input.status ?? "ACTIVE",
    architectureScope: assertWritableExactScope(input.architectureScope, caller)
  }));

  registerFederationJsonTool(server, "record_external_observation", {
    title: "Record external observation",
    description: "Records a candidate source observation and its durable federation delivery receipt.",
    inputSchema: {
      connectorId: z.string().min(1),
      sourceNamespace: z.string().min(1),
      externalAssetType: z.string().min(1),
      externalId: z.string().min(1),
      payload: z.record(z.unknown()),
      sourceVersion: z.string().min(1),
      observedAt: z.string().datetime().optional(),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write"],
    readOnly: false
  }, async (input, caller) => {
    const architectureScope = assertWritableExactScope(input.architectureScope, caller);
    const normalizedDigest = contentDigest(candidateCanonicalPayload(input.payload));
    const identity = `${input.connectorId}:${input.sourceNamespace}:${input.externalAssetType}:${input.externalId}:${input.sourceVersion}:${normalizedDigest}`;
    const observedAt = input.observedAt ?? new Date().toISOString();
    return recordObservation({
      id: `observation:${contentDigest(identity)}`,
      connectorId: input.connectorId,
      sourceNamespace: input.sourceNamespace,
      externalAssetType: input.externalAssetType,
      externalId: input.externalId,
      payload: input.payload,
      normalizedDigest,
      sourceVersion: input.sourceVersion,
      observedAt,
      status: "CANDIDATE",
      provenance: {
        sourceSystem: input.sourceNamespace,
        connectorInstanceId: input.connectorId,
        externalIdentity: `${input.externalAssetType}:${input.externalId}`,
        externalVersion: input.sourceVersion,
        observedAt
      },
      idempotencyKey: `federation-observation:${contentDigest(identity)}`,
      architectureScope
    });
  });

  registerFederationJsonTool(server, "promote_candidate_fact", {
    title: "Promote candidate fact",
    description: "Promotes an approved candidate through scoped identity, authority, and localization checks.",
    inputSchema: {
      candidateId: z.string().min(1),
      approvalReason: z.string().min(1),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write"],
    readOnly: false
  }, async (input, caller) => {
    const rawInput = input as Record<string, unknown>;
    if (Object.keys(rawInput).some((field) => !["candidateId", "approvalReason", "architectureScope"].includes(field))) {
      throw new FederationToolError("CANDIDATE_INPUT_UNSUPPORTED");
    }
    return promoteCandidate({
      candidateId: input.candidateId,
      approvalReason: input.approvalReason,
      architectureScope: assertWritableExactScope(input.architectureScope, caller)
    } satisfies PromoteCandidateInput);
  });

  registerFederationJsonTool(server, "create_design_change_session", {
    title: "Create design change session",
    description: "Creates an OPEN governance change session in one exact architecture Scope.",
    inputSchema: {
      intent: z.string().min(1),
      affectedFactIds: z.array(z.string().min(1)).min(1),
      expectedEvidenceRefs: z.array(z.string().min(1)).optional(),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write"],
    readOnly: false
  }, async (input, caller) => createDesignChangeSession({
    id: `design-change-session:${randomUUID()}`,
    actorId: caller.actorId,
    intent: input.intent,
    affectedFactIds: input.affectedFactIds,
    expectedEvidenceRefs: input.expectedEvidenceRefs ?? [],
    status: "OPEN",
    architectureScope: assertWritableExactScope(input.architectureScope, caller)
  }));

  registerFederationJsonTool(server, "prepare_design_change", {
    title: "Prepare design change",
    description: "Reads the exact Scope design context, captures a digest, and opens an audited change session before implementation.",
    inputSchema: {
      intent: z.string().min(1),
      affectedFactIds: z.array(z.string().min(1)).min(1),
      expectedEvidenceRefs: z.array(z.string().min(1)).min(1),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:read", "asset:write", "graph:read"],
    readOnly: false
  }, async (input, caller) => {
    const architectureScope = assertWritableExactScope(input.architectureScope, caller);
    const catalog = await loadScopedAssetCatalog(architectureScope.applicationServiceId);
    const allAssets = scopedCatalogAssetIds(catalog as unknown as Record<string, unknown>);
    const knownAssetIds = new Set(allAssets.map((asset) => asset.id));
    const verificationScopeAnchors = input.affectedFactIds.filter((id) => id.startsWith("verification-scope:"));
    const missing = input.affectedFactIds.filter((id) => !verificationScopeAnchors.includes(id) && !knownAssetIds.has(id));
    if (missing.length) throw new FederationToolError("DESIGN_CONTEXT_FACT_NOT_FOUND", missing.join(","));
    const registeredScope = scopeById(architectureScope.applicationServiceId);
    if (registeredScope?.purpose === "verification" && knownAssetIds.size === 0 && verificationScopeAnchors.length === 0) throw new FederationToolError("DESIGN_CONTEXT_VERIFICATION_SCOPE_ANCHOR_REQUIRED");
    const links = (await listPersistedAssetLinks(architectureScope.applicationServiceId)).filter((link) => link.architectureScope?.scopePath === architectureScope.scopePath);
    const latestReconciliation = await prisma.reconciliationSnapshot.findFirst({ where: architectureScope, orderBy: { createdAt: "desc" } });
    if (latestReconciliation?.status === "BLOCKED") throw new FederationToolError("DESIGN_CONTEXT_RECONCILIATION_BLOCKED");
    const affectedIds = new Set(input.affectedFactIds);
    const relatedAssetIds = new Set(input.affectedFactIds);
    for (const link of links) {
      if (affectedIds.has(link.sourceId)) relatedAssetIds.add(link.targetId);
      if (affectedIds.has(link.targetId)) relatedAssetIds.add(link.sourceId);
    }
    const preflightDigest = contentDigest({
      architectureScope,
      catalog,
      links,
      reconciliation: latestReconciliation ? { root: latestReconciliation.root, status: latestReconciliation.status, factDigests: latestReconciliation.factDigests } : null
    });
    const preflightRelationshipDigest = contentDigest(links);
    const session = await createDesignChangeSession({
      id: `design-change-session:${randomUUID()}`,
      actorId: caller.actorId,
      intent: input.intent,
      affectedFactIds: input.affectedFactIds,
      expectedEvidenceRefs: input.expectedEvidenceRefs,
      preflightDigest,
      preflightRelationshipDigest,
      preflightReadAssetIds: [...relatedAssetIds].sort(),
      status: "OPEN",
      architectureScope
    });
    return {
      receipt: {
        sessionId: session.id,
        actorId: caller.actorId,
        architectureScope,
        intent: input.intent,
        affectedFactIds: input.affectedFactIds,
        readAssetIds: [...relatedAssetIds].sort(),
        readAssetCount: allAssets.length,
        relationshipDigest: preflightRelationshipDigest,
        designContextDigest: preflightDigest,
        reconciliation: latestReconciliation ? { root: latestReconciliation.root, status: latestReconciliation.status } : { status: "UNVERIFIED" },
        status: session.status
      },
      session
    };
  });

  registerFederationJsonTool(server, "submit_continuous_observation_batch", {
    title: "Submit continuous observation batch",
    description: "Accepts one hash-chained, bounded, exact-Scope observation batch from an authorized connector and persists its cursor and delivery receipt.",
    inputSchema: {
      connectorId: z.string().min(1),
      sourceNamespace: z.string().min(1),
      contractVersion: z.literal("continuous-observation/v1"),
      sequence: z.number().int().min(0),
      previousBatchDigest: z.string().min(1).nullable(),
      sourceCursor: z.string().min(1).nullable(),
      observedAt: z.string().datetime(),
      coverage: z.record(z.unknown()).default({}),
      observations: z.array(z.object({
        id: z.string().min(1),
        externalAssetType: z.string().min(1),
        externalId: z.string().min(1),
        payload: z.record(z.unknown()),
        sourceVersion: z.string().min(1),
        observedAt: z.string().datetime().optional()
      })).max(500),
      payloadDigest: z.string().length(64),
      batchDigest: z.string().length(64),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write"],
    readOnly: false
  }, async (input, caller) => {
    const architectureScope = assertWritableExactScope(input.architectureScope, caller);
    return submitContinuousObservationBatch({
      architectureScope,
      batch: { ...input, architectureScope }
    });
  });

  registerFederationJsonTool(server, "get_continuous_observation_cursor", {
    title: "Get continuous observation cursor",
    description: "Returns the last accepted continuous observation checkpoint for one exact architecture Scope.",
    inputSchema: {
      connectorId: z.string().min(1),
      sourceNamespace: z.string().min(1),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:read"],
    readOnly: true
  }, async (input, caller) => getContinuousObservationCursor(assertReadableExactScope(input.architectureScope, caller), input.connectorId, input.sourceNamespace));

  registerFederationJsonTool(server, "create_connector_run", {
    title: "Create connector run",
    description: "Queues one exact-Scope connector run for a full snapshot or delta observation.",
    inputSchema: {
      id: z.string().min(1), connectorId: z.string().min(1), sourceNamespace: z.string().min(1),
      mode: z.enum(["FULL_SNAPSHOT", "DELTA"]), snapshotId: z.string().min(1).nullable(), mappingVersion: z.string().min(1), mappingDigest: z.string().length(64), inventoryBoundaryDigest: z.string().length(64), coverage: z.record(z.unknown()).optional(), architectureScope: architectureScopeSchema
    }, permissions: ["asset:write"], readOnly: false
  }, async (input, caller) => createConnectorRun({ ...input, architectureScope: assertWritableExactScope(input.architectureScope, caller) }));

  registerFederationJsonTool(server, "submit_continuous_observation_batch_v2", {
    title: "Submit continuous observation batch v2",
    description: "Accepts one bounded, fenced, exact-Scope v2 observation batch.",
    inputSchema: {
      contractVersion: z.literal("continuous-observation/v2"), architectureScope: architectureScopeSchema, connectorId: z.string().min(1), sourceNamespace: z.string().min(1), runId: z.string().min(1), fencingToken: z.string().min(1), mode: z.enum(["FULL_SNAPSHOT", "DELTA"]), snapshotId: z.string().min(1).nullable(), mappingVersion: z.string().min(1), mappingDigest: z.string().length(64), inventoryBoundaryDigest: z.string().length(64), sequence: z.number().int().min(0), previousBatchDigest: z.string().length(64).nullable(), pageIndex: z.number().int().min(0), isLastPage: z.boolean(), sourceCursor: z.string().nullable(), sourceHighWaterMark: z.string().nullable(), observedAt: z.string().datetime(), coverage: z.record(z.unknown()), observations: z.array(z.object({ id: z.string().min(1), operation: z.enum(["UPSERT", "TOMBSTONE"]), externalAssetType: z.string().min(1), externalId: z.string().min(1), payload: z.record(z.unknown()).optional(), deletionReason: z.string().min(1).optional(), sourceVersion: z.string().min(1), observedAt: z.string().datetime().optional() })).max(500), payloadDigest: z.string().length(64), batchDigest: z.string().length(64)
    }, permissions: ["asset:write"], readOnly: false
  }, async (input, caller) => {
    const architectureScope = assertWritableExactScope(input.architectureScope, caller);
    return submitContinuousObservationBatchV2({ architectureScope, batch: { ...input, architectureScope } });
  });

  registerFederationJsonTool(server, "get_connector_run", {
    title: "Get connector run", description: "Returns one read-only connector run in the exact authorized Scope.", inputSchema: { runId: z.string().min(1), architectureScope: architectureScopeSchema }, permissions: ["asset:read"], readOnly: true
  }, async (input, caller) => getConnectorRun(assertReadableExactScope(input.architectureScope, caller), input.runId));

  registerFederationJsonTool(server, "pause_connector_run", {
    title: "Pause connector run", description: "Pauses one exact-Scope queued or active connector run.", inputSchema: { runId: z.string().min(1), architectureScope: architectureScopeSchema }, permissions: ["asset:write"], readOnly: false
  }, async (input, caller) => setConnectorRunStatus({ runId: input.runId, status: "PAUSED", architectureScope: assertWritableExactScope(input.architectureScope, caller) }));

  registerFederationJsonTool(server, "resume_connector_run", {
    title: "Resume connector run", description: "Resumes one exact-Scope paused connector run.", inputSchema: { runId: z.string().min(1), architectureScope: architectureScopeSchema }, permissions: ["asset:write"], readOnly: false
  }, async (input, caller) => setConnectorRunStatus({ runId: input.runId, status: "QUEUED", architectureScope: assertWritableExactScope(input.architectureScope, caller) }));

  registerFederationJsonTool(server, "get_connector_health", {
    title: "Get connector health", description: "Returns read-only freshness, cursor, latest run, and dead-letter status for one exact Scope.", inputSchema: { connectorId: z.string().min(1), sourceNamespace: z.string().min(1), architectureScope: architectureScopeSchema }, permissions: ["asset:read"], readOnly: true
  }, async (input, caller) => getConnectorHealth(assertReadableExactScope(input.architectureScope, caller), input.connectorId, input.sourceNamespace));

  registerFederationJsonTool(server, "close_design_change_session", {
    title: "Close design change session",
    description: "Closes an exact-Scope change session as converged or blocked with verification evidence.",
    inputSchema: {
      sessionId: z.string().min(1),
      status: z.enum(["CONVERGED", "BLOCKED"]),
      verificationEvidenceRefs: z.array(z.string().min(1)).min(1),
      closureReason: z.string().min(1).optional(),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write", "governance:run"],
    readOnly: false
  }, async (input, caller) => closeDesignChangeSession({
    id: input.sessionId,
    status: input.status,
    verificationEvidenceRefs: input.verificationEvidenceRefs,
    closureReason: input.closureReason,
    architectureScope: assertWritableExactScope(input.architectureScope, caller)
  }));

  registerFederationJsonTool(server, "issue_change_attestation", {
    title: "Issue change attestation",
    description: "Closes converged exact-Scope sessions and issues a short-lived signed attestation bound to staged Git evidence.",
    inputSchema: {
      repositoryId: z.string().min(1),
      parentCommit: z.string().min(1),
      stagedTreeHash: z.string().min(1),
      fileManifestDigest: z.string().min(1),
      configDigest: z.string().min(1),
      scopeMappingDigest: z.string().min(1),
      manifest: z.array(z.record(z.unknown())),
      scopes: z.array(z.object({
        architectureScope: architectureScopeSchema,
        sessionId: z.string().min(1)
      })).min(1),
      actorId: z.string().min(1),
      verificationEvidenceRefs: z.array(z.string().min(1)).min(1),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write", "governance:run"],
    readOnly: false
  }, async (input, caller) => {
    const primaryScope = assertWritableExactScope(input.architectureScope, caller);
    const scopes = input.scopes.map((binding) => ({
      architectureScope: assertWritableExactScope(binding.architectureScope, caller),
      sessionId: binding.sessionId
    }));
    if (!scopes.some((binding) => binding.architectureScope.applicationServiceId === primaryScope.applicationServiceId && binding.architectureScope.scopePath === primaryScope.scopePath)) {
      throw new FederationToolError("SCOPE_MISMATCH");
    }
    const { architectureScope: _architectureScope, ...attestationInput } = input;
    return issueChangeAttestation({ ...attestationInput, scopes });
  });

  registerFederationJsonTool(server, "verify_change_attestation", {
    title: "Verify change attestation",
    description: "Recomputes CI repository evidence against a signed attestation without mutating design facts.",
    inputSchema: {
      attestation: z.object({ payload: z.record(z.unknown()), signature: z.string().min(1), publicKey: z.string().min(1) }),
      evidence: z.object({
        repositoryId: z.string().min(1),
        parentCommit: z.string().min(1).optional(),
        committedTreeHash: z.string().min(1),
        fileManifestDigest: z.string().min(1).optional(),
        scopeMappingDigest: z.string().min(1).optional(),
        requiredScopes: z.array(architectureScopeSchema).min(1)
      }),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:read", "governance:run"],
    readOnly: true
  }, async (input, caller) => {
    const primaryScope = assertReadableExactScope(input.architectureScope, caller);
    const requiredScopes = input.evidence.requiredScopes.map((scope) => assertReadableExactScope(scope, caller));
    if (!requiredScopes.some((scope) => scope.applicationServiceId === primaryScope.applicationServiceId && scope.scopePath === primaryScope.scopePath)) throw new FederationToolError("SCOPE_MISMATCH");
    return verifyPersistedChangeAttestation({ attestation: input.attestation, evidence: { ...input.evidence, requiredScopes } });
  });

  registerFederationJsonTool(server, "reconcile_federated_scope", {
    title: "Reconcile federated Scope",
    description: "Runs a read-only reconciliation and returns deterministic diagnostics for one exact architecture Scope.",
    inputSchema: {
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:read", "governance:run"],
    readOnly: true
  }, async (input, caller) => {
    const architectureScope = assertReadableExactScope(input.architectureScope, caller);
    return reconcilePersistedScope({ architectureScope });
  });

  registerFederationJsonTool(server, "archive_stale_federation_outbox", {
    title: "Archive stale federation Outbox",
    description: "Archives bounded historical federation Outbox records in one exact Scope without deleting payloads, diagnostics, or audit history.",
    inputSchema: {
      before: z.string().datetime(),
      statuses: z.array(z.enum(["PENDING", "DELIVERING", "DEAD_LETTER"])).min(1),
      limit: z.number().int().min(1).max(5000),
      reason: z.string().min(1),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write", "governance:run"],
    readOnly: false
  }, async (input, caller) => archiveFederationOutbox({
    before: input.before,
    statuses: input.statuses,
    limit: input.limit,
    reason: input.reason,
    architectureScope: assertWritableExactScope(input.architectureScope, caller)
  }));

  registerFederationJsonTool(server, "retry_federated_audit_finalization", {
    title: "Retry federation audit finalization",
    description: "Repairs one persisted federation audit marker in the exact authorized architecture Scope.",
    inputSchema: {
      auditId: z.string().min(1),
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:read", "asset:write", "governance:run"],
    readOnly: false
  }, async (input, caller) => {
    const architectureScope = assertWritableExactScope(input.architectureScope, caller);
    await retryFederationAuditFinalization(input.auditId, architectureScope);
    return { auditId: input.auditId, status: "success", architectureScope };
  });

  registerFederationJsonTool(server, "get_federated_sync_status", {
    title: "Get federated sync status",
    description: "Returns read-only connector, delivery, conflict, and reconciliation status for one exact architecture Scope.",
    inputSchema: { architectureScope: architectureScopeSchema },
    permissions: ["asset:read"],
    readOnly: true
  }, async (input, caller) => {
    const architectureScope = assertReadableExactScope(input.architectureScope, caller);
    const [connectors, pendingDelivery, conflicts, latestReconciliation] = await Promise.all([
      prisma.connectorInstance.findMany({ where: architectureScope, orderBy: { id: "asc" } }),
      prisma.federationOutbox.count({ where: { ...architectureScope, status: "PENDING" } }),
      prisma.sourceObservation.count({ where: { ...architectureScope, status: "CONFLICTED" } }),
      prisma.reconciliationSnapshot.findFirst({ where: architectureScope, orderBy: { createdAt: "desc" } })
    ]);
    return {
      architectureScope,
      connectors: connectors.map((connector) => ({
        id: connector.id,
        kind: connector.kind,
        status: connector.status,
        freshness: connector.updatedAt ? connector.updatedAt.toISOString() : "UNKNOWN"
      })),
      pendingDelivery,
      conflicts,
      latestReconciliation: latestReconciliation
        ? { root: latestReconciliation.root, status: latestReconciliation.status, createdAt: latestReconciliation.createdAt.toISOString() }
        : null
    };
  });
}
