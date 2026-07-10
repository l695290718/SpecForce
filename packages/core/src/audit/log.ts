import { getStore } from "../repository";
import type { AuditLog } from "../types";

export type RecordAuditLogInput = Omit<AuditLog, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

let auditSequence = 1;

export function recordAuditLog(input: RecordAuditLogInput): AuditLog {
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
