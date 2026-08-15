import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { Designer3aCandidateEvidence, Designer3aV5Snapshot } from "./designer-3a-v6-contract";
import { buildDesigner3aV6Snapshot, V6_CANDIDATE_IDS } from "./designer-3a-v6-contract";

const root = process.cwd();
const databaseUrl = readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/u).find((line) => line.startsWith("DATABASE_URL="))?.slice("DATABASE_URL=".length).trim().replaceAll('"', "");
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const sessionId = "design-change-session:8d24d98b-c3de-490c-9b58-96e85c6abf02";
const v5BaselineId = "knowledge-baseline:designer:3a:v5";
const v6BaselineId = "knowledge-baseline:designer:3a:v6";
const batchId = "architecture-fact-batch:designer:3a:coverage:v6";
const evidence = "evidence:designer-3a-semantic-unit-expansion-v6";
type JsonRecord = Record<string, unknown>;
type McpResponse = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

function responseText(result: McpResponse): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function record(value: unknown, label: string): JsonRecord { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_INVALID`); return value as JsonRecord; }
function array(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId, DATABASE_URL: databaseUrl } });
  const client = new Client({ name: "designer-3a-v6-publisher", version: "0.1.0" }, { capabilities: {} });
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => {
    const response = await client.callTool({ name, arguments: arguments_ });
    const raw = responseText(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    try { return JSON.parse(raw) as JsonRecord; } catch { throw new Error(`${name}_NON_JSON_RESPONSE`); }
  };
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    await client.connect(transport);
    const linksResult = await call("list_asset_links", { applicationServiceId: scope.applicationServiceId });
    const links = Array.isArray(linksResult) ? linksResult : array(linksResult.links);
    const candidates = await readCandidateEvidence(call, links);
    const baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: v5BaselineId } } });
    if (!baseline || baseline.status !== "PUBLISHED" || !baseline.publishedAt) throw new Error("V5_BASELINE_NOT_PUBLISHED");
    const manifest = record(baseline.manifest, "V5_BASELINE_MANIFEST");
    const revisionIds = strings(manifest.architectureFactRevisionIds);
    const [units, memberships, mappings] = await Promise.all([
      prisma.architectureUnitRevision.findMany({ where: { ...scope, id: { in: revisionIds }, status: "ACCEPTED" } }),
      prisma.architectureUnitMembershipRevision.findMany({ where: { ...scope, id: { in: revisionIds }, status: "ACCEPTED" } }),
      prisma.architectureUnitMappingRevision.findMany({ where: { ...scope, id: { in: revisionIds }, status: "ACCEPTED" } })
    ]);
    const v5: Designer3aV5Snapshot = { units: units.map(toUnit), memberships: memberships.map(toMembership), mappings: mappings.map(toMapping) };
    const snapshot = buildDesigner3aV6Snapshot({ v5, candidates });
    if (snapshot.units.length !== 8 || snapshot.memberships.length !== 42 || snapshot.mappings.length !== 6) throw new Error("V6_SNAPSHOT_COUNT_MISMATCH");
    const evidenceRefs = unique([evidence, "adr-readable-3a-architecture-mapping", ...snapshot.evidenceRefs, ...candidates.flatMap((candidate) => candidate.evidenceRefs)]);
    const batch = await call("submit_3a_architecture_fact_batch", { architectureScope: scope, id: batchId, idempotencyKey: batchId, designChangeSessionId: sessionId, provenance: { actor: "codex", tool: "publish-designer-3a-v6", runId: "designer-3a-semantic-unit-expansion-v6" }, evidenceRefs, units: snapshot.units, memberships: snapshot.memberships, mappings: snapshot.mappings });
    const architectureFactRevisionIds = unique([...strings(batch.unitRevisionIds), ...strings(batch.membershipRevisionIds), ...strings(batch.mappingRevisionIds)]);
    if (architectureFactRevisionIds.length !== 56) throw new Error(`V6_BATCH_REVISION_COUNT_MISMATCH:${architectureFactRevisionIds.length}`);
    const review = await call("create_knowledge_review_bundle", { architectureScope: scope, id: "knowledge-review-bundle:designer:3a:coverage:v6", designChangeSessionId: sessionId, riskTier: "T1", assertionIds: [], identityCandidateIds: [], architectureFactRevisionIds, evidenceRefs, coverage: { totalSources: V6_CANDIDATE_IDS.length, processedSources: V6_CANDIDATE_IDS.length, supportedSources: V6_CANDIDATE_IDS.length, candidateCount: architectureFactRevisionIds.length, complete: true }, blockingIssues: [] });
    const decision = await call("decide_knowledge_review_bundle", { architectureScope: scope, id: "knowledge-promotion-decision:designer:3a:coverage:v6", reviewBundleId: String(review.id), decision: "APPROVE", approvedAssertionIds: [], approvedIdentityCandidateIds: [], approvedArchitectureFactRevisionIds: architectureFactRevisionIds, evidenceRefs, reason: "The v6 complete snapshot carries forward the accepted v5 architecture and adds exactly four bilingual SYS units with four direct memberships and three relationship-backed SYS-to-TECH mappings." });
    const stream = await call("create_working_stream", { architectureScope: scope, id: "working-stream:designer:3a", name: "Designer governed 3A architecture" });
    const promotion = await call("promote_3a_architecture_facts", { architectureScope: scope, promotionDecisionId: String(decision.id), streamId: String(stream.id), evidenceRefs });
    const reconciliation = await call("reconcile_3a_architecture_facts", { architectureScope: scope, promotionReceiptId: String(promotion.id) });
    if (reconciliation.status !== "CONVERGED") throw new Error(`V6_RECONCILIATION_NOT_CONVERGED:${JSON.stringify(reconciliation)}`);
    const published = await call("publish_knowledge_baseline", { architectureScope: scope, id: v6BaselineId, streamId: String(stream.id), changeSetId: String(promotion.changeSetId), sourceRevisionIds: [], architectureFactRevisionIds, relationshipVersion: String(reconciliation.relationshipVersion), reconciliationReceiptId: String(reconciliation.id) });
    console.log(JSON.stringify({ scope, sessionId, baselineId: v6BaselineId, batch, review, decision, stream, promotion, reconciliation, published, counts: { units: snapshot.units.length, memberships: snapshot.memberships.length, mappings: snapshot.mappings.length }, candidates: candidates.map((candidate) => ({ assetType: candidate.assetType, assetId: candidate.assetId, relationshipCodes: candidate.relationshipCodes, relationshipIdentities: candidate.relationshipIdentities })) }, null, 2));
  } finally {
    await prisma.$disconnect();
    await client.close();
    await transport.close();
  }
}

async function readCandidateEvidence(call: (name: string, arguments_: JsonRecord) => Promise<JsonRecord>, links: JsonRecord[]): Promise<Designer3aCandidateEvidence[]> {
  const targets: Record<string, { assetType: "api" | "observability"; targetId?: string; codes: string[] }> = {
    "api-specforge-ai-generation": { assetType: "api", targetId: "data-specforge-ai-generation", codes: ["READS", "WRITES"] },
    "api-specforge-graph-query": { assetType: "api", targetId: "data-specforge-asset-graph", codes: ["READS"] },
    "api-specforge-web-console": { assetType: "api", codes: ["CALLS"] },
    "obs-specforge-mcp-audit": { assetType: "observability", targetId: "data-specforge-audit", codes: ["OBSERVES"] }
  };
  const result: Designer3aCandidateEvidence[] = [];
  for (const assetId of V6_CANDIDATE_IDS) {
    const definition = targets[assetId];
    const english = await call("get_asset_detail", { assetType: definition.assetType, assetId, ...scope, format: "json", locale: "en" });
    const chinese = await call("get_asset_detail", { assetType: definition.assetType, assetId, ...scope, format: "json", locale: "zh" });
    if (!hasLocalizedAsset(english.asset) || !hasLocalizedAsset(chinese.asset)) throw new Error(`BILINGUAL_ASSET_CONTENT_MISSING:${assetId}`);
    const matched = links.filter((link) => link.sourceId === assetId && (!definition.targetId || link.targetId === definition.targetId) && definition.codes.includes(String(link.relationType).toUpperCase()));
    if (!matched.length && assetId !== "api-specforge-web-console") throw new Error(`V6_TYPED_EVIDENCE_MISSING:${assetId}`);
    if (assetId === "api-specforge-web-console" && matched.length < 2) throw new Error("V6_TYPED_EVIDENCE_MISSING:api-specforge-web-console");
    const relationshipCodes = unique(matched.map((link) => String(link.relationType).toUpperCase()));
    if (definition.codes.some((code) => !relationshipCodes.includes(code))) throw new Error(`V6_TYPED_EVIDENCE_MISSING:${assetId}`);
    result.push({ assetType: definition.assetType, assetId, relationshipCodes, relationshipIdentities: matched.map((link) => `relationship:${String(link.id)}`), evidenceRefs: unique([assetId, ...matched.flatMap((link) => [String(link.id ?? ""), `relationship:${String(link.id ?? "")}`])]) });
  }
  return result;
}

function hasLocalizedAsset(value: unknown): boolean { const asset = record(value, "ASSET"); return typeof asset.name === "string" && asset.name.trim().length > 0 && typeof (asset.description ?? asset.summary) === "string" && String(asset.description ?? asset.summary).trim().length > 0; }
function toUnit(row: { id: string; unitIdentity: string; revision: number; layer: string; kind: string; parentUnitIdentity: string | null; canonicalName: string; canonicalDescription: string; localizedContent: unknown; aliases: unknown; criticality: number; evidenceRefs: unknown }): Designer3aV5Snapshot["units"][number] { return { id: row.id, unitIdentity: row.unitIdentity, revision: row.revision, layer: row.layer as never, kind: row.kind as never, ...(row.parentUnitIdentity ? { parentUnitIdentity: row.parentUnitIdentity } : {}), canonicalName: row.canonicalName, canonicalDescription: row.canonicalDescription, localizedContent: row.localizedContent as never, aliases: strings(row.aliases), criticality: row.criticality, evidenceRefs: strings(row.evidenceRefs) }; }
function toMembership(row: { id: string; membershipIdentity: string; revision: number; unitIdentity: string; assertionId: string | null; assetType: string | null; assetId: string | null; semanticIdentity: string; confidence: number; evidenceRefs: unknown }): Designer3aV5Snapshot["memberships"][number] { return { id: row.id, membershipIdentity: row.membershipIdentity, revision: row.revision, unitIdentity: row.unitIdentity, ...(row.assertionId ? { assertionId: row.assertionId } : {}), ...(row.assetType ? { assetType: row.assetType } : {}), ...(row.assetId ? { assetId: row.assetId } : {}), semanticIdentity: row.semanticIdentity, confidence: row.confidence, evidenceRefs: strings(row.evidenceRefs) }; }
function toMapping(row: { id: string; mappingIdentity: string; revision: number; sourceUnitIdentity: string; targetUnitIdentity: string; mappingFamily: string; confidence: number; relationshipIdentities: unknown; evidenceRefs: unknown }): Designer3aV5Snapshot["mappings"][number] { return { id: row.id, mappingIdentity: row.mappingIdentity, revision: row.revision, sourceUnitIdentity: row.sourceUnitIdentity, targetUnitIdentity: row.targetUnitIdentity, mappingFamily: row.mappingFamily, confidence: row.confidence, relationshipIdentities: strings(row.relationshipIdentities), evidenceRefs: strings(row.evidenceRefs) }; }

void main().catch((error) => { console.error(error); process.exitCode = 1; });
