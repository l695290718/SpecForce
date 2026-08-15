import { PrismaClient } from "@prisma/client";
import type { ArchitectureUnitMaterializationInput } from "./architecture-unit-materializer.js";
import { DeterministicGraphAnalysisMaterializer } from "./graph-analysis-materializer.js";
import { PrismaProjectionBuildRepository } from "./repository.js";
import { ProjectionMaterializer } from "./materializer.js";
import { createKnowledgeProjectorRuntime, runtimeConfigFromEnvironment } from "./runtime.js";

async function main(): Promise<void> {
  const config = runtimeConfigFromEnvironment(process.env);
  const prisma = new PrismaClient();
  const repository = new PrismaProjectionBuildRepository(prisma);
  const materializer = new ProjectionMaterializer(repository, {
    graphAnalysisMaterializer: new DeterministicGraphAnalysisMaterializer(),
    leaseDurationMs: config.leaseDurationMs,
    architectureUnitSource: async (job) => loadAuthoredArchitectureFacts(prisma, job)
  });
  const runtime = createKnowledgeProjectorRuntime({ materializer, repository, pollIntervalMs: config.pollIntervalMs });
  await prisma.$connect();
  await runtime.listen(config.port, config.host);
  const shutdown = async () => { await runtime.close(); await prisma.$disconnect(); };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

async function loadAuthoredArchitectureFacts(prisma: PrismaClient, job: { applicationServiceId: string; scopePath: string; baselineId: string; generationId: string }): Promise<ArchitectureUnitMaterializationInput | undefined> {
  const baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.baselineId } } });
  if (!baseline) throw new Error("BASELINE_NOT_OFFICIAL");
  const manifest = baseline.manifest as Record<string, unknown>;
  const revisionIds = stringArray(manifest.architectureFactRevisionIds);
  const identity = { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, baselineId: job.baselineId, projectionManifestId: `projection-manifest:${job.generationId}` };
  if (revisionIds.length === 0) return { ...identity, units: [], members: [], mappings: [] };
  const [units, memberships, mappings] = await Promise.all([
    prisma.architectureUnitRevision.findMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: { in: revisionIds }, status: "ACCEPTED" } }),
    prisma.architectureUnitMembershipRevision.findMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: { in: revisionIds }, status: "ACCEPTED" } }),
    prisma.architectureUnitMappingRevision.findMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: { in: revisionIds }, status: "ACCEPTED" } })
  ]);
  if (units.length + memberships.length + mappings.length !== revisionIds.length) throw new Error("ARCHITECTURE_FACT_BASELINE_REVISION_MISSING");
  const memberCount = new Map<string, number>();
  for (const member of memberships) memberCount.set(member.unitIdentity, (memberCount.get(member.unitIdentity) ?? 0) + 1);
  const unitsByIdentity = new Map(units.map((unit) => [unit.unitIdentity, unit]));
  return {
    ...identity,
    units: units.map((unit) => ({ ...identity, sourceType: "architecture-unit" as const, unitIdentity: unit.unitIdentity, layer: unit.layer as "BIZ" | "SYS" | "TECH", kind: unit.kind as never, parentUnitIdentity: unit.parentUnitIdentity ?? undefined, canonicalName: unit.canonicalName, localizedName: localizedName(unit.localizedContent), aliases: unit.aliases as string[], memberCount: memberCount.get(unit.unitIdentity) ?? 0, criticality: unit.criticality, completeness: 1, evidenceCount: (unit.evidenceRefs as string[]).length, unclassifiedMemberCount: 0, contentDigest: unit.contentDigest })),
    members: memberships.map((member) => ({ ...identity, sourceType: "architecture-unit-member" as const, unitIdentity: member.unitIdentity, assertionId: member.assertionId ?? `asset:${member.assetType}:${member.assetId}`, assetType: member.assetType ?? undefined, semanticIdentity: member.semanticIdentity, contentDigest: member.contentDigest })),
    mappings: mappings.map((mapping) => {
      const source = unitsByIdentity.get(mapping.sourceUnitIdentity);
      const target = unitsByIdentity.get(mapping.targetUnitIdentity);
      return {
        ...identity,
        sourceType: "architecture-unit-mapping" as const,
        mappingIdentity: mapping.mappingIdentity,
        sourceUnitIdentity: mapping.sourceUnitIdentity,
        targetUnitIdentity: mapping.targetUnitIdentity,
        sourceLayer: source?.layer as "BIZ" | "SYS" | "TECH",
        targetLayer: target?.layer as "BIZ" | "SYS" | "TECH",
        sourceEndpoints: source && target ? {
          source: { applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath, generationId: identity.generationId, unitIdentity: source.unitIdentity, layer: source.layer as "BIZ" | "SYS" | "TECH" },
          target: { applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath, generationId: identity.generationId, unitIdentity: target.unitIdentity, layer: target.layer as "BIZ" | "SYS" | "TECH" }
        } : undefined,
        mappingFamily: mapping.mappingFamily,
        relationshipCount: (mapping.relationshipIdentities as string[]).length,
        evidenceCount: (mapping.evidenceRefs as string[]).length,
        confidence: mapping.confidence,
        contentDigest: mapping.contentDigest
      };
    })
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function localizedName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const zh = (value as { zh?: unknown }).zh;
  return zh && typeof zh === "object" && !Array.isArray(zh) && typeof (zh as { name?: unknown }).name === "string" ? (zh as { name: string }).name : undefined;
}

void main().catch(() => { process.stderr.write("KNOWLEDGE_PROJECTOR_STARTUP_FAILED\n"); process.exitCode = 1; });
