import {
  hasBilingualCandidateContent,
  maximumReviewRisk,
  type KnowledgeAssertion,
  type ReviewBundle,
  type ReviewRiskTier,
  type ScopedActor,
  type SemanticIdentityDecision
} from "@specforge/core";

export interface CandidateReviewAssessment {
  riskTier: ReviewRiskTier;
  blockingIssues: string[];
}

export function assessReviewCandidates(assertions: readonly KnowledgeAssertion[]): CandidateReviewAssessment {
  const blockingIssues = assertions.flatMap(candidateBlockingIssues);
  return {
    riskTier: maximumReviewRisk(assertions.map((assertion) => assertion.riskTier ?? "T1")),
    blockingIssues: [...new Set(blockingIssues)].sort()
  };
}

export function candidateBlockingIssues(assertion: KnowledgeAssertion): string[] {
  const issues: string[] = [];
  if (assertion.evidenceRefs.length === 0 || assertion.sourceObservationIds.length === 0) issues.push(`CANDIDATE_EVIDENCE_MISSING:${assertion.id}`);
  if (readReviewFlag(assertion.value, "agentEvidenceComplete") === false) issues.push(`CANDIDATE_EVIDENCE_MISSING:${assertion.id}`);
  if (!hasBilingualCandidateContent(assertion.value)) issues.push(`CANDIDATE_BILINGUAL_CONTENT_MISSING:${assertion.id}`);
  if (assertion.unresolvedQuestions.length > 0) issues.push(`CANDIDATE_UNRESOLVED_QUESTIONS:${assertion.id}`);
  const identityDecision = readIdentityDecision(assertion.value);
  if (!identityDecision) issues.push(`CANDIDATE_IDENTITY_MISSING:${assertion.id}`);
  else if (identityDecision !== "UNAMBIGUOUS") issues.push(`CANDIDATE_IDENTITY_${identityDecision}:${assertion.id}`);
  return issues;
}

export function assertCandidateApprovalPolicy(bundle: ReviewBundle, assertions: readonly KnowledgeAssertion[], actor: ScopedActor): void {
  const governed = assertions.filter((assertion) => Boolean(assertion.generatedByActorId));
  if (governed.length === 0) return;
  const assessment = assessReviewCandidates(governed);
  if (assessment.blockingIssues.length > 0) throw new Error(`CANDIDATE_REVIEW_BLOCKED:${assessment.blockingIssues.join(",")}`);
  if (assessment.riskTier !== bundle.riskTier) throw new Error("REVIEW_BUNDLE_RISK_MISMATCH");
  if (bundle.riskTier === "T1" && governed.some((assertion) => assertion.generatedByActorId === actor.actorId)) {
    throw new Error("REVIEW_ACTOR_SEPARATION_REQUIRED");
  }
  if ((bundle.riskTier === "T2" || bundle.riskTier === "T3") && actor.actorType !== "user") {
    throw new Error("REVIEW_HUMAN_APPROVAL_REQUIRED");
  }
}

function readIdentityDecision(value: Record<string, unknown>): SemanticIdentityDecision | undefined {
  const review = value.review;
  if (!review || typeof review !== "object" || Array.isArray(review)) return undefined;
  const identityDecision = (review as Record<string, unknown>).identityDecision;
  return identityDecision === "UNMATCHED" || identityDecision === "UNAMBIGUOUS" || identityDecision === "AMBIGUOUS" ? identityDecision : undefined;
}

function readReviewFlag(value: Record<string, unknown>, field: string): boolean | undefined {
  const review = value.review;
  if (!review || typeof review !== "object" || Array.isArray(review)) return undefined;
  const flag = (review as Record<string, unknown>)[field];
  return typeof flag === "boolean" ? flag : undefined;
}
