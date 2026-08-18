import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { genericSystemCoverageProfile, type ArchitectureScopeRef } from "@specforge/core";
import { PrismaCoverageBuildRepository, type CoverageBuildJob } from "../apps/knowledge-projector/src/coverage-repository";
import { createCoverageProjectorRuntime, type CoverageSnapshot } from "../apps/knowledge-projector/src/coverage-materializer";

const scope: ArchitectureScopeRef = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const baselineId = "knowledge-baseline:designer:3a:v6";
const generationId = "coverage-generation:designer:3a:v11";

type ToolResult = { isError?: boolean; content?: Array<{ type?: string; text?: string }> };

function parse(result: ToolResult): Record<string, unknown> {
  const text = (result.content ?? []).map((item) => item.type === "text" ? item.text ?? "" : "").join("");
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

async function requestBuild(): Promise<CoverageBuildJob> {
  const requireFromMcp = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(process.cwd(), "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(process.cwd(), "apps/mcp-server/src/index.ts")], cwd: process.cwd(), env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }, stderr: "inherit" });
  const client = new Client({ name: "specforge-enterprise-3a-build", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name: "request_3a_coverage_build", arguments: { architectureScope: scope, baselineId, generationId, profileId: genericSystemCoverageProfile.id, profileVersion: genericSystemCoverageProfile.version, coverageSchemaVersion: genericSystemCoverageProfile.schemaVersion, query: {} } }) as ToolResult;
    if (result.isError) throw new Error("COVERAGE_BUILD_REQUEST_FAILED");
    const payload = parse(result);
    const jobId = String(payload.jobId);
    const prisma = new PrismaClient();
    try {
      const row = await prisma.architectureCoverageBuildJob.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: jobId } } });
      if (!row) throw new Error("COVERAGE_BUILD_JOB_NOT_FOUND");
      return { ...row, catalogVersion: row.catalogVersion.toString(), query: row.query as Record<string, unknown>, checkpoint: row.checkpoint as Record<string, unknown>, status: row.status as CoverageBuildJob["status"] } as unknown as CoverageBuildJob;
    } finally { await prisma.$disconnect(); }
  } finally { await client.close(); await transport.close(); }
}

async function main(): Promise<void> {
  const job = await requestBuild();
  const prisma = new PrismaClient();
  try {
    const repository = new PrismaCoverageBuildRepository(prisma);
    const snapshotLoader = { load: async (current: CoverageBuildJob): Promise<CoverageSnapshot> => {
      const baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: current.baselineId } } });
      if (!baseline) throw new Error("BASELINE_NOT_OFFICIAL");
      const [revisions, links, memberships] = await Promise.all([
        prisma.authoredAssetRevision.findMany({ where: { ...scope, catalogVersion: { lte: BigInt(current.catalogVersion) } }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }] }),
        prisma.assetLink.findMany({ where: scope, orderBy: [{ sourceType: "asc" }, { sourceId: "asc" }, { relationType: "asc" }, { targetType: "asc" }, { targetId: "asc" }] }),
        prisma.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: baselineRevisionIds(baseline.manifest) }, status: "ACCEPTED", assetId: { not: null } }, select: { assetType: true, assetId: true } })
      ]);
      return {
        ...scope,
        baselineId: current.baselineId,
        generationId: current.generationId,
        catalogVersion: current.catalogVersion,
        relationshipVersion: current.relationshipVersion,
        revisions: revisions.map((row) => ({ ...scope, catalogVersion: row.catalogVersion, assetType: row.assetType, assetId: row.assetId, operation: row.operation as "UPSERT" | "DELETE", payload: row.payload, contentDigest: row.contentDigest })),
        relationships: links.map((row) => ({ ...scope, relationshipIdentity: row.id, relationCode: row.relationType.toUpperCase(), sourceType: row.sourceType, sourceId: row.sourceId, targetType: row.targetType, targetId: row.targetId })),
        directMemberIds: memberships.flatMap((row) => row.assetId ? [row.assetId] : []),
        directMemberships: memberships.flatMap((row) => row.assetType && row.assetId ? [{ assetType: row.assetType, assetId: row.assetId }] : [])
      };
    } };
    const runtime = createCoverageProjectorRuntime({ repository, snapshotLoader, owner: "enterprise-3a-coverage-projector", batchSize: 1000 });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await runtime.processNext();
      if (result.status === "published" || result.status === "failed") {
        const persisted = await prisma.architectureCoverageBuildJob.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: job.id } }, select: { errorCode: true, diagnosticRef: true, status: true } });
        console.log(JSON.stringify({ ...result, jobId: job.id, persisted }, null, 2));
        if (result.status === "failed") process.exitCode = 1;
        return;
      }
      if (result.status === "idle") await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    const pending = await prisma.architectureCoverageBuildJob.findMany({ where: { ...scope }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, generationId: true, status: true, errorCode: true, diagnosticRef: true } });
    console.log(JSON.stringify({ status: "timeout", pending }, null, 2));
    throw new Error("COVERAGE_BUILD_TIMEOUT");
  } finally { await prisma.$disconnect(); }
}

function baselineRevisionIds(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return [];
  const value = (manifest as Record<string, unknown>).architectureFactRevisionIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
