import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

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
const sessionId = "design-change-session:87996974-cab9-496d-84cd-9492518f0466";
const v4BaselineId = "knowledge-baseline:designer:3a:v4";
const v5BaselineId = "knowledge-baseline:designer:3a:v5";
const evidence = "evidence:designer-3a-membership-expansion-v5";
const gatewayUnit = "unit:sys:specforge-mcp-governance-gateway";

const additions = [
  ["api", "api-specforge-asset-link"],
  ["event", "event-specforge-asset-link-created"],
  ["event", "event-specforge-design-asset-upserted"],
  ["event", "event-specforge-mcp-tool-called"],
  ["businessRule", "rule-specforge-mcp-write-audit"],
  ["businessRule", "rule-specforge-relationships-required"],
  ["businessRule", "rule-specforge-seed-through-mcp"],
  ["integration", "integration-specforge-mcp-agent"],
  ["stateMachine", "sm-specforge-context-pack-generation"],
  ["stateMachine", "sm-specforge-proposal-lifecycle"]
] as const;

type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

function text(result: McpResponse): string {
  return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? "";
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function versionedId(id: string, version: number): string {
  return /:v\d+$/u.test(id) ? id.replace(/:v\d+$/u, `:v${version}`) : `${id}:v${version}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_INVALID`);
  return value as JsonRecord;
}

