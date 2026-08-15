import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const databaseUrl = readFileSync(resolve(root, ".env"), "utf8")
  .split(/\r?\n/u)
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.slice(13)
  .trim()
  .replaceAll('"', "");
const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const sessionId = "design-change-session:8caa26ac-7f8b-477a-bce8-a44ea0e3990c";
const evidenceRefs = [
  "evidence:designer-3a-coverage-expansion-v4",
  "adr-readable-3a-architecture-mapping",
  "domain-specforge-platform",
  "api-specforge-mcp-tools",
  "api-specforge-3a-architecture-query",
  "api-specforge-3a-projection-build",
  "api-specforge-knowledge-baseline-publication",
  "api-specforge-scanner-release-contract",
  "data-specforge-assets",
  "data-specforge-asset-graph",
  "data-specforge-3a-projection-read-model",
  "data-specforge-scan-session",
  "data-specforge-scan-batch",
  "data-specforge-source-observation-v2",
  "data-specforge-i18n",
  "rule-specforge-3a-projection-publication",
  "rule-specforge-knowledge-promotion-transaction",
  "rule-specforge-knowledge-risk-policy",
  "rule-specforge-core-service-reuse",
  "api-specforge-asset-upsert",
  "api-specforge-proposal-upsert",
  "api-specforge-context-pack-upsert",
  "data-specforge-audit",
  "data-specforge-mcp-registry",
  "data-specforge-ai-generation",
  "data-specforge-web-workspace",
  "event-specforge-governance-check-completed",
  "event-specforge-context-pack-generated",
  "rule-bilingual-asset-completeness"
];

const units = [
  { id: "architecture-unit-revision:designer:biz:governed-design-facts:v2", unitIdentity: "unit:biz:specforge-governed-design-facts", revision: 2, layer: "BIZ", kind: "CAPABILITY", canonicalName: "Governed design-fact management", canonicalDescription: "The capability to author, review, reconcile, and publish trustworthy design facts for an application service.", localizedContent: { zh: { name: "\u53d7\u6cbb\u7406\u7684\u8bbe\u8ba1\u4e8b\u5b9e\u7ba1\u7406", description: "\u9762\u5411\u5e94\u7528\u670d\u52a1\u7f16\u5199\u3001\u5ba1\u6838\u3001\u5bf9\u8d26\u5e76\u53d1\u5e03\u53ef\u4fe1\u8bbe\u8ba1\u4e8b\u5b9e\u7684\u80fd\u529b\u3002" } }, aliases: ["design governance", "architecture fact governance"], criticality: 1, evidenceRefs: ["domain-specforge-platform", "adr-readable-3a-architecture-mapping"] },
  { id: "architecture-unit-revision:designer:sys:mcp-governance-gateway:v2", unitIdentity: "unit:sys:specforge-mcp-governance-gateway", revision: 2, layer: "SYS", kind: "SERVICE", parentUnitIdentity: "unit:biz:specforge-governed-design-facts", canonicalName: "MCP governance gateway", canonicalDescription: "The scoped service boundary through which agents read, review, and write governed design facts.", localizedContent: { zh: { name: "MCP \u6cbb\u7406\u7f51\u5173", description: "\u4ee3\u7406\u5728\u7cbe\u786e\u5e94\u7528\u670d\u52a1 Scope \u5185\u8bfb\u53d6\u3001\u5ba1\u6838\u548c\u5199\u5165\u53d7\u6cbb\u7406\u8bbe\u8ba1\u4e8b\u5b9e\u7684\u670d\u52a1\u8fb9\u754c\u3002" } }, aliases: ["MCP design gateway", "governed MCP boundary"], criticality: 1, parentUnitIdentity: "unit:biz:specforge-governed-design-facts", evidenceRefs: ["api-specforge-mcp-tools", "api-specforge-3a-architecture-query"] },
  { id: "architecture-unit-revision:designer:sys:architecture-projection-service:v2", unitIdentity: "unit:sys:specforge-3a-projection-service", revision: 2, layer: "SYS", kind: "SERVICE", parentUnitIdentity: "unit:biz:specforge-governed-design-facts", canonicalName: "3A architecture projection service", canonicalDescription: "The service that builds and serves Baseline-bound BIZ, SYS, and TECH architecture projections.", localizedContent: { zh: { name: "3A \u67b6\u6784\u6295\u5f71\u670d\u52a1", description: "\u6784\u5efa\u5e76\u63d0\u4f9b\u7ed1\u5b9a Baseline \u7684\u4e1a\u52a1\u3001\u7cfb\u7edf\u548c\u6280\u672f\u67b6\u6784\u6295\u5f71\u89c6\u56fe\u7684\u670d\u52a1\u3002" } }, aliases: ["3A projection service", "architecture read service"], criticality: 0.9, evidenceRefs: ["api-specforge-3a-projection-build", "api-specforge-3a-architecture-query", "data-specforge-3a-projection-read-model"] },
  { id: "architecture-unit-revision:designer:tech:postgresql-authority:v2", unitIdentity: "unit:tech:specforge-postgresql-authority", revision: 2, layer: "TECH", kind: "TECHNOLOGY_SERVICE", parentUnitIdentity: "unit:sys:specforge-3a-projection-service", canonicalName: "PostgreSQL authoritative design store", canonicalDescription: "The PostgreSQL-backed authoritative store for authored design facts, governance history, Baselines, and derived projection read models.", localizedContent: { zh: { name: "PostgreSQL \u6743\u5a01\u8bbe\u8ba1\u5b58\u50a8", description: "\u57fa\u4e8e PostgreSQL \u4fdd\u5b58\u7f16\u5199\u578b\u8bbe\u8ba1\u4e8b\u5b9e\u3001\u6cbb\u7406\u5386\u53f2\u3001Baseline \u4ee5\u53ca\u6d3e\u751f\u6295\u5f71\u8bfb\u6a21\u578b\u7684\u6743\u5a01\u5b58\u50a8\u3002" } }, aliases: ["canonical design store", "PostgreSQL design authority"], criticality: 1, evidenceRefs: ["data-specforge-assets", "data-specforge-3a-projection-read-model", "adr-postgresql-authoritative-design-store"] }
];

