import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import type { ReviewRiskTier } from "../knowledge/types";

export type SystemScanGovernanceKind =
  | "SCANNER_GOVERNANCE_PROFILE"
  | "ASSET_INFERENCE_POLICY"
  | "RISK_CLASSIFICATION_POLICY"
  | "PROMOTION_POLICY"
  | "EXTRACTOR_CATALOG"
  | "SEMANTIC_PROMPT_PACK";

export type SystemScanGovernanceStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export interface SystemScanGovernanceRecord {
  id: string;
  kind: SystemScanGovernanceKind;
  version: string;
  payload: Record<string, unknown>;
  contentDigest: string;
  signature: string;
  keyId: string;
  status: SystemScanGovernanceStatus;
  publishedAt: string;
}

export interface ScanRuntimeBudgets {
  maxObservationsPerBatch: number;
  maxBatchBytes: number;
  maxExcerptBytes: number;
  maxSourceFileBytes: number;
  maxObservationsPerSession: number;
}

export interface ScopeScanRuntimeOverlay {
  id: string;
  architectureScope: ArchitectureScopeRef;
  includePaths: string[];
  excludePaths: string[];
  frameworkHints: string[];
  sensitivePaths: string[];
  budgets: Partial<ScanRuntimeBudgets>;
  minimumReviewTier?: ReviewRiskTier;
}

export interface EffectiveScanGovernance {
  records: Record<SystemScanGovernanceKind, SystemScanGovernanceRecord>;
  overlay: ScopeScanRuntimeOverlay;
  budgets: ScanRuntimeBudgets;
  minimumReviewTier: ReviewRiskTier;
  systemDigest: string;
  overlayDigest: string;
  effectiveDigest: string;
}

const governanceKinds: readonly SystemScanGovernanceKind[] = [
  "SCANNER_GOVERNANCE_PROFILE",
  "ASSET_INFERENCE_POLICY",
  "RISK_CLASSIFICATION_POLICY",
  "PROMOTION_POLICY",
  "EXTRACTOR_CATALOG",
  "SEMANTIC_PROMPT_PACK"
];

const reviewTierRank: Record<ReviewRiskTier, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };
const budgetKeys: readonly (keyof ScanRuntimeBudgets)[] = [
  "maxObservationsPerBatch",
  "maxBatchBytes",
  "maxExcerptBytes",
  "maxSourceFileBytes",
  "maxObservationsPerSession"
];
const overlayKeys = new Set([
  "id",
  "architectureScope",
  "includePaths",
  "excludePaths",
  "frameworkHints",
  "sensitivePaths",
  "budgets",
  "minimumReviewTier"
]);

export function governanceRecordDigest(record: Pick<SystemScanGovernanceRecord, "kind" | "version" | "payload">): string {
  return contentDigest({ kind: record.kind, version: record.version, payload: record.payload });
}

export function resolveEffectiveScanGovernance(
  records: readonly SystemScanGovernanceRecord[],
  overlay: ScopeScanRuntimeOverlay
): EffectiveScanGovernance {
  validateOverlay(overlay);
  const selected = {} as Record<SystemScanGovernanceKind, SystemScanGovernanceRecord>;
  for (const kind of governanceKinds) {
    const matches = records.filter((record) => record.kind === kind && record.status === "ACTIVE");
    if (matches.length !== 1) throw new Error(`SYSTEM_SCAN_GOVERNANCE_ACTIVE_VERSION_INVALID:${kind}`);
    const record = matches[0]!;
    if (governanceRecordDigest(record) !== record.contentDigest) throw new Error(`SYSTEM_SCAN_GOVERNANCE_DIGEST_INVALID:${kind}`);
    selected[kind] = record;
  }

  const systemPolicy = selected.SCANNER_GOVERNANCE_PROFILE.payload;
  const configuredBudgets = readBudgets(systemPolicy.budgets);
  const requestedBudgets = overlay.budgets;
  const budgets = Object.fromEntries(budgetKeys.map((key) => {
    const requested = requestedBudgets[key];
    if (requested !== undefined && (!Number.isInteger(requested) || requested <= 0)) {
      throw new Error(`SCOPE_SCAN_BUDGET_INVALID:${key}`);
    }
    return [key, requested === undefined ? configuredBudgets[key] : Math.min(requested, configuredBudgets[key])];
  })) as unknown as ScanRuntimeBudgets;

  const systemDigest = contentDigest(Object.fromEntries(governanceKinds.map((kind) => [kind, {
    id: selected[kind].id,
    version: selected[kind].version,
    contentDigest: selected[kind].contentDigest
  }])));
  const overlayDigest = contentDigest(overlay);
  const effectiveDigest = contentDigest({ systemDigest, overlayDigest, budgets, minimumReviewTier: overlay.minimumReviewTier ?? "T0" });
  return {
    records: selected,
    overlay,
    budgets,
    minimumReviewTier: overlay.minimumReviewTier ?? "T0",
    systemDigest,
    overlayDigest,
    effectiveDigest
  };
}

function validateOverlay(overlay: ScopeScanRuntimeOverlay): void {
  if (!overlay.id.trim()) throw new Error("SCOPE_SCAN_RUNTIME_PROFILE_ID_REQUIRED");
  if (!overlay.architectureScope.applicationServiceId.trim() || !overlay.architectureScope.scopePath.trim()) {
    throw new Error("SCOPE_SCAN_RUNTIME_PROFILE_SCOPE_REQUIRED");
  }
  for (const key of Object.keys(overlay as unknown as Record<string, unknown>)) {
    if (!overlayKeys.has(key)) throw new Error("SCOPE_SCAN_GOVERNANCE_OVERRIDE_FORBIDDEN");
  }
  if (!Array.isArray(overlay.includePaths) || !Array.isArray(overlay.excludePaths) || !Array.isArray(overlay.frameworkHints) || !Array.isArray(overlay.sensitivePaths)) {
    throw new Error("SCOPE_SCAN_RUNTIME_PROFILE_PATHS_INVALID");
  }
  if (overlay.minimumReviewTier && !(overlay.minimumReviewTier in reviewTierRank)) throw new Error("SCOPE_SCAN_REVIEW_TIER_INVALID");
}

function readBudgets(value: unknown): ScanRuntimeBudgets {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SYSTEM_SCAN_BUDGETS_MISSING");
  const input = value as Record<string, unknown>;
  const result = {} as ScanRuntimeBudgets;
  for (const key of budgetKeys) {
    const candidate = input[key];
    if (!Number.isInteger(candidate) || Number(candidate) <= 0) throw new Error(`SYSTEM_SCAN_BUDGET_INVALID:${key}`);
    result[key] = Number(candidate);
  }
  return result;
}

export function isReviewTierAtLeast(actual: ReviewRiskTier, minimum: ReviewRiskTier): boolean {
  return reviewTierRank[actual] >= reviewTierRank[minimum];
}
