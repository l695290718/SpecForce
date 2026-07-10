import { recordAuditLog } from "@specforge/core";
import type { AuditStatus } from "@specforge/core";
import type { McpActor } from "./auth";

function summarize(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, 500);
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
}) {
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
    errorMessage: input.errorMessage
  });
}