const previousMemberships = [
  ["architecture-membership-revision:designer:biz:domain:v2", "membership:unit:biz:specforge-governed-design-facts:domain-specforge-platform", "unit:biz:specforge-governed-design-facts", "domain", "domain-specforge-platform", "domain:specforge-platform"],
  ["architecture-membership-revision:designer:sys:mcp-api:v2", "membership:unit:sys:specforge-mcp-governance-gateway:api-specforge-mcp-tools", "unit:sys:specforge-mcp-governance-gateway", "api", "api-specforge-mcp-tools", "api:api-specforge-mcp-tools"],
  ["architecture-membership-revision:designer:sys:query-api:v3", "membership:unit:sys:specforge-mcp-governance-gateway:api-specforge-3a-architecture-query", "unit:sys:specforge-mcp-governance-gateway", "api", "api-specforge-3a-architecture-query", "api:api-specforge-3a-architecture-query"],
  ["architecture-membership-revision:designer:sys:build-api:v3", "membership:unit:sys:specforge-3a-projection-service:api-specforge-3a-projection-build", "unit:sys:specforge-3a-projection-service", "api", "api-specforge-3a-projection-build", "api:api-specforge-3a-projection-build"],
  ["architecture-membership-revision:designer:tech:assets-data-model:v2", "membership:unit:tech:specforge-postgresql-authority:data-specforge-assets", "unit:tech:specforge-postgresql-authority", "dataModel", "data-specforge-assets", "dataModel:specforge-assets"],
  ["architecture-membership-revision:designer:tech:projection-data-model:v2", "membership:unit:tech:specforge-postgresql-authority:data-specforge-3a-projection-read-model", "unit:tech:specforge-postgresql-authority", "dataModel", "data-specforge-3a-projection-read-model", "dataModel:specforge-3a-projection-read-model"],
  ["architecture-membership-revision:designer:tech:authority-adr:v2", "membership:unit:tech:specforge-postgresql-authority:adr-postgresql-authoritative-design-store", "unit:tech:specforge-postgresql-authority", "adr", "adr-postgresql-authoritative-design-store", "adr:postgresql-authoritative-design-store"]
].map(([id, membershipIdentity, unitIdentity, assetType, assetId, semanticIdentity]) => ({ id, membershipIdentity, revision: String(id).endsWith(":v3") ? 3 : 2, unitIdentity, assetType, assetId, semanticIdentity, confidence: 1, evidenceRefs: ["evidence:designer-3a-coverage-expansion", String(assetId)] }));

