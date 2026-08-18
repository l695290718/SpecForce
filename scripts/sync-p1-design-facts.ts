import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Scope = { applicationServiceId: string; scopePath: string };
type ToolResult = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const root = process.cwd();
const designerScope: Scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const verificationScope: Scope = {
  applicationServiceId: "com.huawei.celon.desiner.graph-verification",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification"
};
const now = new Date().toISOString();

function localized(base: { name: string; description: string }, zh: { name: string; description: string; [key: string]: unknown }) {
  return { ...base, localizedContent: { zh } };
}

function textResult(result: ToolResult): string {
  return (result.content ?? []).map((item) => item.type === "text" ? item.text ?? "" : "").join("");
}

async function databaseUrl(): Promise<string | undefined> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = (await readFile(resolve(root, ".env"), "utf8")).split(/\r?\n/u).find((value) => value.startsWith("DATABASE_URL="));
    return line?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/gu, "");
  } catch {
    return undefined;
  }
}

async function connect(scope: Scope): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      SPECFORGE_MCP_SEED: "1",
      SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId,
      ...(await databaseUrl() ? { DATABASE_URL: await databaseUrl() } : {})
    },
    stderr: "inherit"
  });
  const client = new Client({ name: "specforge-p1-design-facts", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 }) as ToolResult;
  if (result.isError) throw new Error(`${name}: ${textResult(result)}`);
  const text = textResult(result);
  return text ? JSON.parse(text) : undefined;
}

async function syncScope(scope: Scope, assets: Array<{ type: string; asset: Record<string, unknown> }>, proposal: Record<string, unknown>, contextPack: Record<string, unknown>, links: Array<Record<string, unknown>>) {
  const { client, transport } = await connect(scope);
  try {
    for (const entry of assets) await call(client, "upsert_design_asset", { assetType: entry.type, asset: { ...entry.asset, architectureScope: scope }, architectureScope: scope });
    await call(client, "upsert_proposal", { proposal: { ...proposal, architectureScope: scope }, architectureScope: scope });
    await call(client, "upsert_context_pack", { contextPack: { ...contextPack, architectureScope: scope }, architectureScope: scope });
    for (const link of links) await call(client, "link_assets", { ...link, architectureScope: scope });
    const readBack = [];
    for (const entry of assets) readBack.push(await call(client, "get_asset_detail", { assetType: entry.type, assetId: entry.asset.id, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }));
    readBack.push(await call(client, "get_asset_detail", { assetType: "proposal", assetId: proposal.id, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }));
    readBack.push(await call(client, "get_asset_detail", { assetType: "contextPack", assetId: contextPack.id, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }));
    return { scope, assetCount: assets.length, linkCount: links.length, readBackCount: readBack.length, readBackIds: readBack.map((item) => (item as { asset?: { id?: string }; canonicalSource?: { id?: string } }).asset?.id ?? (item as { canonicalSource?: { id?: string } }).canonicalSource?.id) };
  } finally {
    await client.close();
    await transport.close();
  }
}

function adr(id: string, title: string, decision: string, context: string, alternatives: string[], consequences: string[], constraints: string[], zh: Record<string, unknown>) {
  return localized({ id, name: title, description: context, title, status: "accepted", context, decision, alternatives, consequences, constraints, relatedAssets: [], owner: "SpecForge Architecture", createdAt: now, updatedAt: now }, { name: String(zh.name), description: String(zh.description), title: String(zh.title), context: String(zh.context), decision: String(zh.decision), alternatives: zh.alternatives as string[], consequences: zh.consequences as string[], constraints: zh.constraints as string[] });
}

function proposal(id: string, title: string, background: string, goal: string, scope: string, specChanges: string[], risks: string[], zh: Record<string, unknown>) {
  return localized({ id, name: title, description: background, title, background, goal, nonGoal: "Enterprise-wide semantic coverage is not included in this increment.", scope, impactedAssets: [], specChanges, risks, rolloutPlan: "Publish the reviewed baseline, build the derived projection, and verify the exact Scope.", rollbackPlan: "Keep the previous readable baseline available and stop consuming the new projection.", status: "implemented", createdAt: now, updatedAt: now }, { name: String(zh.name), description: String(zh.description), title: String(zh.title), background: String(zh.background), goal: String(zh.goal), nonGoal: String(zh.nonGoal), scope: String(zh.scope), specChanges: zh.specChanges as string[], risks: zh.risks as string[], rolloutPlan: String(zh.rolloutPlan), rollbackPlan: String(zh.rollbackPlan) });
}