function hasLocalizedName(value: unknown): boolean {
  const record = requireRecord(value, "LOCALIZED_ASSET");
  const description = record.description ?? record.summary;
  return typeof record.name === "string" && record.name.trim().length > 0 && typeof description === "string" && description.trim().length > 0;
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId, DATABASE_URL: databaseUrl }
  });
  const client = new Client({ name: "designer-3a-v5-publisher", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => {
    const response = await client.callTool({ name, arguments: arguments_ });
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    try { return JSON.parse(raw) as JsonRecord; } catch { throw new Error(`${name}_NON_JSON_RESPONSE`); }
  };

  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    await client.connect(transport);

    const linkResult = await call("list_asset_links", { applicationServiceId: scope.applicationServiceId });
    const links = (Array.isArray(linkResult) ? linkResult : (Array.isArray(linkResult.links) ? linkResult.links : [])) as JsonRecord[];
    const sourceEvidence = new Map<string, string[]>();
    for (const [assetType, assetId] of additions) {
      const english = await call("get_asset_detail", { assetType, assetId, ...scope, format: "json", locale: "en" });
      const chinese = await call("get_asset_detail", { assetType, assetId, ...scope, format: "json", locale: "zh" });
      if (!hasLocalizedName(english.asset) || !hasLocalizedName(chinese.asset)) throw new Error(`BILINGUAL_ASSET_CONTENT_MISSING:${assetType}:${assetId}`);
      const assetLinks = links.filter((link) => link.sourceId === assetId || link.targetId === assetId);
      if (assetLinks.length === 0) throw new Error(`TYPED_LINK_EVIDENCE_MISSING:${assetType}:${assetId}`);
      sourceEvidence.set(`${assetType}:${assetId}`, unique([assetId, ...assetLinks.map((link) => String(link.id ?? "")).filter(Boolean)]));
    }

    const v4Baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: v4BaselineId } } });
    if (!v4Baseline || v4Baseline.status !== "PUBLISHED" || !v4Baseline.publishedAt) throw new Error("V4_BASELINE_NOT_PUBLISHED");
    const manifest = requireRecord(v4Baseline.manifest, "V4_BASELINE_MANIFEST");
    const revisionIds = jsonArray(manifest.architectureFactRevisionIds);
    if (revisionIds.length === 0) throw new Error("V4_ARCHITECTURE_REVISIONS_MISSING");
    const [v4Units, v4Memberships, v4Mappings] = await Promise.all([
      prisma.architectureUnitRevision.findMany({ where: { ...scope, id: { in: revisionIds }, status: "ACCEPTED" } }),
      prisma.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: revisionIds }, status: "ACCEPTED" } }),
      prisma.architectureUnitMappingRevision.findMany({ where: { ...scope, id: { in: revisionIds }, status: "ACCEPTED" } })
    ]);
    if (v4Units.length !== 4 || v4Memberships.length !== 28 || v4Mappings.length !== 3) {
      throw new Error(`V4_SNAPSHOT_COUNT_MISMATCH:${JSON.stringify({ units: v4Units.length, memberships: v4Memberships.length, mappings: v4Mappings.length })}`);
    }

    const units = v4Units.map((unit) => ({
      id: versionedId(unit.id, 4),
      unitIdentity: unit.unitIdentity,
      revision: unit.revision + 1,
      layer: unit.layer,
      kind: unit.kind,
      ...(unit.parentUnitIdentity ? { parentUnitIdentity: unit.parentUnitIdentity } : {}),
      canonicalName: unit.canonicalName,
      canonicalDescription: unit.canonicalDescription,
      localizedContent: unit.localizedContent,
      aliases: jsonArray(unit.aliases),
      criticality: unit.criticality,
      evidenceRefs: unique([...jsonArray(unit.evidenceRefs), evidence, `source:${unit.id}`])
    }));
    const memberships = v4Memberships.map((membership) => ({
      id: versionedId(membership.id, 5),
      membershipIdentity: membership.membershipIdentity,
      revision: membership.revision + 1,
      unitIdentity: membership.unitIdentity,
      ...(membership.assertionId ? { assertionId: membership.assertionId } : {}),
      ...(membership.assetType ? { assetType: membership.assetType } : {}),
      ...(membership.assetId ? { assetId: membership.assetId } : {}),
      semanticIdentity: membership.semanticIdentity,
      confidence: membership.confidence,
      evidenceRefs: unique([...jsonArray(membership.evidenceRefs), evidence, `source:${membership.id}`])
    }));
    for (const [assetType, assetId] of additions) {
      memberships.push({
        id: `architecture-membership-revision:designer:v5:${assetType}:${assetId}`,
        membershipIdentity: `membership:${gatewayUnit}:${assetId}`,
        revision: 5,
        unitIdentity: gatewayUnit,
        assetType,
        assetId,
        semanticIdentity: `${assetType}:${assetId}`,
        confidence: 1,
        evidenceRefs: unique([evidence, ...sourceEvidence.get(`${assetType}:${assetId}`) ?? []])
      });
    }
    const mappings = v4Mappings.map((mapping) => ({
      id: versionedId(mapping.id, 4),
      mappingIdentity: mapping.mappingIdentity,
      revision: mapping.revision + 1,
      sourceUnitIdentity: mapping.sourceUnitIdentity,
      targetUnitIdentity: mapping.targetUnitIdentity,
      mappingFamily: mapping.mappingFamily,
      confidence: mapping.confidence,
      relationshipIdentities: jsonArray(mapping.relationshipIdentities),
      evidenceRefs: unique([...jsonArray(mapping.evidenceRefs), evidence, `source:${mapping.id}`])
    }));
    if (units.length !== 4 || memberships.length !== 38 || mappings.length !== 3) throw new Error("V5_SNAPSHOT_COUNT_MISMATCH");

    const evidenceRefs = unique([
      evidence,
      "docs/superpowers/specs/2026-08-15-designer-3a-v5-membership-expansion-design.md",
      "adr-readable-3a-architecture-mapping",
      ...additions.flatMap(([assetType, assetId]) => [`${assetType}:${assetId}`, ...(sourceEvidence.get(`${assetType}:${assetId}`) ?? [])])
    ]);
    const batch = await call("submit_3a_architecture_fact_batch", {
      architectureScope: scope,
      id: "architecture-fact-batch:designer:3a:coverage:v5",
      idempotencyKey: "architecture-fact-batch:designer:3a:coverage:v5",
      designChangeSessionId: sessionId,
      provenance: { actor: "codex", tool: "publish-designer-3a-v5", runId: "designer-3a-membership-expansion-v5" },
      evidenceRefs,
      units,
      memberships,
      mappings
    });
    const architectureFactRevisionIds = unique([
      ...jsonArray(batch.unitRevisionIds),
      ...jsonArray(batch.membershipRevisionIds),
      ...jsonArray(batch.mappingRevisionIds)
    ]);
    if (architectureFactRevisionIds.length !== 45) throw new Error(`V5_BATCH_REVISION_COUNT_MISMATCH:${architectureFactRevisionIds.length}`);
    const review = await call("create_knowledge_review_bundle", {
      architectureScope: scope,
      id: "knowledge-review-bundle:designer:3a:coverage:v5",
      designChangeSessionId: sessionId,
      riskTier: "T1",
      assertionIds: [],
      identityCandidateIds: [],
      architectureFactRevisionIds,
      evidenceRefs,
      coverage: { totalSources: additions.length, processedSources: additions.length, supportedSources: additions.length, candidateCount: architectureFactRevisionIds.length, complete: true },
      blockingIssues: []
    });
    const decision = await call("decide_knowledge_review_bundle", {
      architectureScope: scope,
      id: "knowledge-promotion-decision:designer:3a:coverage:v5",
      reviewBundleId: String(review.id),
      decision: "APPROVE",
      approvedAssertionIds: [],
      approvedIdentityCandidateIds: [],
      approvedArchitectureFactRevisionIds: architectureFactRevisionIds,
      evidenceRefs,
      reason: "The v5 snapshot carries forward the accepted v4 architecture and adds exactly ten bilingual, typed-link-backed memberships to the existing MCP Governance Gateway unit; no unit, mapping, naming, or cross-Scope inference was introduced."
    });
    const stream = await call("create_working_stream", { architectureScope: scope, id: "working-stream:designer:3a", name: "Designer governed 3A architecture" });
    const promotion = await call("promote_3a_architecture_facts", { architectureScope: scope, promotionDecisionId: String(decision.id), streamId: String(stream.id), evidenceRefs });
    const reconciliation = await call("reconcile_3a_architecture_facts", { architectureScope: scope, promotionReceiptId: String(promotion.id) });
    if (reconciliation.status !== "CONVERGED") throw new Error(`V5_RECONCILIATION_NOT_CONVERGED:${JSON.stringify(reconciliation)}`);
    const baseline = await call("publish_knowledge_baseline", {
      architectureScope: scope,
      id: v5BaselineId,
      streamId: String(stream.id),
      changeSetId: String(promotion.changeSetId),
      sourceRevisionIds: [],
      architectureFactRevisionIds,
      relationshipVersion: String(reconciliation.relationshipVersion),
      reconciliationReceiptId: String(reconciliation.id)
    });
    console.log(JSON.stringify({ scope, sessionId, baselineId: v5BaselineId, batch, review, decision, stream, promotion, reconciliation, baseline, counts: { units: units.length, memberships: memberships.length, mappings: mappings.length }, addedMemberships: additions.map(([assetType, assetId]) => `${assetType}:${assetId}`) }, null, 2));
  } finally {
    await prisma.$disconnect();
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
