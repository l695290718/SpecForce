import { PrismaClient } from "@prisma/client";
import { createGraphStore, type GraphStoreConfig } from "@specforge/graph-store";
import { ImpactAnalysisWorker, PrismaImpactWorkerRepository } from "./worker";

export * from "./worker";

export type RuntimeGraphStoreConfig =
  | { kind: "postgres"; enterpriseId: string }
  | { kind: "nebula"; enterpriseId: string; baseUrl: string };

type GraphEnvironment = Record<string, string | undefined>;

export function graphStoreConfigFromEnvironment(environment: GraphEnvironment = process.env): RuntimeGraphStoreConfig {
  const enterpriseId = environment.SPECFORGE_ENTERPRISE_ID?.trim();
  if (!enterpriseId) throw new Error("SPECFORGE_ENTERPRISE_ID_REQUIRED");

  const selector = environment.SPECFORGE_GRAPH_STORE?.trim();
  if (!selector) {
    if (environment.NODE_ENV === "development") return { kind: "postgres", enterpriseId };
    throw new Error("SPECFORGE_GRAPH_STORE_REQUIRED");
  }
  if (selector === "postgres") return { kind: "postgres", enterpriseId };
  if (selector !== "nebula") throw new Error("SPECFORGE_GRAPH_STORE_INVALID");

  return { kind: "nebula", enterpriseId, baseUrl: graphGatewayBaseUrl(environment.SPECFORGE_GRAPH_GATEWAY_URL) };
}

export function createImpactAnalysisWorkerFromEnvironment(
  prisma = new PrismaClient(),
  environment: GraphEnvironment = process.env
): ImpactAnalysisWorker {
  const config = graphStoreConfigFromEnvironment(environment);
  return createImpactAnalysisWorker(
    prisma,
    config.kind === "nebula"
      ? { kind: "nebula", baseUrl: config.baseUrl, enterpriseId: config.enterpriseId }
      : { kind: "postgres", client: prisma, options: { enterpriseId: config.enterpriseId } }
  );
}

export function createImpactAnalysisWorker(prisma = new PrismaClient(), graphStoreConfig?: GraphStoreConfig): ImpactAnalysisWorker {
  if (!graphStoreConfig) throw new Error("IMPACT_WORKER_GRAPH_STORE_CONFIG_REQUIRED");
  return new ImpactAnalysisWorker(new PrismaImpactWorkerRepository(prisma), createGraphStore(graphStoreConfig));
}

function graphGatewayBaseUrl(value: string | undefined): string {
  const baseUrl = value?.trim();
  if (!baseUrl) throw new Error("SPECFORGE_GRAPH_GATEWAY_URL_REQUIRED");
  try {
    const parsed = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("invalid gateway URL");
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("SPECFORGE_GRAPH_GATEWAY_URL_INVALID");
  }
}
