export type AssessmentRunStatus =
  | "QUEUED"
  | "RESOLVING_EVIDENCE"
  | "WAITING_FOR_EVIDENCE"
  | "WAITING_FOR_PROJECTION"
  | "ANALYZING"
  | "ESTIMATING"
  | "REVIEWING"
  | "COMPLETE"
  | "FAILED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLED";

export type AssessmentLifecycle =
  | "DRAFT"
  | "EVIDENCE_READY"
  | "ASSESSED"
  | "REVIEWED"
  | "ACCEPTED"
  | "STALE"
  | "SUPERSEDED";

export type FeasibilityVerdict =
  | "FEASIBLE"
  | "CONDITIONAL"
  | "BLOCKED"
  | "INSUFFICIENT_EVIDENCE";

export type AssessmentRole = "product" | "architecture" | "agent";
export type AssessmentRequirementKind = "api" | "data-model" | "event" | "rule" | "generic";
export type AssessmentEvidenceKind = string;

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface AssessmentScopeRef {
  applicationServiceId: string;
  scopePath: string;
}

export interface AssessmentRunRef extends AssessmentScopeRef {
  id: string;
  enterpriseId: string;
}

export interface AssessmentEvidenceSnapshotRef extends AssessmentScopeRef {
  id: string;
  catalogWaterline: string;
  relationshipWaterline: string;
  projectionCheckpoint: string | null;
  rulesetRevision: string;
  coveragePolicyRevision: string;
  contentDigest: string;
}

export interface RequirementBrief extends AssessmentScopeRef {
  id: string;
  revision: number;
  intent: LocalizedText;
  confirmedFacts: LocalizedText[];
  assumptions: LocalizedText[];
  acceptanceCriteria: LocalizedText[];
  qualityTargets: LocalizedText[];
  constraints: LocalizedText[];
  exclusions: LocalizedText[];
  author: string;
  superseded: boolean;
}

export interface AssessmentEstimateRange {
  min: number;
  max: number;
  unit: "person-days" | "tokens";
}

export interface AssessmentEstimate {
  sizeClass: "XS" | "S" | "M" | "L" | "XL";
  planningRange: AssessmentEstimateRange;
  riskAdjustedRange: AssessmentEstimateRange;
  calibrationStatus: "HEURISTIC" | "CALIBRATED_P50_P90";
  confidence: number;
  sensitivity: Array<{ factor: string; impact: "low" | "medium" | "high" }>;
}

export interface AssessmentTaskInput {
  kind: string;
  complexity: number;
  risk: number;
  uncertainty: number;
}

export interface ModelProfile {
  id: string;
  revision: number;
  provider: string;
  model: string;
  inputPrice?: number;
  outputPrice?: number;
  contextLimit: number;
  approvedDataClasses: string[];
  calibration: CalibrationState;
  inputTokensPerWorkUnit?: number;
  outputTokensPerWorkUnit?: number;
  toolTokensPerCall?: number;
  cacheReadMultiplier?: number;
  cacheWriteMultiplier?: number;
}

export interface AgentExecutionProfile {
  id: string;
  revision: number;
  primaryModelProfileId: string;
  reviewModelProfileId: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  maxRepairLoops: number;
  maxToolCalls: number;
  hardTokenBudget: number;
  stopOnBudgetExceeded: boolean;
  primaryToolCallsPerWorkUnit?: number;
  reviewWorkUnitRatio?: number;
  contextAssemblyWorkUnits?: number;
  verificationWorkUnits?: number;
}

export interface CalibrationState {
  status: "HEURISTIC" | "CALIBRATED";
  sampleCount: number;
  minimumSampleCount: number;
  backtestPassed: boolean;
}

export interface AssessmentWorkEstimate extends AssessmentEstimate {
  aiWorkUnits: number;
  primaryWorkUnits: number;
  reviewWorkUnits: number;
  expectedRepairLoops: number;
  primaryTokenRange: AssessmentEstimateRange | null;
  reviewTokenRange: AssessmentEstimateRange | null;
  estimatedAgentMinutes: number;
  cacheAssumptions: string[];
  costRange: { min: number; max: number; currency: string } | null;
  rulesetRevision: string;
}

export interface EvidenceCoverageResult {
  coverage: number;
  confidenceCap: number;
  missingKinds: string[];
  policyRevision: string;
  requiredKinds: string[];
  matchedKinds: string[];
}

export interface DeterministicFinding {
  code: string;
  severity: "info" | "warning" | "blocking";
  title: LocalizedText;
  detail: LocalizedText;
  evidenceIds: string[];
}

export interface AssessmentScopeValidationInput {
  expected: AssessmentScopeRef;
  actual: AssessmentScopeRef;
}
