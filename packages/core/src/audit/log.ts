import { getStore } from "../repository";
import type { AuditLog } from "../types";

export type RecordAuditLogInput = Omit<AuditLog, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

let auditSequence = 1;

export function recordAuditLog(input: RecordAuditLogInput): AuditLog {
  const hasApplicationService = Boolean(input.applicationServiceId);
  const hasScopePath = Boolean(input.scopePath);
  if (hasApplicationService !== hasScopePath) {
    throw new Error("AuditLog Scope must provide applicationServiceId and scopePath together.");
  }
  const store = getStore();
  if (!store.auditLogs) store.auditLogs = [];
  const entry: AuditLog = {
    ...input,
    id: input.id ?? `audit-${auditSequence++}`,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
  store.auditLogs.push(entry);
  return entry;
}

export function listAuditLogs(): AuditLog[] {
  return [...(getStore().auditLogs ?? [])];
}
