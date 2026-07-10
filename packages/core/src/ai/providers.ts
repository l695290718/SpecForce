import type {
  AdrDraft,
  AgentContextPackDraft,
  AIProvider,
  AIProviderCapability,
  AIProviderRequest,
  AIProviderResponse,
  BusinessRuleDraft,
  ProposalDraft,
  TestSuggestionsDraft
} from "./types";

function words(input: string): string {
  return input.trim() || "Untitled generation";
}

function codeFrom(input: string): string {
  return words(input)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 48);
}

export class MockAIProvider implements AIProvider {
  id = "mock";
  label = "Mock AI Provider";
  capabilities: AIProviderCapability[] = ["proposal", "adr", "businessRule", "testSuggestions", "agentContextPack"];

  async generate<TContent = Record<string, unknown>>(request: AIProviderRequest): Promise<AIProviderResponse<TContent>> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(`MockAIProvider does not support capability: ${request.capability}`);
    }

    const content = this.generateContent(request) as TContent;
    return {
      provider: this.id,
      capability: request.capability,
      content,
      rawText: JSON.stringify(content, null, 2),
      usage: {
        mocked: true,
        inputTokens: Math.ceil(request.prompt.length / 4),
        outputTokens: JSON.stringify(content).length / 4
      }
    };
  }

  private generateContent(request: AIProviderRequest): ProposalDraft | AdrDraft | BusinessRuleDraft | TestSuggestionsDraft | AgentContextPackDraft {
    const prompt = words(request.prompt);

    switch (request.capability) {
      case "proposal":
        return {
          title: `Proposal: ${prompt}`,
          description: `Mock proposal draft for ${prompt}.`,
          background: `Current design context needs a controlled change for ${prompt}.`,
          goal: `Deliver ${prompt} with clear assets, rollout, and rollback boundaries.`,
          nonGoal: "Do not introduce authentication, billing, or real model calls in this draft.",
          scope: "Design assets, implementation tasks, governance checks, and release notes.",
          risks: ["Mock risk: contract drift if impacted assets are not reviewed.", "Mock risk: missing rollback owner."],
          rolloutPlan: "Start with internal validation, then roll out behind a feature flag.",
          rollbackPlan: "Disable the entry point and keep read paths available while data is reconciled."
        };
      case "adr":
        return {
          title: `ADR: ${prompt}`,
          status: "proposed",
          context: `The team needs to decide how to handle ${prompt}.`,
          decision: `Adopt the lowest-coupling option for ${prompt} until real provider evaluation is complete.`,
          alternatives: ["Keep the current behavior", "Introduce a synchronous integration", "Use an event-driven design"],
          consequences: ["The design remains testable", "Future providers can be swapped behind the abstraction"],
          constraints: ["No real model invocation", "No API key access", "All output is deterministic"]
        };
      case "businessRule":
        return {
          name: `Rule: ${prompt}`,
          code: codeFrom(prompt),
          ruleType: "validation",
          condition: `The system must validate ${prompt} before state changes are committed.`,
          action: "Allow the operation only when the validation passes.",
          exception: "Reject the operation with a machine-readable error code.",
          examples: [`Valid example for ${prompt}`, `Invalid example for ${prompt}`],
          severity: "medium"
        };
      case "testSuggestions":
        return {
          suggestions: [
            `Unit test the happy path for ${prompt}.`,
            `Add boundary tests for invalid or missing inputs related to ${prompt}.`,
            `Add regression tests for governance and compatibility behavior around ${prompt}.`,
            `Add integration tests for affected API/event contracts when ${prompt} changes.`
          ]
        };
      case "agentContextPack":
        return {
          markdown: [
            "# Agent Context Pack Draft",
            "",
            "## Feature Summary",
            prompt,
            "",
            "## Implementation Guidance",
            "- Use existing SpecForge core models and governance functions.",
            "- Keep generated content deterministic while using MockAIProvider.",
            "- Do not call real model APIs in this MVP slice.",
            "",
            "## Test Suggestions",
            "- Verify provider selection.",
            "- Verify generated draft structure.",
            "- Verify unsupported provider errors."
          ].join("\n"),
          constraints: ["No real model calls", "No API keys", "Deterministic mock output"],
          instructions: ["Review impacted assets first", "Generate drafts through the provider registry", "Persist only after human review"]
        };
    }
  }
}

export class OpenAIProvider implements AIProvider {
  id = "openai";
  label = "OpenAI Provider";
  capabilities: AIProviderCapability[] = ["proposal", "adr", "businessRule", "testSuggestions", "agentContextPack"];

  async generate<TContent = Record<string, unknown>>(_request: AIProviderRequest): Promise<AIProviderResponse<TContent>> {
    throw new Error("OpenAIProvider is not configured. Add an implementation and credentials in a future integration slice.");
  }
}
