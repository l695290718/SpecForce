import type {
  AgentExecutionProfile,
  AssessmentEstimateRange,
  AssessmentTaskInput,
  AssessmentWorkEstimate,
  CalibrationState,
  ModelProfile
} from "./types";

const DEFAULT_INPUT_TOKENS_PER_UNIT = 1_200;
const DEFAULT_OUTPUT_TOKENS_PER_UNIT = 800;
const DEFAULT_TOOL_TOKENS_PER_CALL = 250;

export function estimateAiWork(input: {
  tasks: AssessmentTaskInput[];
  executionProfile: AgentExecutionProfile;
  modelProfiles: ModelProfile[];
  calibration: CalibrationState;
}): AssessmentWorkEstimate {
  const normalizedTasks = input.tasks.map(normalizeTask);
  const rawUnits = normalizedTasks.reduce((total, task) => {
    return total + 1 + task.complexity * 3 + task.risk * 2 + task.uncertainty * 2;
  }, input.executionProfile.contextAssemblyWorkUnits ?? 0.5);
  const aiWorkUnits = round(Math.max(0.5, rawUnits + (input.executionProfile.verificationWorkUnits ?? 0.5)));
  const primaryWorkUnits = aiWorkUnits;
  const reviewWorkUnits = round(Math.max(0.5, aiWorkUnits * (input.executionProfile.reviewWorkUnitRatio ?? 0.3)));
  const averageRisk = average(normalizedTasks.map((task) => task.risk));
  const averageUncertainty = average(normalizedTasks.map((task) => task.uncertainty));
  const expectedRepairLoops = Math.min(
    input.executionProfile.maxRepairLoops,
    Math.ceil(averageRisk * input.executionProfile.maxRepairLoops)
  );
  const calibrationStatus = isCalibrated(input.calibration) ? "CALIBRATED_P50_P90" : "HEURISTIC";
  const confidence = round(Math.max(0.2, (calibrationStatus === "HEURISTIC" ? 0.55 : 0.85) - averageUncertainty * 0.25));
  const primaryProfile = input.modelProfiles.find((profile) => profile.id === input.executionProfile.primaryModelProfileId);
  const reviewProfile = input.modelProfiles.find((profile) => profile.id === input.executionProfile.reviewModelProfileId);
  const primaryTokenRange = primaryProfile ? tokenRange(primaryWorkUnits, expectedRepairLoops, input.executionProfile, primaryProfile, averageRisk, averageUncertainty) : null;
  const reviewTokenRange = reviewProfile ? tokenRange(reviewWorkUnits, 0, input.executionProfile, reviewProfile, averageRisk, averageUncertainty) : null;
  const planningRange = primaryTokenRange && reviewTokenRange
    ? tokenRangeSum(primaryTokenRange, reviewTokenRange, "tokens")
    : { min: 0, max: 0, unit: "tokens" as const };
  const riskAdjustedRange = primaryTokenRange && reviewTokenRange
    ? tokenRangeSum(
      riskRange(primaryTokenRange, averageRisk, averageUncertainty),
      riskRange(reviewTokenRange, averageRisk, averageUncertainty),
      "tokens"
    )
    : { min: 0, max: 0, unit: "tokens" as const };
  const estimatedAgentMinutes = round(aiWorkUnits * 12 * (1 + averageUncertainty) + expectedRepairLoops * 8);
  return {
    sizeClass: sizeClass(aiWorkUnits),
    planningRange,
    riskAdjustedRange,
    calibrationStatus,
    confidence,
    sensitivity: sensitivity(normalizedTasks),
    aiWorkUnits,
    primaryWorkUnits,
    reviewWorkUnits,
    expectedRepairLoops,
    primaryTokenRange,
    reviewTokenRange,
    estimatedAgentMinutes,
    cacheAssumptions: [
      "Context retrieval may use the configured provider cache.",
      "Cache savings are not included unless the selected Model Profile declares a multiplier."
    ],
    costRange: primaryProfile && reviewProfile ? costRange(planningRange, primaryProfile, reviewProfile) : null,
    rulesetRevision: "requirement-assessment-estimation-v1"
  };
}

function tokenRange(
  workUnits: number,
  repairLoops: number,
  profile: AgentExecutionProfile,
  model: ModelProfile,
  risk: number,
  uncertainty: number
): AssessmentEstimateRange {
  const inputTokens = model.inputTokensPerWorkUnit ?? DEFAULT_INPUT_TOKENS_PER_UNIT;
  const outputTokens = model.outputTokensPerWorkUnit ?? DEFAULT_OUTPUT_TOKENS_PER_UNIT;
  const toolTokens = model.toolTokensPerCall ?? DEFAULT_TOOL_TOKENS_PER_CALL;
  const toolCalls = workUnits * (profile.primaryToolCallsPerWorkUnit ?? 2) + repairLoops * 2;
  const base = workUnits * (inputTokens + outputTokens) + toolCalls * toolTokens;
  const min = Math.max(1, Math.ceil(base * 0.85));
  const max = Math.min(
    profile.hardTokenBudget,
    Math.ceil(base * (1.15 + risk * 0.35 + uncertainty * 0.5))
  );
  return { min, max: Math.max(min, max), unit: "tokens" };
}

function riskRange(range: AssessmentEstimateRange, risk: number, uncertainty: number): AssessmentEstimateRange {
  return { ...range, max: Math.ceil(range.max * (1 + risk * 0.2 + uncertainty * 0.3)) };
}

function tokenRangeSum(first: AssessmentEstimateRange, second: AssessmentEstimateRange, unit: "tokens"): AssessmentEstimateRange {
  return { min: first.min + second.min, max: first.max + second.max, unit };
}

function costRange(range: AssessmentEstimateRange, primary: ModelProfile, review: ModelProfile): { min: number; max: number; currency: string } {
  const primaryRate = (primary.inputPrice ?? 0) + (primary.outputPrice ?? 0);
  const reviewRate = (review.inputPrice ?? 0) + (review.outputPrice ?? 0);
  const rate = (primaryRate + reviewRate) / 2;
  return { min: round(range.min / 1_000_000 * rate), max: round(range.max / 1_000_000 * rate), currency: "USD" };
}

function normalizeTask(task: AssessmentTaskInput): AssessmentTaskInput {
  return {
    kind: task.kind,
    complexity: clamp(task.complexity),
    risk: clamp(task.risk),
    uncertainty: clamp(task.uncertainty)
  };
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isCalibrated(calibration: CalibrationState): boolean {
  return calibration.status === "CALIBRATED" && calibration.sampleCount >= calibration.minimumSampleCount && calibration.backtestPassed;
}

function sizeClass(units: number): AssessmentWorkEstimate["sizeClass"] {
  if (units <= 2) return "XS";
  if (units <= 5) return "S";
  if (units <= 10) return "M";
  if (units <= 18) return "L";
  return "XL";
}

function sensitivity(tasks: AssessmentTaskInput[]): AssessmentWorkEstimate["sensitivity"] {
  const averageRisk = average(tasks.map((task) => task.risk));
  const averageUncertainty = average(tasks.map((task) => task.uncertainty));
  return [
    { factor: "semantic complexity", impact: average(tasks.map((task) => task.complexity)) > 0.65 ? "high" : "medium" },
    { factor: "relationship and delivery risk", impact: averageRisk > 0.65 ? "high" : averageRisk > 0.3 ? "medium" : "low" },
    { factor: "evidence uncertainty", impact: averageUncertainty > 0.65 ? "high" : averageUncertainty > 0.3 ? "medium" : "low" }
  ];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
