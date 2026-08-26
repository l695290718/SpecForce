import type {
  AdrDraft,
  AgentContextPackDraft,
  AIProvider,
  AIProviderCapability,
  AIProviderRequest,
  AIProviderResponse,
  BusinessRuleDraft,
  ProposalDraft,
  RequirementAssessmentDraft,
  RequirementAssessmentReviewDraft,
  SemanticCandidateDraft,
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
  capabilities: AIProviderCapability[] = ["proposal", "adr", "businessRule", "testSuggestions", "agentContextPack", "semanticCandidates", "requirementAssessment", "requirementAssessmentReview"];

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
        outputTokens: Math.ceil(JSON.stringify(content).length / 4),
        toolCalls: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        retryCount: 0
      }
    };
  }

  private generateContent(request: AIProviderRequest): ProposalDraft | AdrDraft | BusinessRuleDraft | TestSuggestionsDraft | AgentContextPackDraft | SemanticCandidateDraft[] | RequirementAssessmentDraft | RequirementAssessmentReviewDraft {
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
      case "semanticCandidates":
        return mockSemanticCandidates(request);
      case "requirementAssessment":
        return {
          summary: `Mock evidence-grounded assessment for ${prompt}.`,
          requirementKinds: ["generic"],
          options: [
            { id: "option-preserve", title: "Preserve current contracts", rationale: "Minimizes compatibility and migration risk." },
            { id: "option-evolve", title: "Evolve the affected design assets", rationale: "Allows the requirement while keeping changes explicit and reviewable." }
          ],
          assumptions: ["The selected application-service Scope is authorized.", "Deterministic governance findings remain authoritative."],
          unknowns: ["Confirm acceptance criteria and external ownership before implementation."]
        };
      case "requirementAssessmentReview":
        return {
          disposition: "needs-attention",
          findings: [{ code: "MOCK_REVIEW_REQUIRED", severity: "warning", detail: `Independently confirm evidence coverage for ${prompt}.` }],
          checkedRules: ["Scope authorization", "Evidence coverage", "Estimate calibration status"]
        };
    }
  }
}

export class OpenAIProvider implements AIProvider {
  id = "openai";
  label = "OpenAI Provider";
  capabilities: AIProviderCapability[] = ["proposal", "adr", "businessRule", "testSuggestions", "agentContextPack", "semanticCandidates", "requirementAssessment", "requirementAssessmentReview"];

  async generate<TContent = Record<string, unknown>>(_request: AIProviderRequest): Promise<AIProviderResponse<TContent>> {
    throw new Error("OpenAIProvider is not configured. Add an implementation and credentials in a future integration slice.");
  }
}

function mockSemanticCandidates(request: AIProviderRequest): SemanticCandidateDraft[] {
  const observations = Array.isArray(request.context?.observations) ? request.context.observations : [];
  return observations.flatMap((rawObservation) => {
    if (!rawObservation || typeof rawObservation !== "object") return [];
    const observation = rawObservation as Record<string, unknown>;
    const sourceObservationId = String(observation.sourceObservationId ?? observation.id ?? "");
    const observationType = String(observation.observationType ?? "source-file");
    const sourcePath = String(observation.sourcePath ?? "unknown");
    if (!sourceObservationId) return [];

    const mapping: Record<string, { layer: SemanticCandidateDraft["layer"]; aspect: SemanticCandidateDraft["aspect"]; factType: string; prefix: string; en: string; zh: string }> = {
      "source-file": { layer: "TECH", aspect: "structure", factType: "source-file-candidate", prefix: "tech.source", en: "Source file is present in the scanned service.", zh: "扫描服务中存在该源文件。" },
      "system-component": { layer: "SYS", aspect: "structure", factType: "system-component-candidate", prefix: "sys.component", en: "Repository metadata indicates a system component boundary.", zh: "仓库元数据表明存在系统组件边界。" },
      "api-contract": { layer: "SYS", aspect: "contract", factType: "api-contract-candidate", prefix: "sys.api", en: "An API contract artifact is present in the scanned service.", zh: "扫描服务中存在 API 契约制品。" },
      "event-contract": { layer: "SYS", aspect: "contract", factType: "event-contract-candidate", prefix: "sys.event", en: "An event contract artifact is present in the scanned service.", zh: "扫描服务中存在事件契约制品。" },
      "data-model": { layer: "SYS", aspect: "information", factType: "data-model-candidate", prefix: "sys.data", en: "A data model artifact is present in the scanned service.", zh: "扫描服务中存在数据模型制品。" },
      documentation: { layer: "TECH", aspect: "constraint", factType: "documentation-candidate", prefix: "tech.documentation", en: "A documentation artifact is available as implementation evidence.", zh: "存在可作为实现证据的文档制品。" }
    };
    const selected = mapping[observationType] ?? mapping["source-file"]!;
    const semanticIdentity = `${selected.prefix}:${sourcePath}`;
    return [{
      sourceObservationId,
      semanticIdentity,
      factType: selected.factType,
      layer: selected.layer,
      aspect: selected.aspect,
      value: {
        sourcePath,
        observationType,
        summary: { en: selected.en, zh: selected.zh },
        canonicalDescription: `${selected.en} Path: ${sourcePath}`,
        localizedDescription: `${selected.zh} 路径：${sourcePath}`,
        generatedBy: "MockAIProvider",
        semanticStatus: "candidate-only"
      },
      confidence: observationType === "source-file" ? 0.62 : 0.78,
      matchingEvidence: [`source-observation:${sourceObservationId}`],
      counterEvidence: [],
      unresolvedQuestions: [
        "Confirm the owning team and production responsibility.",
        "Confirm whether this structural observation maps to an existing design asset."
      ]
    }];
  });
}
