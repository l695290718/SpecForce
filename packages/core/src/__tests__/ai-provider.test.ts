import { describe, expect, it } from "vitest";
import {
  AIProviderRegistry,
  MockAIProvider,
  OpenAIProvider,
  generateAdrDraft,
  generateAgentContextPackDraft,
  generateBusinessRuleDraft,
  generateProposalDraft,
  generateRequirementAssessment,
  generateRequirementAssessmentReview,
  generateTestSuggestions
} from "../index";

describe("AI provider abstraction", () => {
  it("registers and invokes the mock provider", async () => {
    const registry = new AIProviderRegistry();
    registry.register(new MockAIProvider());

    const response = await registry.generate({
      provider: "mock",
      capability: "proposal",
      prompt: "Support partial refund",
      context: { domainId: "domain-order" }
    });

    expect(response.provider).toBe("mock");
    expect(response.capability).toBe("proposal");
    expect(response.content.title).toContain("Support partial refund");
    expect(response.usage.mocked).toBe(true);
  });

  it("generates stable mock drafts for supported capabilities", async () => {
    const proposal = await generateProposalDraft({ prompt: "Create refund workflow" });
    const adr = await generateAdrDraft({ prompt: "Use asynchronous refund events" });
    const rule = await generateBusinessRuleDraft({ prompt: "Refund cannot exceed refundable amount" });
    const tests = await generateTestSuggestions({ prompt: "Refund state machine" });
    const contextPack = await generateAgentContextPackDraft({ prompt: "Build partial refund" });
    const assessment = await generateRequirementAssessment({ prompt: "Assess partial refund" });
    const review = await generateRequirementAssessmentReview({ prompt: "Review partial refund" });

    expect(proposal.content.goal).toContain("Create refund workflow");
    expect(adr.content.status).toBe("proposed");
    expect(rule.content.severity).toBe("medium");
    expect(tests.content.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(contextPack.content.markdown).toContain("# Agent Context Pack Draft");
    expect(assessment.content.options.length).toBe(2);
    expect(review.content.checkedRules).toContain("Evidence coverage");
  });

  it("exposes optional operational usage metrics without changing legacy usage", async () => {
    const provider = new MockAIProvider();
    const response = await provider.generate({ capability: "requirementAssessment", prompt: "Assess a requirement" });

    expect(response.usage.toolCalls).toBe(0);
    expect(response.usage.retryCount).toBe(0);
    expect(response.usage.cacheReadTokens).toBe(0);
  });

  it("keeps OpenAI provider as an explicit unconfigured placeholder", async () => {
    const provider = new OpenAIProvider();

    await expect(
      provider.generate({
        capability: "adr",
        prompt: "Choose a payment integration strategy"
      })
    ).rejects.toThrow("OpenAIProvider is not configured");
  });
});