const previousMappings = [
  { id: "architecture-mapping-revision:designer:biz-to-mcp:v2", mappingIdentity: "mapping:unit:biz:specforge-governed-design-facts->unit:sys:specforge-mcp-governance-gateway", revision: 2, sourceUnitIdentity: "unit:biz:specforge-governed-design-facts", targetUnitIdentity: "unit:sys:specforge-mcp-governance-gateway", mappingFamily: "CAPABILITY_TO_SERVICE", confidence: 0.96, relationshipIdentities: ["domain:domain-specforge-platform:owns:datamodel:data-specforge-assets"], evidenceRefs: ["evidence:designer-3a-coverage-expansion", "domain-specforge-platform", "api-specforge-mcp-tools"] },
  { id: "architecture-mapping-revision:designer:mcp-to-authority:v2", mappingIdentity: "mapping:unit:sys:specforge-mcp-governance-gateway->unit:tech:specforge-postgresql-authority", revision: 2, sourceUnitIdentity: "unit:sys:specforge-mcp-governance-gateway", targetUnitIdentity: "unit:tech:specforge-postgresql-authority", mappingFamily: "SERVICE_TO_TECHNOLOGY", confidence: 0.98, relationshipIdentities: ["adr:adr-postgresql-authoritative-design-store:decides:datamodel:data-specforge-assets"], evidenceRefs: ["evidence:designer-3a-coverage-expansion", "api-specforge-mcp-tools", "data-specforge-assets", "adr-postgresql-authoritative-design-store"] },
  { id: "architecture-mapping-revision:designer:projection-to-read-model:v2", mappingIdentity: "mapping:unit:sys:specforge-3a-projection-service->unit:tech:specforge-postgresql-authority", revision: 2, sourceUnitIdentity: "unit:sys:specforge-3a-projection-service", targetUnitIdentity: "unit:tech:specforge-postgresql-authority", mappingFamily: "SERVICE_TO_TECHNOLOGY", confidence: 0.99, relationshipIdentities: ["api:api-specforge-3a-projection-build:writes:datamodel:data-specforge-3a-projection-read-model"], evidenceRefs: ["evidence:designer-3a-coverage-expansion", "api-specforge-3a-projection-build", "data-specforge-3a-projection-read-model"] }
];

