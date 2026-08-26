import { describe, expect, it } from "vitest";
import { estimateAiWork } from "./estimation";
import type { AgentExecutionProfile, ModelProfile } from "./types";

const executionProfile: AgentExecutionProfile = {
  id: "agent-reference",
  revision: 1,
  primaryModelProfileId: "model-primary",
  reviewModelProfileId: "model-review",
  maxContextTokens: 32_000,
  maxOutputTokens: 8_000,
  maxRepairLoops: 2,
  maxToolCalls: 20,
  hardTokenBudget: 100_000,
  stopOnBudgetExceeded: true
};

const profile = (id: string): ModelProfile => ({
  id,
  revision: 1,
  provider: "mock",
  model: "deterministic",
  contextLimit: 32_000,
  approvedDataClasses: ["internal"],
  calibration: { status: "HEURISTIC", sampleCount: 0, minimumSampleCount: 30, backtestPassed: false },
  inputTokensPerWorkUnit: 1_000,
  outputTokensPerWorkUnit: 500,
  toolTokensPerCall: 100
});

describe("AI work estimation", () => {
  it("returns deterministic heuristic Work Units and separate primary/review token ranges", () => {
    const input = {
      tasks: [{ kind: "api", complexity: 0.5, risk: 0.4, uncertainty: 0.2 }],
      executionProfile,
      modelProfiles: [profile("model-primary"), profile("model-review")],
      calibration: { status: "HEURISTIC" as const, sampleCount: 0, minimumSampleCount: 30, backtestPassed: false }
    };
    const first = estimateAiWork(input);
    const second = estimateAiWork(input);

    expect(first).toEqual(second);
    expect(first.aiWorkUnits).toBeGreaterThan(0);
    expect(first.primaryTokenRange?.max).toBeGreaterThan(first.primaryTokenRange?.min ?? 0);
    expect(first.reviewTokenRange?.max).toBeGreaterThan(first.reviewTokenRange?.min ?? 0);
    expect(first.calibrationStatus).toBe("HEURISTIC");
    expect(first.rulesetRevision).toBe("requirement-assessment-estimation-v1");
  });

  it("returns Work Units without fabricated token or cost ranges when profiles are unavailable", () => {
    const result = estimateAiWork({
      tasks: [{ kind: "data-model", complexity: 0.2, risk: 0.1, uncertainty: 0.1 }],
      executionProfile,
      modelProfiles: [],
      calibration: { status: "HEURISTIC", sampleCount: 0, minimumSampleCount: 30, backtestPassed: false }
    });

    expect(result.aiWorkUnits).toBeGreaterThan(0);
    expect(result.primaryTokenRange).toBeNull();
    expect(result.reviewTokenRange).toBeNull();
    expect(result.costRange).toBeNull();
  });

  it("only exposes calibrated percentile status after both gates pass", () => {
    const result = estimateAiWork({
      tasks: [],
      executionProfile,
      modelProfiles: [profile("model-primary"), profile("model-review")],
      calibration: { status: "CALIBRATED", sampleCount: 30, minimumSampleCount: 30, backtestPassed: true }
    });
    expect(result.calibrationStatus).toBe("CALIBRATED_P50_P90");
  });
});
