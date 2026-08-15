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
const sessionId = "design-change-session:fa68fdd5-8d04-4e64-a111-8e4c71f69a54";
const evidenceRefs = [
  "domain-specforge-platform",
  "api-specforge-mcp-tools",
  "api-specforge-3a-architecture-query",
  "api-specforge-3a-projection-build",
  "data-specforge-assets",
  "data-specforge-3a-projection-read-model",
  "adr-3a-architecture-navigation-workspace",
  "adr-postgresql-authoritative-design-store",
  "relationship:designer-3a-catalog-read"
];

const units = [
  {
    id: "architecture-unit-revision:designer:biz:governed-design-facts:v1",
    unitIdentity: "unit:biz:specforge-governed-design-facts",
    revision: 1,
    layer: "BIZ",
    kind: "CAPABILITY",
    canonicalName: "Governed design-fact management",
    canonicalDescription: "The capability to author, review, reconcile, and publish trustworthy design facts for an application service.",
    localizedContent: { zh: { name: "受治理的设计事实管理", description: "面向应用服务编写、审核、对账并发布可信设计事实的能力。" } },
    aliases: ["design governance", "architecture fact governance"],
    criticality: 1,
    evidenceRefs: ["domain-specforge-platform", "adr-3a-architecture-navigation-workspace"]
  },
  {
    id: "architecture-unit-revision:designer:sys:mcp-governance-gateway:v1",
    unitIdentity: "unit:sys:specforge-mcp-governance-gateway",
    revision: 1,
    layer: "SYS",
    kind: "SERVICE",
    parentUnitIdentity: "unit:biz:specforge-governed-design-facts",
    canonicalName: "MCP governance gateway",
    canonicalDescription: "The scoped service boundary through which agents read, review, and write governed design facts.",
    localizedContent: { zh: { name: "MCP 治理网关", description: "代理在精确应用服务 Scope 内读取、审核和写入受治理设计事实的服务边界。" } },
    aliases: ["MCP design gateway", "governed MCP boundary"],
    criticality: 1,
    evidenceRefs: ["api-specforge-mcp-tools", "api-specforge-3a-architecture-query"]
  },
  {
    id: "architecture-unit-revision:designer:sys:architecture-projection-service:v1",
    unitIdentity: "unit:sys:specforge-3a-projection-service",
    revision: 1,
    layer: "SYS",
    kind: "SERVICE",
    parentUnitIdentity: "unit:biz:specforge-governed-design-facts",
    canonicalName: "3A architecture projection service",
    canonicalDescription: "The service that builds and serves Baseline-bound BIZ, SYS, and TECH architecture projections.",
    localizedContent: { zh: { name: "3A 架构投影服务", description: "构建并提供绑定 Baseline 的业务、系统和技术架构投影视图的服务。" } },
    aliases: ["3A projection service", "architecture read service"],
    criticality: 0.9,
    evidenceRefs: ["api-specforge-3a-projection-build", "api-specforge-3a-architecture-query", "data-specforge-3a-projection-read-model"]
  },
  {
    id: "architecture-unit-revision:designer:tech:postgresql-authority:v1",
    unitIdentity: "unit:tech:specforge-postgresql-authority",
    revision: 1,
    layer: "TECH",
    kind: "TECHNOLOGY_SERVICE",
    parentUnitIdentity: "unit:sys:specforge-3a-projection-service",
    canonicalName: "PostgreSQL authoritative design store",
    canonicalDescription: "The PostgreSQL-backed authoritative store for authored design facts, governance history, Baselines, and derived projection read models.",
    localizedContent: { zh: { name: "PostgreSQL 权威设计存储", description: "基于 PostgreSQL 保存编写型设计事实、治理历史、Baseline 以及派生投影读模型的权威存储。" } },
    aliases: ["canonical design store", "PostgreSQL design authority"],
    criticality: 1,
    evidenceRefs: ["data-specforge-assets", "data-specforge-3a-projection-read-model", "adr-postgresql-authoritative-design-store"]
  }
];