function contextPack(id: string, proposalId: string, name: string, summary: string, constraints: string[], instructions: string[], markdown: string, zh: Record<string, unknown>) {
  return { id, name, proposalId, targetAgent: "codex", summary, includedAssets: [], constraints, instructions, generatedMarkdown: markdown, createdAt: now, localizedContent: { zh: { name: String(zh.name), summary: String(zh.summary), constraints: zh.constraints as string[], instructions: zh.instructions as string[], generatedMarkdown: String(zh.generatedMarkdown) } } };
}

function evidence(id: string, decisionId: string, name: string, description: string, command: string, result: string, status: "passed" | "blocked", zh: Record<string, unknown>) {
  return localized({ id, name, description, decisionId, command, result, status, recordedAt: now, createdAt: now, updatedAt: now }, { name: String(zh.name), description: String(zh.description), command: String(zh.command), result: String(zh.result) });
}

async function main() {
  const v6AdrId = "adr-readable-3a-architecture-mapping-v6";
  const v6ProposalId = "proposal-readable-3a-architecture-mapping-v6";
  const v6ContextId = "ctx-readable-3a-architecture-mapping-v6";
  const v6EvidenceId = "evidence-designer-3a-v6-semantic-unit-expansion";
  const v6Adr = adr(v6AdrId, "3A semantic unit expansion v6", "Publish four evidenced semantic units and preserve only explicitly evidenced mappings.", "The readable 3A view needs service-level semantic units for the selected SpecForge capabilities.", ["Promote every asset by name", "Create a mapping for every same-layer call"], ["The selected architecture path is readable and traceable; enterprise-wide coverage remains deferred."], ["PostgreSQL is authoritative", "Graph output is derived", "English canonical fields and Chinese overlays are required"], { name: "3A 语义单元扩充 v6", description: "为选定的 SpecForge 能力补充可追溯的 3A 语义单元。", title: "3A 语义单元扩充 v6", context: "可读 3A 视图需要为选定能力提供服务级语义单元。", decision: "只发布有证据支持的单元和映射。", alternatives: ["按名称提升所有资产", "为同层调用创建映射"], consequences: ["选定架构路径可读且可追溯，企业级全量覆盖延期。"], constraints: ["PostgreSQL 权威", "图输出为派生", "英文规范字段与中文覆盖必需"] });
  const v6Proposal = proposal(v6ProposalId, "Implement Designer 3A semantic unit expansion v6", "The Designer Scope has a published v5 semantic baseline and needs a bounded next increment.", "Make four additional service boundaries queryable without inventing unsupported architecture mappings.", "The exact Designer Scope and four selected candidate sources.", ["Add four SYS units", "Publish baseline v6", "Build and verify the derived projection"], ["Incomplete enterprise coverage must remain visible as deferred", "A missing relationship must not be inferred from naming"], { name: "实施 Designer 3A 语义单元扩充 v6", background: "Designer Scope 已有 v5 语义基线，需要一个有边界的增量。", goal: "增加 4 个可查询服务边界，不臆造无证据的架构映射。", nonGoal: "不包含企业级全量覆盖。", scope: "精确 Designer Scope 和 4 个候选来源。", specChanges: ["增加 4 个 SYS 单元", "发布 v6 基线", "构建并验证派生投影"], risks: ["不完整覆盖必须保持延期可见", "不能从命名推断缺失关系"], rolloutPlan: "发布审查后的基线并验证精确 Scope。", rollbackPlan: "保留旧基线并停止消费新投影。" });
  const v6Context = contextPack(v6ContextId, v6ProposalId, "Designer 3A v6 Agent Context Pack", "Implementation context for the bounded v6 semantic-unit slice.", ["Do not infer mappings from names", "Read the exact Designer Scope", "Treat PostgreSQL as authoritative"], ["Read the v6 ADR and evidence", "Verify baseline, projection, and regression counts", "Keep deferred enterprise coverage separate"], "# Designer 3A v6\n\nUse only evidenced semantic units and mappings.\n", { name: "Designer 3A v6 Agent Context Pack", summary: "有边界的 v6 语义单元切片实施上下文。", constraints: ["不要从名称推断映射", "读取精确 Designer Scope", "PostgreSQL 是权威"], instructions: ["读取 v6 ADR 和证据", "验证基线、投影和回归计数", "保持企业级延期覆盖独立"], generatedMarkdown: "# Designer 3A v6\n\n只使用有证据支持的语义单元和映射。\n" });
  const v6Evidence = evidence(v6EvidenceId, v6AdrId, "Designer 3A v6 verification evidence", "Exact commands and MCP publication results for the v6 semantic-unit expansion.", "pnpm exec tsx scripts/verify-designer-3a-v6.ts; pnpm exec tsx scripts/process-designer-3a-v6-projection.ts; pnpm exec tsx scripts/verify-designer-3a-v5.ts", "READY; v6 8 units/42 memberships/6 mappings, projection PUBLISHED, v5 regression READY.", "passed", { name: "Designer 3A v6 验证证据", description: "v6 语义单元扩充的精确命令和 MCP 发布结果。", command: "pnpm exec tsx scripts/verify-designer-3a-v6.ts；pnpm exec tsx scripts/process-designer-3a-v6-projection.ts；pnpm exec tsx scripts/verify-designer-3a-v5.ts", result: "READY；v6 为 8 个单元/42 个成员/6 个映射，投影 PUBLISHED，v5 回归 READY。" });
  const v6Links = [
    { sourceType: "proposal", sourceId: v6ProposalId, targetType: "adr", targetId: v6AdrId, relationType: "IMPLEMENTS_DECISION" },
    { sourceType: "contextPack", sourceId: v6ContextId, targetType: "proposal", targetId: v6ProposalId, relationType: "IMPLEMENTS_CONTEXT_FOR" },
    { sourceType: "evidence", sourceId: v6EvidenceId, targetType: "adr", targetId: v6AdrId, relationType: "VALIDATES" }
  ];

  const fixtureAdrId = "adr-graph-verification-fixture-isolation";
  const fixtureProposalId = "proposal-graph-verification-fixture-isolation";
  const fixtureContextId = "ctx-graph-verification-fixture-isolation";
  const fixtureEvidenceId = "evidence-graph-verification-fixture-isolation";
  const fixtureAdr = adr(fixtureAdrId, "Isolate graph verification fixtures", "Keep verification fixtures in a dedicated verification Scope and run the live gate inside a unique Compose project with MCP cleanup.", "Product Scope data must never be polluted by graph verification records, and the live gate must not manage production containers.", ["Reuse the product Scope", "Delete fixtures directly from a graph store", "Manage the full Compose project without a service allow-list"], ["Verification is repeatable and product reads remain isolated; Docker Hub or registry availability can still block the live run."], ["Exact verification Scope", "MCP-only deletion", "PostgreSQL authority", "Project-scoped six-service lifecycle"], { name: "隔离图验证夹具", description: "将验证夹具放入独立 Scope，并在独立 Compose 项目中通过 MCP 清理。", title: "隔离图验证夹具", context: "产品 Scope 不能被图验证记录污染，实时门禁也不能管理生产容器。", decision: "使用独立验证 Scope、唯一 Compose 项目和仅限 6 个图服务的生命周期，并只通过 MCP 删除。", alternatives: ["复用产品 Scope", "直接从图数据库删除夹具", "不限制服务地管理整个 Compose 项目"], consequences: ["验证可重复且产品读取保持隔离；Docker Hub 或镜像代理可达性仍可能阻塞实时运行。"], constraints: ["精确验证 Scope", "只能通过 MCP 删除", "PostgreSQL 权威", "仅管理 6 个图验证服务"] });
  const fixtureProposal = proposal(fixtureProposalId, "Implement graph verification fixture isolation", "The live graph checker previously used product data and could leave verification records behind.", "Make fixture setup bounded by run ID, isolated by Scope, and recoverable through MCP cleanup while managing only an isolated graph Compose project.", "The verification Scope, historical fixture cleanup path, and managed local live gate.", ["Register verification-only Scope", "Add fingerprint-protected cleanup", "Add fail-closed live configuration", "Add project-scoped graph lifecycle and host/container database separation"], ["Docker Hub or a registry mirror may be unavailable", "Historical IDs must not be deleted without fingerprint validation", "A Compose failure must still execute MCP cleanup"], { name: "实施图验证夹具隔离", background: "实时图检查器此前可能使用产品数据并遗留验证记录。", goal: "让夹具按运行 ID 限定、按 Scope 隔离，并在独立图 Compose 项目中可通过 MCP 恢复清理。", nonGoal: "不改变生产 Nebula 部署或管理生产容器。", scope: "验证 Scope、历史夹具清理路径和托管本地图验证门禁。", specChanges: ["注册验证专用 Scope", "增加指纹保护清理", "增加失败关闭的实时配置", "增加项目级图服务生命周期和主机/容器数据库连接分离"], risks: ["Docker Hub 或镜像代理可能不可用", "没有指纹校验不得删除历史 ID", "Compose 失败也必须执行 MCP 清理"], rolloutPlan: "生成运行 ID，启动仅包含 6 个图服务的独立 Compose 项目，执行验证，并在外层 finally 中清理夹具和服务。", rollbackPlan: "使用恢复清理阶段删除显式运行批次，并只停止该运行的图服务。" });
  const fixtureContext = contextPack(fixtureContextId, fixtureProposalId, "Graph Verification Fixture Context Pack", "Exact Scope, project isolation, and cleanup rules for graph verification fixtures.", ["Never use product Scope data", "Delete only explicit run IDs", "Manage only the six graph verification services", "Keep host and container PostgreSQL URLs separate", "Record registry blocking as deferred"], ["Use the verification Scope", "Validate historical fingerprints", "Run MCP cleanup after every verification or startup failure", "Use the dedicated Compose project for restart and stop"], "# Graph verification fixtures\n\nUse the exact verification Scope, a dedicated six-service Compose project, and MCP cleanup.\n", { name: "图验证夹具 Context Pack", summary: "图验证夹具的精确 Scope、项目隔离与清理规则。", constraints: ["绝不使用产品 Scope 数据", "只删除显式运行 ID", "只管理 6 个图验证服务", "分离主机和容器 PostgreSQL 连接", "把镜像仓库阻塞记录为延期"], instructions: ["使用验证 Scope", "校验历史指纹", "每次验证或启动失败后执行 MCP 清理", "通过独立 Compose 项目重启和停止"], generatedMarkdown: "# 图验证夹具\n\n使用精确验证 Scope、独立的 6 服务 Compose 项目和 MCP 清理。\n" });
  const fixtureEvidence = evidence(fixtureEvidenceId, fixtureAdrId, "Graph verification fixture cleanup evidence", "Scope isolation, fingerprint cleanup, managed Compose lifecycle, and the externally blocked live image retrieval.", "powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly; pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts scripts/cleanup-graph-verification-fixtures.test.ts deploy/graph/live-projection-config.test.ts; powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -Live", "Configuration-only assertions and 10 focused tests passed; managed live startup reached Docker image retrieval but was blocked by Docker Hub failed-to-fetch-anonymous-token/unexpected-EOF; outer failure cleanup deleted 3 run-scoped assets with remainingLinks=0.", "blocked", { name: "图验证夹具清理证据", description: "Scope 隔离、指纹清理、托管 Compose 生命周期和外部镜像拉取阻塞的实时检查证据。", command: "powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly；pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts scripts/cleanup-graph-verification-fixtures.test.ts deploy/graph/live-projection-config.test.ts；powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -Live", result: "配置断言和 10 项聚焦测试通过；托管实时启动在 Docker 镜像拉取阶段被 failed-to-fetch-anonymous-token/unexpected-EOF 阻塞；外层失败清理删除 3 个运行资产，remainingLinks=0。" });
  const fixtureLinks = [
    { sourceType: "proposal", sourceId: fixtureProposalId, targetType: "adr", targetId: fixtureAdrId, relationType: "IMPLEMENTS_DECISION" },
    { sourceType: "contextPack", sourceId: fixtureContextId, targetType: "proposal", targetId: fixtureProposalId, relationType: "IMPLEMENTS_CONTEXT_FOR" },
    { sourceType: "evidence", sourceId: fixtureEvidenceId, targetType: "adr", targetId: fixtureAdrId, relationType: "VALIDATES" }
  ];

  const results = [
    await syncScope(designerScope, [{ type: "adr", asset: v6Adr }, { type: "evidence", asset: v6Evidence }], v6Proposal, v6Context, v6Links),
    await syncScope(verificationScope, [{ type: "adr", asset: fixtureAdr }, { type: "evidence", asset: fixtureEvidence }], fixtureProposal, fixtureContext, fixtureLinks)
  ];
  console.log(JSON.stringify({ status: "synchronized", results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
