import type {
  ArchitectureScopeRef,
  KnowledgeProfileId,
  KnowledgeReasonCode
} from "@specforge/core";

type CounterMap = Record<string, number>;

export interface ReadinessMetricInput {
  profileId: KnowledgeProfileId;
  accessDecision: "ALLOW" | "DENY";
  reasonCodes: readonly KnowledgeReasonCode[];
  latencyMilliseconds: number;
}

export interface ReadinessMetricsSnapshot {
  architectureScope: ArchitectureScopeRef;
  evaluations: number;
  allowed: number;
  denied: number;
  receiptReuse: number;
  cursorInvalidations: number;
  diagnosticDenials: number;
  budgetFailures: number;
  latencyBuckets: CounterMap;
  byProfile: CounterMap;
  byReason: CounterMap;
}

const metrics = new Map<string, ReadinessMetricsSnapshot>();

function key(scope: ArchitectureScopeRef): string {
  return `${scope.applicationServiceId}\u0000${scope.scopePath}`;
}

function get(scope: ArchitectureScopeRef): ReadinessMetricsSnapshot {
  const existing = metrics.get(key(scope));
  if (existing) return existing;
  const created: ReadinessMetricsSnapshot = {
    architectureScope: { ...scope },
    evaluations: 0,
    allowed: 0,
    denied: 0,
    receiptReuse: 0,
    cursorInvalidations: 0,
    diagnosticDenials: 0,
    budgetFailures: 0,
    latencyBuckets: {},
    byProfile: {},
    byReason: {}
  };
  metrics.set(key(scope), created);
  return created;
}

function increment(target: CounterMap, label: string): void {
  target[label] = (target[label] ?? 0) + 1;
}

function latencyBucket(milliseconds: number): string {
  if (milliseconds <= 50) return "le_50ms";
  if (milliseconds <= 250) return "le_250ms";
  if (milliseconds <= 1000) return "le_1s";
  if (milliseconds <= 5000) return "le_5s";
  return "gt_5s";
}

export function recordReadinessEvaluation(scope: ArchitectureScopeRef, input: ReadinessMetricInput): void {
  const snapshot = get(scope);
  snapshot.evaluations += 1;
  if (input.accessDecision === "ALLOW") snapshot.allowed += 1;
  else snapshot.denied += 1;
  increment(snapshot.byProfile, input.profileId);
  input.reasonCodes.forEach((reason) => increment(snapshot.byReason, reason));
  increment(snapshot.latencyBuckets, latencyBucket(Math.max(0, input.latencyMilliseconds)));
}

export function recordReceiptReuse(scope: ArchitectureScopeRef): void {
  get(scope).receiptReuse += 1;
}

export function recordCursorInvalidation(scope: ArchitectureScopeRef): void {
  get(scope).cursorInvalidations += 1;
}

export function recordDiagnosticDenial(scope: ArchitectureScopeRef): void {
  get(scope).diagnosticDenials += 1;
}

export function recordBudgetFailure(scope: ArchitectureScopeRef): void {
  get(scope).budgetFailures += 1;
}

export function snapshotReadinessMetrics(scope: ArchitectureScopeRef): ReadinessMetricsSnapshot {
  const snapshot = get(scope);
  return {
    ...snapshot,
    architectureScope: { ...snapshot.architectureScope },
    latencyBuckets: { ...snapshot.latencyBuckets },
    byProfile: { ...snapshot.byProfile },
    byReason: { ...snapshot.byReason }
  };
}

export function resetReadinessMetricsForTests(): void {
  metrics.clear();
}
