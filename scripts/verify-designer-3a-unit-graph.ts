import { PrismaClient } from "@prisma/client";
import { normalizePrincipalClaims } from "@specforge/core";
import { createGraphAnalysisRepository, createThreeAProjectionQueryService, PrismaThreeAQueryRepository, PrismaTraceContinuationStore } from "@specforge/knowledge-query";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const baselineId = "knowledge-baseline:designer:3a:v6";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const service = createThreeAProjectionQueryService(
    new PrismaThreeAQueryRepository(prisma),
    new PrismaTraceContinuationStore(prisma),
    { activeKeyId: "verification", keys: { verification: Buffer.from("specforge-3a-unit-graph-verification", "utf8") } },
    undefined,
    createGraphAnalysisRepository(prisma)
  );
  const principal = normalizePrincipalClaims({
    actorType: "system",
    subject: "3a-unit-graph-verifier",
    tenantId: "local-development",
    authSource: "seed",
    grants: [{ scopeId: scope.applicationServiceId, action: "read" }],
    permissions: ["knowledge:read"]
  }, { allowSeed: true });

  try {
    const manifests = await service.listProjectionManifests({ principal, architectureScope: scope, baselineId });
    const manifest = manifests.find((item) => item.baselineId === baselineId && item.publishedAt);
    if (!manifest?.generationId) throw new Error("UNIT_GRAPH_MANIFEST_NOT_FOUND");
    const graph = await service.unitGraph({
      principal,
      architectureScope: scope,
      baselineId,
      projectionManifestId: manifest.id,
      generationId: manifest.generationId,
      filter: { includeUnclassified: true },
      budget: { maxUnitsPerLayer: 12, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
    });
    if (graph.source !== "ARCHITECTURE_UNIT_PROJECTION" || graph.fidelity !== "UNIT" || graph.availability !== "READY" || graph.nodes.length !== 8 || graph.edges.length !== 6 || graph.analysisAvailability !== "EMPTY") {
      throw new Error(`UNIT_GRAPH_READBACK_MISMATCH:${JSON.stringify({ source: graph.source, fidelity: graph.fidelity, availability: graph.availability, nodes: graph.nodes.length, edges: graph.edges.length, analysisAvailability: graph.analysisAvailability })}`);
    }
    console.log(JSON.stringify({ baselineId, projectionManifestId: manifest.id, generationId: manifest.generationId, source: graph.source, fidelity: graph.fidelity, nodes: graph.nodes.length, edges: graph.edges.length, analysisAvailability: graph.analysisAvailability }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
