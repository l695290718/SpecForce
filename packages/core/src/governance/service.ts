import { inferAssetType, normalizeAssetType } from "../assets/service";
import { runGovernanceChecks } from "../rules/governance";
import type { GovernanceCheckResult } from "../types";

export interface RunGovernanceChecksInput {
  targetType: "asset" | "proposal" | "context-pack";
  targetId: string;
  assetType?: string;
  checks?: string[];
}

export interface GovernanceChecksResult {
  status: "passed" | "warning" | "failed";
  results: Array<{
    ruleId: string;
    ruleName: string;
    severity: "info" | "warning" | "error";
    message: string;
    recommendation: string;
  }>;
}

function statusFromResults(results: GovernanceCheckResult[]): GovernanceChecksResult["status"] {
  if (results.some((result) => result.status === "fail" && result.severity === "error")) return "failed";
  if (results.some((result) => result.status === "fail")) return "warning";
  return "passed";
}

export async function runGovernanceChecksForTarget(input: RunGovernanceChecksInput): Promise<GovernanceChecksResult> {
  const assetType =
    input.targetType === "proposal"
      ? "proposal"
      : input.targetType === "context-pack"
        ? "contextPack"
        : input.assetType
          ? normalizeAssetType(input.assetType)
          : inferAssetType(input.targetId);
  const rawResults = await runGovernanceChecks(assetType, input.targetId);
  const filtered = input.checks?.length ? rawResults.filter((result) => input.checks?.includes(result.ruleCode)) : rawResults;

  return {
    status: statusFromResults(filtered),
    results: filtered.map((result) => ({
      ruleId: result.ruleCode,
      ruleName: result.ruleName,
      severity: result.severity,
      message: result.reason,
      recommendation: result.suggestion
    }))
  };
}
