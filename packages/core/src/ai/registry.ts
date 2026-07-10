import type { AIProvider, AIProviderRequest, AIProviderResponse } from "./types";

export class AIProviderRegistry {
  private providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): AIProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`AI provider not registered: ${providerId}`);
    }
    return provider;
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  async generate<TContent = Record<string, unknown>>(request: AIProviderRequest): Promise<AIProviderResponse<TContent>> {
    const provider = this.get(request.provider ?? "mock");
    return provider.generate<TContent>(request);
  }
}