const memberships = [
  ["sys", "api-specforge-knowledge-baseline-publication", "api", "api-specforge-knowledge-baseline-publication", "The MCP gateway accepts the governed Baseline publication contract."],
  ["sys", "api-specforge-scanner-release-contract", "api", "api-specforge-scanner-release-contract", "The MCP gateway accepts bounded scanner release evidence."],
  ["sys", "rule-specforge-knowledge-promotion-transaction", "businessRule", "rule-specforge-knowledge-promotion-transaction", "Promotion transaction policy governs the MCP gateway boundary."],
  ["sys", "rule-specforge-knowledge-risk-policy", "businessRule", "rule-specforge-knowledge-risk-policy", "Knowledge risk policy governs the MCP review boundary."],
  ["sys", "rule-specforge-core-service-reuse", "businessRule", "rule-specforge-core-service-reuse", "Core service reuse policy governs the MCP gateway boundary."],
  ["tech", "data-specforge-asset-graph", "dataModel", "data-specforge-asset-graph", "The authoritative PostgreSQL design store records the derived asset-graph source model."],
  ["tech", "data-specforge-scan-session", "dataModel", "data-specforge-scan-session", "The authoritative PostgreSQL design store records scan-session governance state."],
  ["tech", "data-specforge-scan-batch", "dataModel", "data-specforge-scan-batch", "The authoritative PostgreSQL design store records resumable scan batches."],
  ["tech", "data-specforge-source-observation-v2", "dataModel", "data-specforge-source-observation-v2", "The authoritative PostgreSQL design store records source observations."],
  ["tech", "data-specforge-i18n", "dataModel", "data-specforge-i18n", "The authoritative PostgreSQL design store records bilingual design-content overlays."],
  ["tech", "rule-specforge-3a-projection-publication", "businessRule", "rule-specforge-3a-projection-publication", "Projection publication policy governs the derived 3A read model."]
].map(([layer, key, assetType, assetId, description], index) => {
  const unitIdentity = layer === "sys" ? (key === "api-specforge-3a-projection-build" || key === "api-specforge-3a-architecture-query" ? "unit:sys:specforge-3a-projection-service" : "unit:sys:specforge-mcp-governance-gateway") : "unit:tech:specforge-postgresql-authority";
  return {
    id: `architecture-membership-revision:designer:coverage:${key}:v3`,
    membershipIdentity: `membership:${unitIdentity}:${assetId}`,
    revision: 3,
    unitIdentity,
    assetType,
    assetId,
    semanticIdentity: `${assetType}:${assetId}`,
    confidence: 1,
    evidenceRefs: ["evidence:designer-3a-coverage-expansion", assetId],
    description,
    index
  };
});

const nextUnits = units.map((unit) => ({ ...unit, id: unit.id.replace(":v2", ":v3"), revision: 3 }));
const nextPreviousMemberships = previousMemberships.map((membership) => ({
  ...membership,
  id: membership.id.replace(/:v[23]$/u, ":v4"),
  revision: 4
}));
const nextMemberships = [
  ...memberships.map((membership) => ({ ...membership, id: membership.id.replace(":v3", ":v4"), revision: 4 })),
  ...[
    ["sys", "api-specforge-asset-upsert", "api", "api-specforge-asset-upsert", "The MCP gateway accepts the governed asset upsert contract."],
    ["sys", "api-specforge-proposal-upsert", "api", "api-specforge-proposal-upsert", "The MCP gateway accepts the governed Proposal upsert contract."],
    ["sys", "api-specforge-context-pack-upsert", "api", "api-specforge-context-pack-upsert", "The MCP gateway accepts the governed Context Pack upsert contract."],
    ["sys", "event-specforge-governance-check-completed", "event", "event-specforge-governance-check-completed", "The MCP gateway emits durable governance completion events."],
    ["sys", "event-specforge-context-pack-generated", "event", "event-specforge-context-pack-generated", "The MCP gateway tracks Context Pack generation events."],
    ["sys", "rule-bilingual-asset-completeness", "businessRule", "rule-bilingual-asset-completeness", "Bilingual completeness governs human-facing assets at the MCP boundary."],
    ["tech", "data-specforge-audit", "dataModel", "data-specforge-audit", "The authoritative PostgreSQL store records MCP audit history."],
    ["tech", "data-specforge-mcp-registry", "dataModel", "data-specforge-mcp-registry", "The authoritative PostgreSQL store records the MCP registry model."],
    ["tech", "data-specforge-ai-generation", "dataModel", "data-specforge-ai-generation", "The authoritative PostgreSQL store records AI generation requests and outputs."],
    ["tech", "data-specforge-web-workspace", "dataModel", "data-specforge-web-workspace", "The authoritative PostgreSQL store records Web workspace state."],
  ].map(([layer, key, assetType, assetId, description], index) => {
    const unitIdentity = layer === "sys" ? "unit:sys:specforge-mcp-governance-gateway" : "unit:tech:specforge-postgresql-authority";
    return { id: `architecture-membership-revision:designer:coverage:${key}:v4`, membershipIdentity: `membership:${unitIdentity}:${assetId}`, revision: 4, unitIdentity, assetType, assetId, semanticIdentity: `${assetType}:${assetId}`, confidence: 1, evidenceRefs: ["evidence:designer-3a-coverage-expansion-v4", assetId], description, index };
  })
];
const nextMappings = previousMappings.map((mapping) => ({ ...mapping, id: mapping.id.replace(":v2", ":v3"), revision: 3 }));

