import { ThreeAQueryError } from "./errors";
import type { GraphAnalysisBudget, ImpactArchitectureItem, ImpactBand, ImpactScoreFactors } from "./types";

export const defaultGraphAnalysisBudget = {
  maxNodes: 250,
  maxEdges: 500,
  maxPaths: 100,
  timeoutMs: 3_000,
  maxPayloadBytes: 1_048_576
} as const satisfies GraphAnalysisBudget;

export const defaultImpactGraphAnalysisBudget = {
  maxNodes: 150,
  maxEdges: 300,
  maxPaths: 100,
  timeoutMs: 3_000,
  maxPayloadBytes: 1_048_576
} as const satisfies GraphAnalysisBudget;

export const hardGraphAnalysisBudget = {
  maxNodes: 500,
  maxEdges: 1_000,
  maxPaths: 100,
  timeoutMs: 3_000,
  maxPayloadBytes: 1_048_576
} as const satisfies GraphAnalysisBudget;

export const defaultImpactPolicyVersion = "impact-v1";

const budgetKeys: readonly (keyof GraphAnalysisBudget)[] = ["maxNodes", "maxEdges", "maxPaths", "timeoutMs", "maxPayloadBytes"];

export function normalizeGraphAnalysisBudget(input: Partial<GraphAnalysisBudget> | undefined, defaults: GraphAnalysisBudget = defaultGraphAnalysisBudget): GraphAnalysisBudget {
  const result = { ...defaults, ...input };
  for (const key of budgetKeys) {
    const value = result[key];
    const hardLimit = hardGraphAnalysisBudget[key];
    if (!Number.isSafeInteger(value) || value <= 0 || value > hardLimit) throw new ThreeAQueryError("QUERY_BUDGET_INVALID");
  }
  return result;
}

export function normalizeImpactPolicyVersion(value?: string): string {
  const policyVersion = value?.trim() || defaultImpactPolicyVersion;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(policyVersion)) throw new ThreeAQueryError("QUERY_BUDGET_INVALID");
  return policyVersion;
}

export function scoreImpact(input: {
  relationWeight: number;
  confidence: number;
  criticalityWeight: number;
  depth: number;
}): { score: number; factors: ImpactScoreFactors } {
  const relationWeight = finiteOrZero(input.relationWeight);
  const confidence = finiteOrZero(input.confidence);
  const criticalityWeight = finiteOrZero(input.criticalityWeight);
  const depth = finiteOrZero(input.depth);
  const depthDecay = Math.pow(0.72, Math.max(0, depth - 1));
  const score = clamp(relationWeight * confidence * criticalityWeight * depthDecay, 0, 100);
  return { score, factors: { relationWeight, confidence, criticalityWeight, depthDecay } };
}

export function classifyImpactBand(depth: number, score: number, partial: boolean): ImpactBand {
  if (partial && depth >= 3) return "UNRESOLVED";
  if (depth === 1) return "DIRECT";
  if (depth === 2 || score >= 60) return "LIKELY";
  return "EXTENDED";
}

export function sortImpactItems<T extends Pick<ImpactArchitectureItem, "assertionId" | "score">>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => right.score - left.score || left.assertionId.localeCompare(right.assertionId));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
