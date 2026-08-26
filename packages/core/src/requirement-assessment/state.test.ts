import { describe, expect, it } from "vitest";
import { assertAssessmentUsableForImplementation, assertBilingualBrief, assertScopeMatch, transitionAssessment } from "./state";
import type { RequirementBrief } from "./types";

const brief: RequirementBrief = {
  id: "req-1",
  revision: 1,
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  intent: { en: "Add an assessment report", zh: "增加评估报告" },
  confirmedFacts: [],
  assumptions: [],
  acceptanceCriteria: [{ en: "Report has a verdict", zh: "报告包含结论" }],
  qualityTargets: [{ en: "Keep scope isolated", zh: "保持范围隔离" }],
  constraints: [],
  exclusions: [],
  author: "test",
  superseded: false
};

describe("requirement assessment state", () => {
  it("accepts the happy path and rejects blocked acceptance", () => {
    transitionAssessment({ lifecycle: "DRAFT", verdict: "FEASIBLE" }, "EVIDENCE_READY");
    transitionAssessment({ lifecycle: "EVIDENCE_READY", verdict: "FEASIBLE" }, "ASSESSED");
    transitionAssessment({ lifecycle: "ASSESSED", verdict: "FEASIBLE" }, "REVIEWED");
    transitionAssessment({ lifecycle: "REVIEWED", verdict: "FEASIBLE" }, "ACCEPTED");
    expect(() => transitionAssessment({ lifecycle: "REVIEWED", verdict: "BLOCKED" }, "ACCEPTED")).toThrow("ASSESSMENT_ACCEPTANCE_BLOCKED");
    expect(() => transitionAssessment({ lifecycle: "DRAFT", verdict: "FEASIBLE" }, "ACCEPTED")).toThrow("ASSESSMENT_ILLEGAL_TRANSITION");
  });

  it("supports explicit staleness and supersession paths", () => {
    transitionAssessment({ lifecycle: "EVIDENCE_READY", verdict: "INSUFFICIENT_EVIDENCE" }, "STALE");
    transitionAssessment({ lifecycle: "ASSESSED", verdict: "CONDITIONAL" }, "STALE");
    transitionAssessment({ lifecycle: "REVIEWED", verdict: "FEASIBLE" }, "STALE");
    transitionAssessment({ lifecycle: "ACCEPTED", verdict: "FEASIBLE" }, "STALE");
    transitionAssessment({ lifecycle: "STALE", verdict: "FEASIBLE" }, "SUPERSEDED");
    transitionAssessment({ lifecycle: "ACCEPTED", verdict: "FEASIBLE" }, "SUPERSEDED");
    expect(() => transitionAssessment({ lifecycle: "SUPERSEDED", verdict: "FEASIBLE" }, "STALE")).toThrow("ASSESSMENT_ILLEGAL_TRANSITION");
  });

  it("fails closed for Scope mismatch, stale reports, and incomplete bilingual content", () => {
    expect(() => assertScopeMatch({ expected: brief, actual: { ...brief, scopePath: "other-scope" } })).toThrow("ASSESSMENT_SCOPE_MISMATCH");
    expect(() => assertAssessmentUsableForImplementation({ lifecycle: "STALE", verdict: "FEASIBLE", staleReason: "EVIDENCE_SNAPSHOT_CHANGED" })).toThrow("ASSESSMENT_STALE");
    expect(() => assertBilingualBrief({ ...brief, intent: { en: "Only English", zh: "" } })).toThrow("ASSESSMENT_BILINGUAL_CONTENT_REQUIRED");
    expect(() => assertAssessmentUsableForImplementation({ lifecycle: "ACCEPTED", verdict: "CONDITIONAL" })).toThrow("ASSESSMENT_VERDICT_NOT_IMPLEMENTABLE");
  });
});
