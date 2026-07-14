import { PrismaClient } from "@prisma/client";
import { createGraphStore, type GraphStoreConfig } from "@specforge/graph-store";
import { ImpactAnalysisWorker, PrismaImpactWorkerRepository } from "./worker";

export * from "./worker";

export function createImpactAnalysisWorker(prisma = new PrismaClient(), graphStoreConfig?: GraphStoreConfig): ImpactAnalysisWorker {
  if (!graphStoreConfig) throw new Error("IMPACT_WORKER_GRAPH_STORE_CONFIG_REQUIRED");
  return new ImpactAnalysisWorker(new PrismaImpactWorkerRepository(prisma), createGraphStore(graphStoreConfig));
}