function text(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? "";
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId, DATABASE_URL: databaseUrl }
  });
  const client = new Client({ name: "designer-3a-coverage-expander", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const call = async (name: string, arguments_: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: arguments_ });
    const raw = text(response);
    if (response.isError) throw new Error(`${name}: ${raw}`);
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return { raw }; }
  };
  try {
    const batch = await call("submit_3a_architecture_fact_batch", {
      architectureScope: scope,
      id: "architecture-fact-batch:designer:3a:coverage:v4",
      idempotencyKey: "architecture-fact-batch:designer:3a:coverage:v4",
      designChangeSessionId: sessionId,
      provenance: { actor: "codex", tool: "expand-designer-3a-coverage", runId: "designer-3a-coverage-v4" },
      evidenceRefs,
      units: nextUnits,
      memberships: [...nextPreviousMemberships, ...nextMemberships.map(({ description: _description, index: _index, ...membership }) => membership)],
      mappings: nextMappings
    });
    const revisionIds = [batch.unitRevisionIds, batch.membershipRevisionIds, batch.mappingRevisionIds].flat() as string[];
    const review = await call("create_knowledge_review_bundle", {
      architectureScope: scope,
      id: "knowledge-review-bundle:designer:3a:coverage:v4",
      designChangeSessionId: sessionId,
      riskTier: "T1",
      assertionIds: [],
      identityCandidateIds: [],
      architectureFactRevisionIds: revisionIds,
      evidenceRefs,
      coverage: { totalSources: evidenceRefs.length, processedSources: evidenceRefs.length, supportedSources: evidenceRefs.length, candidateCount: revisionIds.length, complete: true },
      blockingIssues: []
    });
    const decision = await call("decide_knowledge_review_bundle", {
      architectureScope: scope,
      id: "knowledge-promotion-decision:designer:3a:coverage:v4",
      reviewBundleId: String(review.id),
      decision: "APPROVE",
      approvedAssertionIds: [],
      approvedIdentityCandidateIds: [],
      approvedArchitectureFactRevisionIds: revisionIds,
      evidenceRefs,
      reason: "Existing scoped catalog entries were mapped to already accepted architecture units; no new semantic unit or cross-layer mapping was inferred."
    });
    const stream = await call("create_working_stream", { architectureScope: scope, id: "working-stream:designer:3a", name: "Designer governed 3A architecture" });
    const promotion = await call("promote_3a_architecture_facts", { architectureScope: scope, promotionDecisionId: String(decision.id), streamId: String(stream.id), evidenceRefs });
    const reconciliation = await call("reconcile_3a_architecture_facts", { architectureScope: scope, promotionReceiptId: String(promotion.id) });
    const baseline = await call("publish_knowledge_baseline", { architectureScope: scope, id: "knowledge-baseline:designer:3a:v4", streamId: String(stream.id), changeSetId: String(promotion.changeSetId), sourceRevisionIds: [], architectureFactRevisionIds: revisionIds, relationshipVersion: String(reconciliation.relationshipVersion), reconciliationReceiptId: String(reconciliation.id) });
    const projection = await call("request_3a_projection_build", { architectureScope: scope, baselineId: String(baseline.id), profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", query: { layers: ["BIZ", "SYS", "TECH"] } });
    console.log(JSON.stringify({ batch, review, decision, stream, promotion, reconciliation, baseline, projection, membershipCount: nextPreviousMemberships.length + nextMemberships.length, unitCount: nextUnits.length, mappingCount: nextMappings.length }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
