import type {
  AssessmentLifecycle,
  AssessmentScopeRef,
  AssessmentScopeValidationInput,
  FeasibilityVerdict,
  RequirementBrief
} from "./types";

const transitions: Record<AssessmentLifecycle, readonly AssessmentLifecycle[]> = {
  DRAFT: ["EVIDENCE_READY"],
  EVIDENCE_READY: ["ASSESSED", "STALE"],
  ASSESSED: ["REVIEWED", "STALE"],
  REVIEWED: ["ACCEPTED", "STALE"],
  ACCEPTED: ["STALE", "SUPERSEDED"],
  STALE: ["SUPERSEDED"],
  SUPERSEDED: []
};

export function transitionAssessment(
  input: { lifecycle: AssessmentLifecycle; verdict: FeasibilityVerdict },
  next: AssessmentLifecycle
): void {
  if (!transitions[input.lifecycle].includes(next)) {
    throw new Error(`ASSESSMENT_ILLEGAL_TRANSITION:${input.lifecycle}->${next}`);
  }
  if (next === "ACCEPTED" && (input.verdict === "BLOCKED" || input.verdict === "INSUFFICIENT_EVIDENCE")) {
    throw new Error(`ASSESSMENT_ACCEPTANCE_BLOCKED:${input.verdict}`);
  }
}

export function assertScopeMatch(input: AssessmentScopeValidationInput): void {
  if (
    input.expected.applicationServiceId !== input.actual.applicationServiceId ||
    input.expected.scopePath !== input.actual.scopePath
  ) {
    throw new Error("ASSESSMENT_SCOPE_MISMATCH");
  }
}

export function assertValidScope(scope: AssessmentScopeRef): void {
  if (!scope.applicationServiceId.trim() || !scope.scopePath.trim()) {
    throw new Error("ASSESSMENT_SCOPE_REQUIRED");
  }
}

export function assertBilingualBrief(brief: RequirementBrief): void {
  assertValidScope(brief);
  const fields: Array<LocalizedTextLike | undefined> = [brief.intent, ...brief.acceptanceCriteria, ...brief.qualityTargets];
  if (fields.some((field) => !field || !field.en.trim() || !field.zh.trim())) {
    throw new Error("ASSESSMENT_BILINGUAL_CONTENT_REQUIRED");
  }
}

export function assertAssessmentUsableForImplementation(input: {
  lifecycle: AssessmentLifecycle;
  verdict: FeasibilityVerdict;
  staleReason?: string | null;
}): void {
  if (input.lifecycle === "STALE" || input.staleReason) {
    throw new Error("ASSESSMENT_STALE");
  }
  if (input.lifecycle !== "ACCEPTED") {
    throw new Error(`ASSESSMENT_NOT_ACCEPTED:${input.lifecycle}`);
  }
  if (input.verdict !== "FEASIBLE") {
    throw new Error(`ASSESSMENT_VERDICT_NOT_IMPLEMENTABLE:${input.verdict}`);
  }
}

interface LocalizedTextLike {
  en: string;
  zh: string;
}
