import { contentDigest, type ArchitectureScopeRef, type ConnectorCapability, type FederatedFactEnvelope, type Permission } from "@specforge/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auditToolCall } from "../audit";
import { allowAllPolicy, getDefaultActor } from "../auth";
import { prisma, readableScope, resolveWritableScope, writableActor } from "../persistence";
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

const federatedFactSchema = z.object({
  id: z.string().min(1),
  assetType: z.string().min(1),
  schemaVersion: z.string().min(1),
  payload: z.record(z.unknown()),
  localizedContent: z.object({
    en: z.record(z.unknown()).optional(),
    zh: z.record(z.unknown())
  }),
  normalizedDigest: z.string().min(1),
  authority: z.enum(["EXTERNAL", "SPECFORGE", "SHARED"]),
  confidence: z.number().min(0).max(1),
  provenance: z.object({
    sourceSystem: z.string().min(1),
    connectorInstanceId: z.string().min(1),
    externalIdentity: z.string().optional(),
    externalVersion: z.string().optional(),
    sourceTimestamp: z.string().optional(),
    observedAt: z.string().min(1),
    repositoryCommit: z.string().optional()
  }),
  relationshipRefs: z.array(z.string()).optional(),
  evidenceRefs: z.array(z.string()).optional(),
  designChangeSessionId: z.string().optional()
});

type ToolHandler<T> = (input: T) => Promise<unknown>;

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
  const message = error instanceof Error ? error.message : "Unknown federation tool error";
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }] };
}

function errorCode(error: unknown): string {
  if (error instanceof FederationToolError) return error.code;
  if (error instanceof Error) {
    if (["AUTHORITY_MISSING", "AUTHORITY_POLICY_AMBIGUOUS", "POLICY_DISABLED"].includes(error.message)) return "AUTHORITY_CONFLICT";
    if (["OUTBOX_WRITE_FAILED", "DESIGN_CHANGE_SESSION_SCOPE_MISMATCH"].includes(error.message)) return "DELIVERY_BLOCKED";
    if (/^[A-Z][A-Z0-9_]+$/.test(error.message)) return error.message;
  }
  return "FEDERATION_TOOL_ERROR";
}

function assertWritableExactScope(scope: ArchitectureScopeRef): ArchitectureScopeRef {
  try {
    const resolved = resolveWritableScope(writableActor(), scope);
    if (resolved.applicationServiceId !== scope.applicationServiceId || resolved.scopePath !== scope.scopePath) {
      throw new FederationToolError("SCOPE_MISMATCH");
    }
    return resolved;
  } catch (error) {
    if (error instanceof FederationToolError) throw error;
    throw new FederationToolError("SCOPE_MISMATCH", "The supplied architectureScope does not match an authorized application-service Scope.");
  }
}

function assertReadableExactScope(scope: ArchitectureScopeRef): ArchitectureScopeRef {
  try {
    const resolved = readableScope(scope.applicationServiceId);
    if (resolved.scopePath !== scope.scopePath) throw new FederationToolError("SCOPE_MISMATCH");
    return resolved;
  } catch (error) {
    if (error instanceof FederationToolError) throw error;
    throw new FederationToolError("SCOPE_MISMATCH", "The supplied architectureScope does not match an authorized application-service Scope.");
  }
}

function federationTarget(name: string, input: Record<string, unknown>) {
  if ("connectorId" in input) return { targetType: "federation-connector", targetId: String(input.connectorId) };
  if ("candidateId" in input) return { targetType: "federation-candidate", targetId: String(input.candidateId) };
  if ("id" in input) return { targetType: "federation-connector", targetId: String(input.id) };
  return { targetType: "federation-scope", targetId: String((input.architectureScope as ArchitectureScopeRef | undefined)?.applicationServiceId ?? name) };
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
    async (input: unknown) => {
      const actor = getDefaultActor();
      const target = federationTarget(name, input as Record<string, unknown>);
      try {
        await allowAllPolicy.authorize(actor, config.permissions);
        const output = await handler(input as z.output<z.ZodObject<T>>);
        auditToolCall({ actor, action: name, ...target, toolInput: input, output, status: "success" });
        return textResult(output);
      } catch (error) {
        const code = errorCode(error);
        const output = { error: { code } };
        auditToolCall({ actor, action: name, ...target, toolInput: input, output, status: "failed", errorMessage: error instanceof Error ? error.message : String(error) });
        return errorResult(error);
      }
    }
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
  }, async (input) => registerConnector({
    ...input,
    capabilities: input.capabilities as ConnectorCapability[],
    status: input.status ?? "ACTIVE",
    architectureScope: assertWritableExactScope(input.architectureScope)
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
  }, async (input) => {
    const architectureScope = assertWritableExactScope(input.architectureScope);
    const normalizedDigest = contentDigest(input.payload);
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
      humanFacing: z.boolean(),
      fieldPath: z.string().min(1).optional(),
      fact: federatedFactSchema,
      architectureScope: architectureScopeSchema
    },
    permissions: ["asset:write"],
    readOnly: false
  }, async (input) => promoteCandidate({
    candidateId: input.candidateId,
    architectureScope: assertWritableExactScope(input.architectureScope),
    humanFacing: input.humanFacing,
    fieldPath: input.fieldPath,
    fact: input.fact as Omit<FederatedFactEnvelope, "architectureScope" | "status">
  } satisfies PromoteCandidateInput));

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
  }, async (input) => createDesignChangeSession({
    id: `design-change-session:${randomUUID()}`,
    actorId: getDefaultActor().actorId,
    intent: input.intent,
    affectedFactIds: input.affectedFactIds,
    expectedEvidenceRefs: input.expectedEvidenceRefs ?? [],
    status: "OPEN",
    architectureScope: assertWritableExactScope(input.architectureScope)
  }));

  registerFederationJsonTool(server, "reconcile_federated_scope", {
    title: "Reconcile federated Scope",
    description: "Runs a read-only reconciliation and returns deterministic diagnostics for one exact architecture Scope.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      acceptedFacts: z.array(federatedFactSchema).optional()
    },
    permissions: ["asset:read", "governance:run"],
    readOnly: true
  }, async (input) => reconcilePersistedScope({
    architectureScope: assertReadableExactScope(input.architectureScope),
    acceptedFacts: (input.acceptedFacts ?? []) as FederatedFactEnvelope[]
  }));

  registerFederationJsonTool(server, "get_federated_sync_status", {
    title: "Get federated sync status",
    description: "Returns read-only connector, delivery, conflict, and reconciliation status for one exact architecture Scope.",
    inputSchema: { architectureScope: architectureScopeSchema },
    permissions: ["asset:read"],
    readOnly: true
  }, async (input) => {
    const architectureScope = assertReadableExactScope(input.architectureScope);
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
