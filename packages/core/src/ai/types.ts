export type AIProviderCapability =
  | "proposal"
  | "adr"
  | "businessRule"
  | "testSuggestions"
  | "agentContextPack";

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
