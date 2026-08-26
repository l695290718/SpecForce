import { AIProviderRegistry } from "./registry";
import { MockAIProvider, OpenAIProvider } from "./providers";
import type {
  AdrDraft,
  AgentContextPackDraft,
  AIProviderRequest,
  AIProviderResponse,
  BusinessRuleDraft,
  ProposalDraft,
  RequirementAssessmentDraft,
  RequirementAssessmentReviewDraft,
  SemanticCandidateDraft,
  TestSuggestionsDraft
} from "./types";
import type { ScanObservation } from "../scanner/types";

export function createDefaultAIProviderRegistry(): AIProviderRegistry {
  const registry = new AIProviderRegistry();
  registry.register(new MockAIProvider());
  registry.register(new OpenAIProvider());
  return registry;
}

const defaultRegistry = createDefaultAIProviderRegistry();

type DraftRequest = Omit<AIProviderRequest, "capability">;

export async function generateProposalDraft(request: DraftRequest): Promise<AIProviderResponse<ProposalDraft>> {
  return defaultRegistry.generate<ProposalDraft>({ ...request, capability: "proposal" });
}

export async function generateAdrDraft(request: DraftRequest): Promise<AIProviderResponse<AdrDraft>> {
  return defaultRegistry.generate<AdrDraft>({ ...request, capability: "adr" });
}

export async function generateBusinessRuleDraft(request: DraftRequest): Promise<AIProviderResponse<BusinessRuleDraft>> {
  return defaultRegistry.generate<BusinessRuleDraft>({ ...request, capability: "businessRule" });
}

export async function generateTestSuggestions(request: DraftRequest): Promise<AIProviderResponse<TestSuggestionsDraft>> {
  return defaultRegistry.generate<TestSuggestionsDraft>({ ...request, capability: "testSuggestions" });
}

export async function generateAgentContextPackDraft(request: DraftRequest): Promise<AIProviderResponse<AgentContextPackDraft>> {
  return defaultRegistry.generate<AgentContextPackDraft>({ ...request, capability: "agentContextPack" });
}

export async function generateSemanticCandidates(request: { observations: ScanObservation[]; provider?: string }): Promise<AIProviderResponse<SemanticCandidateDraft[]>> {
  return defaultRegistry.generate<SemanticCandidateDraft[]>({
    provider: request.provider,
    capability: "semanticCandidates",
    prompt: "Generate evidence-backed semantic candidates for scanned observations. Never promote or accept facts.",
    context: { observations: request.observations }
  });
}

export async function generateRequirementAssessment(request: DraftRequest): Promise<AIProviderResponse<RequirementAssessmentDraft>> {
  return defaultRegistry.generate<RequirementAssessmentDraft>({ ...request, capability: "requirementAssessment" });
}

export async function generateRequirementAssessmentReview(request: DraftRequest): Promise<AIProviderResponse<RequirementAssessmentReviewDraft>> {
  return defaultRegistry.generate<RequirementAssessmentReviewDraft>({ ...request, capability: "requirementAssessmentReview" });
}
