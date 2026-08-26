export type AIProviderCapability =
  | "proposal"
  | "adr"
  | "businessRule"
  | "testSuggestions"
  | "agentContextPack"
  | "semanticCandidates"
  | "requirementAssessment"
  | "requirementAssessmentReview";

export interface AIProviderRequest {
  capability: AIProviderCapability;
  prompt: string;
  provider?: string;
  context?: Record<string, unknown>;
}

export interface AIProviderResponse<TContent = Record<string, unknown>> {
  provider: string;
  capability: AIProviderCapability;
  content: TContent;
  rawText: string;
  usage: {
    mocked: boolean;
    inputTokens?: number;
    outputTokens?: number;
    toolCalls?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    retryCount?: number;
  };
}

export interface AIProvider {
  id: string;
  label: string;
  capabilities: AIProviderCapability[];
  generate<TContent = Record<string, unknown>>(request: AIProviderRequest): Promise<AIProviderResponse<TContent>>;
}

export interface ProposalDraft {
  title: string;
  description: string;
  background: string;
  goal: string;
  nonGoal: string;
  scope: string;
  risks: string[];
  rolloutPlan: string;
  rollbackPlan: string;
}

export interface AdrDraft {
  title: string;
  status: "proposed";
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  constraints: string[];
}

export interface BusinessRuleDraft {
  name: string;
  code: string;
  ruleType: "validation";
  condition: string;
  action: string;
  exception: string;
  examples: string[];
  severity: "medium";
}

export interface TestSuggestionsDraft {
  suggestions: string[];
}

export interface AgentContextPackDraft {
  markdown: string;
  constraints: string[];
  instructions: string[];
}

export interface SemanticCandidateDraft {
  sourceObservationId: string;
  semanticIdentity: string;
  factType: string;
  layer: "BIZ" | "SYS" | "TECH";
  aspect: "structure" | "behavior" | "information" | "contract" | "constraint";
  value: Record<string, unknown>;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
  unresolvedQuestions: string[];
}

export interface RequirementAssessmentDraft {
  summary: string;
  requirementKinds: string[];
  options: Array<{ id: string; title: string; rationale: string }>;
  assumptions: string[];
  unknowns: string[];
}

export interface RequirementAssessmentReviewDraft {
  disposition: "pass" | "needs-attention";
  findings: Array<{ code: string; severity: "warning" | "blocking"; detail: string }>;
  checkedRules: string[];
}
