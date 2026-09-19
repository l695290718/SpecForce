import { Prisma } from "@prisma/client";
import {
  contentDigest,
  resolveEffectiveScanGovernance,
  type EffectiveScanGovernance,
  type ScopeScanRuntimeOverlay,
  type SystemScanGovernanceKind,
  type SystemScanGovernanceRecord
} from "@specforge/core";
import type { ArchitectureScopeRef } from "@specforge/core";
import { prisma, resolveWritableScope, writableActor } from "../persistence";

export interface PublishSystemScanGovernanceInput {
  id: string;
  kind: SystemScanGovernanceKind;
  version: string;
  payload: Record<string, unknown>;
  signature: string;
  keyId: string;
  publishedAt?: string;
}

export interface ScopeScanRuntimeProfileInput {
  id: string;
  architectureScope: ArchitectureScopeRef;
  includePaths?: string[];
  excludePaths?: string[];
  frameworkHints?: string[];
  sensitivePaths?: string[];
  budgets?: Record<string, number>;
  minimumReviewTier?: "T0" | "T1" | "T2" | "T3";
}

const activeKinds: readonly SystemScanGovernanceKind[] = [
  "SCANNER_GOVERNANCE_PROFILE",
  "ASSET_INFERENCE_POLICY",
  "RISK_CLASSIFICATION_POLICY",
  "PROMOTION_POLICY",
  "EXTRACTOR_CATALOG",
  "SEMANTIC_PROMPT_PACK"
];

export async function publishSystemScanGovernanceRecord(input: PublishSystemScanGovernanceInput): Promise<SystemScanGovernanceRecord> {
  if (!input.id.trim() || !input.version.trim() || !input.signature.trim() || !input.keyId.trim()) throw new Error("SYSTEM_SCAN_GOVERNANCE_IDENTITY_REQUIRED");
  const contentDigestValue = contentDigest({ kind: input.kind, version: input.version, payload: input.payload });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `system-scan-governance:${input.kind}`);
    const existing = await tx.systemScanGovernanceRecord.findUnique({ where: { kind_version: { kind: input.kind, version: input.version } } });
    if (existing) {
      if (existing.contentDigest !== contentDigestValue || existing.signature !== input.signature || existing.keyId !== input.keyId) {
        throw new Error("SYSTEM_SCAN_GOVERNANCE_VERSION_CONFLICT");
      }
      return toGovernanceRecord(existing);
    }
    await tx.systemScanGovernanceRecord.updateMany({
      where: { kind: input.kind, status: "ACTIVE" },
      data: { status: "SUPERSEDED" }
    });
    const row = await tx.systemScanGovernanceRecord.create({
      data: {
        id: input.id,
        kind: input.kind,
        version: input.version,
        payload: input.payload as Prisma.InputJsonValue,
        contentDigest: contentDigestValue,
        signature: input.signature,
        keyId: input.keyId,
        status: "ACTIVE",
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : new Date()
      }
    });
    return toGovernanceRecord(row);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function loadActiveSystemScanGovernance(): Promise<SystemScanGovernanceRecord[]> {
  const rows = await prisma.systemScanGovernanceRecord.findMany({ where: { kind: { in: [...activeKinds] }, status: "ACTIVE" }, orderBy: [{ kind: "asc" }, { publishedAt: "desc" }] });
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  if ([...counts.values()].some((count) => count > 1)) throw new Error("SYSTEM_SCAN_GOVERNANCE_ACTIVE_DUPLICATE");
  return rows.map(toGovernanceRecord);
}

export async function upsertScopeScanRuntimeProfile(input: ScopeScanRuntimeProfileInput): Promise<ScopeScanRuntimeOverlay> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const overlay: ScopeScanRuntimeOverlay = {
    id: input.id,
    architectureScope: scope,
    includePaths: [...(input.includePaths ?? [])].sort(),
    excludePaths: [...(input.excludePaths ?? [])].sort(),
    frameworkHints: [...(input.frameworkHints ?? [])].sort(),
    sensitivePaths: [...(input.sensitivePaths ?? [])].sort(),
    budgets: input.budgets ?? {},
    ...(input.minimumReviewTier ? { minimumReviewTier: input.minimumReviewTier } : {})
  };
  const payload = { ...overlay, architectureScope: undefined };
  const digest = contentDigest(payload);
  const row = await prisma.scopeScanRuntimeProfile.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
    create: { ...scope, id: input.id, payload: payload as Prisma.InputJsonValue, contentDigest: digest, status: "ACTIVE" },
    update: { payload: payload as Prisma.InputJsonValue, contentDigest: digest, status: "ACTIVE" }
  });
  return overlayFromRow(row, scope);
}

export async function resolvePersistedEffectiveScanGovernance(scopeInput: ArchitectureScopeRef, profileId: string): Promise<EffectiveScanGovernance> {
  const scope = resolveWritableScope(writableActor(), scopeInput);
  const [records, profile] = await Promise.all([
    loadActiveSystemScanGovernance(),
    prisma.scopeScanRuntimeProfile.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: profileId } } })
  ]);
  if (!profile || profile.status !== "ACTIVE") throw new Error("SCOPE_SCAN_RUNTIME_PROFILE_NOT_FOUND");
  return resolveEffectiveScanGovernance(records, overlayFromRow(profile, scope));
}

function toGovernanceRecord(row: { id: string; kind: string; version: string; payload: Prisma.JsonValue; contentDigest: string; signature: string; keyId: string; status: string; publishedAt: Date }): SystemScanGovernanceRecord {
  return { id: row.id, kind: row.kind as SystemScanGovernanceKind, version: row.version, payload: row.payload as Record<string, unknown>, contentDigest: row.contentDigest, signature: row.signature, keyId: row.keyId, status: row.status as SystemScanGovernanceRecord["status"], publishedAt: row.publishedAt.toISOString() };
}

function overlayFromRow(row: { id: string; payload: Prisma.JsonValue }, scope: ArchitectureScopeRef): ScopeScanRuntimeOverlay {
  const payload = row.payload as Record<string, unknown>;
  return {
    id: row.id,
    architectureScope: scope,
    includePaths: arrayOfStrings(payload.includePaths),
    excludePaths: arrayOfStrings(payload.excludePaths),
    frameworkHints: arrayOfStrings(payload.frameworkHints),
    sensitivePaths: arrayOfStrings(payload.sensitivePaths),
    budgets: objectOfNumbers(payload.budgets),
    ...(typeof payload.minimumReviewTier === "string" ? { minimumReviewTier: payload.minimumReviewTier as ScopeScanRuntimeOverlay["minimumReviewTier"] } : {})
  };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function objectOfNumbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "number")) as Record<string, number>;
}
