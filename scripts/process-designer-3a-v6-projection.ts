import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { ProjectionBuildJob } from "@specforge/core";
import { DeterministicGraphAnalysisMaterializer } from "../apps/knowledge-projector/src/graph-analysis-materializer.js";
import { ProjectionMaterializer } from "../apps/knowledge-projector/src/materializer.js";
import { PrismaProjectionBuildRepository } from "../apps/knowledge-projector/src/repository.js";

const root = process.cwd();
const databaseUrl = readFileSync(resolve(root, ".env"), "utf8")
  .split(/\r?\n/u)
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length)
  .trim()
  .replaceAll('"', "");
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const baselineId = "knowledge-baseline:designer:3a:v6";
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

function text(result: McpResponse): string {
  return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function localizedName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const zh = (value as { zh?: unknown }).zh;
  return zh && typeof zh === "object" && !Array.isArray(zh) && typeof (zh as { name?: unknown }).name === "string" ? (zh as { name: string }).name : undefined;
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId, DATABASE_URL: databaseUrl }
  });
  const client = new Client({ name: "designer-3a-v6-projection", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => {
    const response = await client.callTool({ name, arguments: arguments_ });
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    return JSON.parse(raw) as JsonRecord;
  };
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    await client.connect(transport);
    const request = await call("request_3a_projection_build", {
      architectureScope: scope,
      baselineId,
      profileId: "generic-system",
      profileVersion: "1",
      projectionSchemaVersion: "3a.v2",
      query: { layers: ["BIZ", "SYS", "TECH"] }
    });
    const repository = new PrismaProjectionBuildRepository(prisma);
    const materializer = new ProjectionMaterializer(repository, {
      owner: "designer-3a-v6-projection",
      graphAnalysisMaterializer: new DeterministicGraphAnalysisMaterializer(),
      architectureUnitSource: async (job) => {
        const baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: job.baselineId } } });
        if (!baseline || baseline.status !== "PUBLISHED") throw new Error("BASELINE_NOT_OFFICIAL");
        const manifest = baseline.manifest as Record<string, unknown>;
        const revisionIds = stringArray(manifest.architectureFactRevisionIds);
        const identity = { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, baselineId: job.baselineId, projectionManifestId: `projection-manifest:${job.generationId}` };
        const [units, memberships, mappings] = await Promise.all([
          prisma.architectureUnitRevision.findMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: { in: revisionIds }, status: "ACCEPTED" } }),
          prisma.architectureUnitMembershipRevision.findMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: { in: revisionIds }, status: "ACCEPTED" } }),
          prisma.architectureUnitMappingRevision.findMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: { in: revisionIds }, status: "ACCEPTED" } })
        ]);
        if (units.length !== 8 || memberships.length !== 42 || mappings.length !== 6) throw new Error(`V6_PROJECTION_SOURCE_COUNT_MISMATCH:${JSON.stringify({ units: units.length, memberships: memberships.length, mappings: mappings.length })}`);
        const memberCount = new Map<string, number>();
        for (const member of memberships) memberCount.set(member.unitIdentity, (memberCount.get(member.unitIdentity) ?? 0) + 1);
        const unitsByIdentity = new Map(units.map((unit) => [unit.unitIdentity, unit]));
        return {
          ...identity,
          units: units.map((unit) => ({ ...identity, sourceType: "architecture-unit" as const, unitIdentity: unit.unitIdentity, layer: unit.layer as "BIZ" | "SYS" | "TECH", kind: unit.kind as never, parentUnitIdentity: unit.parentUnitIdentity ?? undefined, canonicalName: unit.canonicalName, localizedName: localizedName(unit.localizedContent), aliases: unit.aliases as string[], memberCount: memberCount.get(unit.unitIdentity) ?? 0, criticality: unit.criticality, completeness: 1, evidenceCount: stringArray(unit.evidenceRefs).length, unclassifiedMemberCount: 0, contentDigest: unit.contentDigest })),
          members: memberships.map((member) => ({ ...identity, sourceType: "architecture-unit-member" as const, unitIdentity: member.unitIdentity, assertionId: member.assertionId ?? `asset:${member.assetType}:${member.assetId}`, assetType: member.assetType ?? undefined, semanticIdentity: member.semanticIdentity, contentDigest: member.contentDigest })),
          mappings: mappings.map((mapping) => {
            const source = unitsByIdentity.get(mapping.sourceUnitIdentity);
            const target = unitsByIdentity.get(mapping.targetUnitIdentity);
            return { ...identity, sourceType: "architecture-unit-mapping" as const, mappingIdentity: mapping.mappingIdentity, sourceUnitIdentity: mapping.sourceUnitIdentity, targetUnitIdentity: mapping.targetUnitIdentity, sourceLayer: source?.layer as "BIZ" | "SYS" | "TECH", targetLayer: target?.layer as "BIZ" | "SYS" | "TECH", sourceEndpoints: source && target ? { source: { ...identity, unitIdentity: source.unitIdentity, layer: source.layer as "BIZ" | "SYS" | "TECH" }, target: { ...identity, unitIdentity: target.unitIdentity, layer: target.layer as "BIZ" | "SYS" | "TECH" } } : undefined, mappingFamily: mapping.mappingFamily, relationshipCount: stringArray(mapping.relationshipIdentities).length, evidenceCount: stringArray(mapping.evidenceRefs).length, confidence: mapping.confidence, contentDigest: mapping.contentDigest };
          })
        };
      }
    });
    const requestedId = String(request.id ?? request.jobId ?? "");
    const latest = requestedId
      ? await prisma.projectionBuildJob.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: requestedId } } })
      : await prisma.projectionBuildJob.findFirst({ where: { ...scope, baselineId }, orderBy: { createdAt: "desc" } });
    if (!latest) throw new Error("DESIGNER_3A_V6_PROJECTION_JOB_NOT_FOUND");
    const leaseExpiresAt = new Date(Date.now() + 30_000);
    await prisma.projectionBuildJob.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: latest.id } }, data: { status: "BUILDING", leaseOwner: "designer-3a-v6-projection", leaseExpiresAt, errorCode: null, diagnosticRef: null } });
    const job: ProjectionBuildJob = { ...scope, id: latest.id, buildKey: latest.buildKey, generationId: latest.generationId, baselineId: latest.baselineId, profileId: latest.profileId, profileVersion: latest.profileVersion, projectionSchemaVersion: "3a.v2", status: "BUILDING", attempt: latest.attempt, leaseOwner: "designer-3a-v6-projection", leaseExpiresAt: leaseExpiresAt.toISOString(), checkpoint: (latest.checkpoint ?? {}) as ProjectionBuildJob["checkpoint"], nodeCount: latest.nodeCount, edgeCount: latest.edgeCount };
    const result = await materializer.process(job);
    const manifest = await prisma.projectionManifest.findFirst({ where: { ...scope, baselineId, publishedAt: { not: null } }, orderBy: { createdAt: "desc" } });
    const analysis = await prisma.knowledgeGraphAnalysis.findFirst({ where: { ...scope, baselineId }, orderBy: { createdAt: "desc" } });
    console.log(JSON.stringify({ scope, baselineId, request, jobId: latest.id, result, projectionManifest: manifest ? { id: manifest.id, status: manifest.publishedAt ? "PUBLISHED" : "PENDING", nodeCount: manifest.nodeCount, edgeCount: manifest.edgeCount } : null, derivedAnalysis: analysis ? { status: analysis.status, clusterCount: analysis.clusterCount, nodeMetricCount: analysis.nodeMetricCount, bridgeEdgeCount: analysis.bridgeEdgeCount } : null }, null, 2));
  } finally {
    await prisma.$disconnect();
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
