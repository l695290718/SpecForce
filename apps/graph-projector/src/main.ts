import { PrismaClient } from "@prisma/client";
import { HttpGraphGateway } from "./gateway.js";
import { GraphProjector } from "./projector.js";
import { PrismaProjectionRepository } from "./repository.js";
import { createProjectorRuntime, runtimeConfigFromEnvironment } from "./runtime.js";

async function main(): Promise<void> {
  const config = runtimeConfigFromEnvironment(process.env);
  const prisma = new PrismaClient();
  const repository = new PrismaProjectionRepository(prisma);
  const gateway = new HttpGraphGateway({
    baseUrl: config.gatewayUrl,
    resolvePayload: (event) => repository.projectionPayload(event)
  });
  const projector = new GraphProjector(repository, gateway);
  const runtime = createProjectorRuntime({
    projector,
    healthRepository: repository,
    pollIntervalMs: config.pollIntervalMs
  });

  await prisma.$connect();
  await runtime.listen(config.port, config.host);

  const shutdown = async () => {
    await runtime.close();
    await prisma.$disconnect();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

void main().catch(() => {
  process.stderr.write("GRAPH_PROJECTOR_STARTUP_FAILED\n");
  process.exitCode = 1;
});
