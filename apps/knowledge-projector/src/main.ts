import { PrismaClient } from "@prisma/client";
import { PrismaProjectionBuildRepository } from "./repository.js";
import { ProjectionMaterializer } from "./materializer.js";
import { createKnowledgeProjectorRuntime, runtimeConfigFromEnvironment } from "./runtime.js";

async function main(): Promise<void> {
  const config = runtimeConfigFromEnvironment(process.env);
  const prisma = new PrismaClient();
  const repository = new PrismaProjectionBuildRepository(prisma);
  const materializer = new ProjectionMaterializer(repository);
  const runtime = createKnowledgeProjectorRuntime({ materializer, repository, pollIntervalMs: config.pollIntervalMs });
  await prisma.$connect();
  await runtime.listen(config.port, config.host);
  const shutdown = async () => { await runtime.close(); await prisma.$disconnect(); };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

void main().catch(() => { process.stderr.write("KNOWLEDGE_PROJECTOR_STARTUP_FAILED\n"); process.exitCode = 1; });
