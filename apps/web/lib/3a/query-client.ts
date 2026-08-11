import type { ImpactArchitectureResult, OverviewArchitectureResult } from "@specforge/knowledge-query";
import type { ThreeAWebQuery } from "./query-protocol";

export class ThreeAClientError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "ThreeAClientError";
  }
}

export async function runThreeAWebQuery<T>(input: ThreeAWebQuery, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/architecture/3a/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal
  });
  const payload = await response.json() as T | { code: string };
  if (!response.ok) throw new ThreeAClientError((payload as { code?: string }).code ?? "UNAVAILABLE", response.status);
  return payload as T;
}

export type OverviewArchitectureWebQuery = Extract<ThreeAWebQuery, { operation: "overview" }>;
export type ImpactArchitectureWebQuery = Extract<ThreeAWebQuery, { operation: "impact" }>;

export function runOverviewArchitectureQuery(input: OverviewArchitectureWebQuery, signal?: AbortSignal): Promise<OverviewArchitectureResult> {
  return runThreeAWebQuery<OverviewArchitectureResult>(input, signal);
}

export function runImpactArchitectureQuery(input: ImpactArchitectureWebQuery, signal?: AbortSignal): Promise<ImpactArchitectureResult> {
  return runThreeAWebQuery<ImpactArchitectureResult>(input, signal);
}
