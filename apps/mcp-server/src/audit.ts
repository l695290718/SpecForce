import { recordAuditLog } from "@specforge/core";
import type { AuditStatus } from "@specforge/core";
import type { ArchitectureScopeRef } from "@specforge/core";
import type { McpActor } from "./auth";

function summarize(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, 500);
}

function architectureScopeFromInput(value: unknown): ArchitectureScopeRef | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const scope = (value as { architectureScope?: unknown }).architectureScope;
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) return undefined;
  const candidate = scope as { applicationServiceId?: unknown; scopePath?: unknown };
  return typeof candidate.applicationServiceId === "string" && typeof candidate.scopePath === "string"
    ? { applicationServiceId: candidate.applicationServiceId, scopePath: candidate.scopePath }
    : undefined;
}

export function auditToolCall(input: {
  actor: McpActor;
  action: string;
  targetType: string;
  targetId: string;
  toolInput: unknown;
  output: unknown;
  status: AuditStatus;
  errorMessage?: string;
  architectureScope?: ArchitectureScopeRef;
}) {
  const architectureScope = input.architectureScope ?? architectureScopeFromInput(input.toolInput);
  return recordAuditLog({
    actorType: input.actor.actorType,
    actorId: input.actor.actorId,
    channel: "mcp",
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    inputSummary: summarize(input.toolInput),
    outputSummary: summarize(input.output),
    status: input.status,
    errorMessage: input.errorMessage,
    applicationServiceId: architectureScope?.applicationServiceId,
    scopePath: architectureScope?.scopePath
  });
}
