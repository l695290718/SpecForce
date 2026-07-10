import { NextResponse } from "next/server";
import {
  AIProviderRegistry,
  MockAIProvider,
  OpenAIProvider,
  type AIProviderCapability
} from "@specforge/core";

const capabilities: AIProviderCapability[] = ["proposal", "adr", "businessRule", "testSuggestions", "agentContextPack"];

export async function POST(request: Request) {
  const body = (await request.json()) as {
    provider?: string;
    capability?: AIProviderCapability;
    prompt?: string;
    context?: Record<string, unknown>;
  };

  if (!body.capability || !capabilities.includes(body.capability)) {
    return NextResponse.json({ error: `capability must be one of: ${capabilities.join(", ")}` }, { status: 400 });
  }
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const registry = new AIProviderRegistry();
  registry.register(new MockAIProvider());
  registry.register(new OpenAIProvider());

  try {
    const response = await registry.generate({
      provider: body.provider ?? "mock",
      capability: body.capability,
      prompt: body.prompt,
      context: body.context
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI generation failed" }, { status: 400 });
  }
}
