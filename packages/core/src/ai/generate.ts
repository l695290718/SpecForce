import { AIProviderRegistry } from "./registry";
import { MockAIProvider, OpenAIProvider } from "./providers";
import type {
  AdrDraft,
  AgentContextPackDraft,
  AIProviderRequest,
  AIProviderResponse,
  BusinessRuleDraft,
  ProposalDraft,
  TestSuggestionsDraft
} from "./types";

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