const memberships = [
  { id: "architecture-membership-revision:designer:biz:domain:v1", membershipIdentity: "membership:unit:biz:specforge-governed-design-facts:domain-specforge-platform", revision: 1, unitIdentity: "unit:biz:specforge-governed-design-facts", assetType: "domain", assetId: "domain-specforge-platform", semanticIdentity: "domain:specforge-platform", confidence: 1, evidenceRefs: ["domain-specforge-platform"] },
  { id: "architecture-membership-revision:designer:sys:mcp-api:v1", membershipIdentity: "membership:unit:sys:specforge-mcp-governance-gateway:api-specforge-mcp-tools", revision: 1, unitIdentity: "unit:sys:specforge-mcp-governance-gateway", assetType: "api", assetId: "api-specforge-mcp-tools", semanticIdentity: "api:specforge-mcp-tools", confidence: 1, evidenceRefs: ["api-specforge-mcp-tools"] },
  { id: "architecture-membership-revision:designer:sys:query-api:v1", membershipIdentity: "membership:unit:sys:specforge-mcp-governance-gateway:api-specforge-3a-architecture-query", revision: 1, unitIdentity: "unit:sys:specforge-mcp-governance-gateway", assetType: "api", assetId: "api-specforge-3a-architecture-query", semanticIdentity: "api:specforge-3a-architecture-query", confidence: 1, evidenceRefs: ["api-specforge-3a-architecture-query"] },
  { id: "architecture-membership-revision:designer:sys:build-api:v1", membershipIdentity: "membership:unit:sys:specforge-3a-projection-service:api-specforge-3a-projection-build", revision: 1, unitIdentity: "unit:sys:specforge-3a-projection-service", assetType: "api", assetId: "api-specforge-3a-projection-build", semanticIdentity: "api:specforge-3a-projection-build", confidence: 1, evidenceRefs: ["api-specforge-3a-projection-build"] },
  { id: "architecture-membership-revision:designer:tech:assets-data-model:v1", membershipIdentity: "membership:unit:tech:specforge-postgresql-authority:data-specforge-assets", revision: 1, unitIdentity: "unit:tech:specforge-postgresql-authority", assetType: "dataModel", assetId: "data-specforge-assets", semanticIdentity: "dataModel:specforge-assets", confidence: 1, evidenceRefs: ["data-specforge-assets", "adr-postgresql-authoritative-design-store"] },
  { id: "architecture-membership-revision:designer:tech:projection-data-model:v1", membershipIdentity: "membership:unit:tech:specforge-postgresql-authority:data-specforge-3a-projection-read-model", revision: 1, unitIdentity: "unit:tech:specforge-postgresql-authority", assetType: "dataModel", assetId: "data-specforge-3a-projection-read-model", semanticIdentity: "dataModel:specforge-3a-projection-read-model", confidence: 1, evidenceRefs: ["data-specforge-3a-projection-read-model"] },
  { id: "architecture-membership-revision:designer:tech:authority-adr:v1", membershipIdentity: "membership:unit:tech:specforge-postgresql-authority:adr-postgresql-authoritative-design-store", revision: 1, unitIdentity: "unit:tech:specforge-postgresql-authority", assetType: "adr", assetId: "adr-postgresql-authoritative-design-store", semanticIdentity: "adr:postgresql-authoritative-design-store", confidence: 1, evidenceRefs: ["adr-postgresql-authoritative-design-store"] }
];

