import { contentDigest, scopeById, type ArchitectureScopeRef, type ConnectorCapability, type Permission, type ScopedActor } from "@specforge/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma, resolveWritableScope } from "../persistence";
import {
  createDesignChangeSession,
  promoteCandidate,
  reconcilePersistedScope,
  recordObservation,
  registerConnector,
  type PromoteCandidateInput
} from "./persistence";

const architectureScopeSchema = z.object({
  applicationServiceId: z.string().min(1),
  scopePath: z.string().min(1)
});

type FederationRequestExtra = {
  authInfo?: {
    clientId: string;
    scopes?: string[];
    extra?: Record<string, unknown>;
  };
};

type FederationCaller = ScopedActor & {
  permissions: Permission[];
};

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
  "DELIVERY_BLOCKED",
  "DESIGN_CHANGE_SESSION_SCOPE_MISMATCH",
  "FEDERATION_TOOL_ERROR",
  "HUMAN_FACING_REQUIRED",
  "IDENTITY_CONFLICT",
  "IDENTITY_MAPPING_INVALID",
  "IDENTITY_MAPPING_MISSING",
  "LOCALIZATION_INCOMPLETE",
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
    CONNECTOR_NOT_ACTIVE: "The federation connector is not active.",
    CONNECTOR_CAPABILITY_MISSING: "The federation connector does not support observation.",
    FEDERATION_TOOL_ERROR: "The federation tool request could not be completed.",
    IDENTITY_CONFLICT: "The requested fact has an identity conflict.",
    LOCALIZATION_INCOMPLETE: "The requested fact has incomplete localization.",
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
  const rawClaims = claims?.extra;
  const rawActor = isRecord(rawClaims?.actor) ? rawClaims.actor : rawClaims;
  const actorType = rawActor?.actorType;
  const actorId = rawActor?.actorId ?? rawClaims?.subject ?? claims?.clientId;
  const grants = rawActor?.grants;
  if ((actorType !== "agent" && actorType !== "user" && actorType !== "system") || typeof actorId !== "string" || !Array.isArray(grants)) {
    throw new FederationToolError("AUTHENTICATION_REQUIRED", "MCP authInfo.extra must contain a repository-compatible actor and scope grants.");
  }
  const normalizedGrants = grants.filter(isScopeGrant);
  if (normalizedGrants.length !== grants.length) {
    throw new FederationToolError("AUTHENTICATION_REQUIRED", "MCP authInfo.extra contains invalid scope grants.");
  }
  const permissions = (claims?.scopes ?? []).filter(isPermission);
  return { actorType, actorId, grants: normalizedGrants, permissions: [...new Set(permissions)] };
}

function auditActor(extra: FederationRequestExtra | undefined): { actorType: FederationCaller["actorType"]; actorId: string } {
  const claims = extra?.authInfo;
  const rawClaims = claims?.extra;
  const rawActor = isRecord(rawClaims?.actor) ? rawClaims.actor : rawClaims;
  const actorType = rawActor?.actorType;
  return {
    actorType: actorType === "user" || actorType === "system" || actorType === "agent" ? actorType : "agent",
    actorId: typeof rawActor?.actorId === "string" ? rawActor.actorId : claims?.clientId ?? "unauthenticated"
  };
}

function authorizeCaller(caller: FederationCaller, permissions: Permission[], input: Record<string, unknown>): void {
  const scope = input.architectureScope;
  if (!isArchitectureScope(scope)) throw new FederationToolError("SCOPE_MISMATCH");
  const registered = scopeById(scope.applicationServiceId);
  if (!registered || registered.level !== "applicationService" || registered.scopePath !== scope.scopePath) {
    throw new FederationToolError("SCOPE_MISMATCH");
  }
  if (permissions.some((permission) => !caller.permissions.includes(permission))) {
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

async function createFederationAudit(input: FederationAuditInput): Promise<string> {
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
      errorMessage: undefined
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
    const row = await prisma.auditLog.findUnique({ where: { id } });
    if (!row || (row.status !== "SUCCESS_REPAIR_REQUIRED" && row.status !== "FAILED_REPAIR_REQUIRED" && row.status !== "success" && row.status !== "failed")) {
      throw new FederationToolError("AUDIT_PERSISTENCE_FAILED");
    }
    const persistedScope = auditScopeFromSummary(row.inputSummary);
    if (!persistedScope || persistedScope.applicationServiceId !== requestedScope.applicationServiceId || persistedScope.scopePath !== requestedScope.scopePath) {
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

function isScopeGrant(value: unknown): value is ScopedActor["grants"][number] {
  return isRecord(value) && typeof value.scopeId === "string" && (value.action === "read" || value.action === "write");
}

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && [
    "asset:read",
    "asset:write",
    "proposal:read",
    "proposal:write",
    "context-pack:generate",
    "governance:run",
    "adr:write",
    "graph:read"
  ].includes(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        const output = await handler(input as z.output<z.ZodObject<T>>, caller);
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