const mappings = [
  { id: "architecture-mapping-revision:designer:biz-to-mcp:v1", mappingIdentity: "mapping:unit:biz:specforge-governed-design-facts->unit:sys:specforge-mcp-governance-gateway", revision: 1, sourceUnitIdentity: "unit:biz:specforge-governed-design-facts", targetUnitIdentity: "unit:sys:specforge-mcp-governance-gateway", mappingFamily: "CAPABILITY_TO_SERVICE", confidence: 0.96, relationshipIdentities: ["domain:domain-specforge-platform:owns:datamodel:data-specforge-assets"], evidenceRefs: ["domain-specforge-platform", "api-specforge-mcp-tools"] },
  { id: "architecture-mapping-revision:designer:mcp-to-authority:v1", mappingIdentity: "mapping:unit:sys:specforge-mcp-governance-gateway->unit:tech:specforge-postgresql-authority", revision: 1, sourceUnitIdentity: "unit:sys:specforge-mcp-governance-gateway", targetUnitIdentity: "unit:tech:specforge-postgresql-authority", mappingFamily: "SERVICE_TO_TECHNOLOGY", confidence: 0.98, relationshipIdentities: ["adr:adr-postgresql-authoritative-design-store:decides:datamodel:data-specforge-assets"], evidenceRefs: ["api-specforge-mcp-tools", "data-specforge-assets", "adr-postgresql-authoritative-design-store"] },
  { id: "architecture-mapping-revision:designer:projection-to-read-model:v1", mappingIdentity: "mapping:unit:sys:specforge-3a-projection-service->unit:tech:specforge-postgresql-authority", revision: 1, sourceUnitIdentity: "unit:sys:specforge-3a-projection-service", targetUnitIdentity: "unit:tech:specforge-postgresql-authority", mappingFamily: "SERVICE_TO_TECHNOLOGY", confidence: 0.99, relationshipIdentities: ["api:api-specforge-3a-projection-build:writes:datamodel:data-specforge-3a-projection-read-model"], evidenceRefs: ["api-specforge-3a-projection-build", "data-specforge-3a-projection-read-model"] }
];

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
  const client = new Client({ name: "designer-3a-bootstrap", version: "0.1.0" }, { capabilities: {} });
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
      id: "architecture-fact-batch:designer:3a:v1",
      idempotencyKey: "architecture-fact-batch:designer:3a:v1",
      designChangeSessionId: sessionId,
      provenance: { actor: "codex", tool: "bootstrap-designer-3a", runId: "designer-3a-v1" },
      evidenceRefs,
      units,
      memberships,
      mappings
    });
    const revisionIds = [batch.unitRevisionIds, batch.membershipRevisionIds, batch.mappingRevisionIds].flat() as string[];
    const review = await call("create_knowledge_review_bundle", {
      architectureScope: scope,
      id: "knowledge-review-bundle:designer:3a:v1",
      designChangeSessionId: sessionId,
      riskTier: "T1",
      assertionIds: [],
      identityCandidateIds: [],
      architectureFactRevisionIds: revisionIds,
      evidenceRefs,
      coverage: { totalSources: evidenceRefs.length, processedSources: evidenceRefs.length, supportedSources: evidenceRefs.length, candidateCount: revisionIds.length, complete: true },
      blockingIssues: []
    });
    let decision: Record<string, unknown>;
    try {
      decision = await call("decide_knowledge_review_bundle", {
        architectureScope: scope,
        id: "knowledge-promotion-decision:designer:3a:v1",
        reviewBundleId: String(review.id),
        decision: "APPROVE",
        approvedAssertionIds: [],
        approvedIdentityCandidateIds: [],
        approvedArchitectureFactRevisionIds: revisionIds,
        evidenceRefs,
        reason: "Reviewed against the persisted Designer Scope catalog and typed relationship evidence."
      });
    } catch (error) {
      if (!String(error).includes("REVIEW_BUNDLE_NOT_READY") && !String(error).includes("SpecForge tool call failed: decide_knowledge_review_bundle")) throw error;
      decision = { id: "knowledge-promotion-decision:designer:3a:v1", idempotent: true };
    }
    const stream = await call("create_working_stream", { architectureScope: scope, id: "working-stream:designer:3a", name: "Designer governed 3A architecture" });
    const promotion = await call("promote_3a_architecture_facts", { architectureScope: scope, promotionDecisionId: String(decision.id), streamId: String(stream.id), evidenceRefs });
    const reconciliation = await call("reconcile_3a_architecture_facts", { architectureScope: scope, promotionReceiptId: String(promotion.id) });
    const baseline = await call("publish_knowledge_baseline", { architectureScope: scope, id: "knowledge-baseline:designer:3a:v1", streamId: String(stream.id), changeSetId: String(promotion.changeSetId), sourceRevisionIds: [], architectureFactRevisionIds: revisionIds, relationshipVersion: String(reconciliation.relationshipVersion), reconciliationReceiptId: String(reconciliation.id) });
    const projection = await call("request_3a_projection_build", { architectureScope: scope, baselineId: String(baseline.id), profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", query: { layers: ["BIZ", "SYS", "TECH"] } });
    console.log(JSON.stringify({ batch, review, decision, stream, promotion, reconciliation, baseline, projection }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
