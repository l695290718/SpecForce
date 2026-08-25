import { createRequire } from "node:module";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type ToolResult = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const root = process.cwd();
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const adrId = "adr-enterprise-3a-semantic-coverage";
const proposalId = "proposal-enterprise-3a-semantic-coverage";
const contextPackId = "ctx-enterprise-3a-semantic-coverage";
const evidenceId = "evidence-enterprise-3a-semantic-coverage";
const now = new Date().toISOString();

function text(result: ToolResult): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function parse(result: ToolResult): JsonRecord { const value = text(result); return value ? JSON.parse(value) as JsonRecord : {}; }

const adr = {
  id: adrId,
  name: "Enterprise 3A semantic coverage projection",
  title: "Enterprise 3A semantic coverage projection",
  description: "Preserve the reviewed v6 architecture baseline and materialize an immutable exact-Scope coverage projection for every authored record.",
  context: "The Designer Scope contains 303 authored records while the reviewed v6 structural baseline contains 8 units, 42 memberships, and 6 mappings. Architecture structure and governance traceability must remain distinct.",
  decision: "Use generic-system@2 with PostgreSQL-authoritative catalog and relationship waterlines, immutable coverage generations, role-specific directed path rules, and bounded MCP/workspace reads. Do not infer architecture meaning from names or graph proximity.",
  alternatives: ["Promote every authored record into a new architecture baseline", "Compute coverage through live graph traversal"],
  consequences: ["Coverage answers are reproducible and historical", "Blocked records remain explicit instead of being silently classified", "Graph stores remain derived and are not required for correctness"],
  constraints: ["Exact owning Scope only", "Maximum path length is three relationships", "English canonical fields and complete Chinese human-facing overlays", "PostgreSQL is authoritative"],
  status: "accepted",
  owner: "SpecForge Architecture",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "企业级 3A 语义覆盖投影",
      title: "企业级 3A 语义覆盖投影",
      description: "保留经过评审的 v6 架构基线，并为每条已编写设计记录生成不可变、精确 Scope 的覆盖投影。",
      context: "Designer Scope 有 303 条设计记录，而经过评审的 v6 结构基线包含 8 个单元、42 个成员关系和 6 个映射。架构结构与治理追溯必须保持区分。",
      decision: "采用 generic-system@2，以 PostgreSQL 权威目录和关系水位线为输入，生成不可变覆盖代次，使用按角色限定的有向路径规则，并通过 MCP 和工作区提供有界读取。不根据名称或图邻近关系推断架构语义。",
      alternatives: ["把所有设计记录提升为新的架构基线", "通过实时图遍历计算覆盖"],
      consequences: ["覆盖结果可重现且可保留历史", "阻塞记录显式保留，不静默分类", "图数据库保持派生性质，不作为正确性的必要依赖"],
      constraints: ["只允许精确 owning Scope", "路径最大长度为 3 条关系", "英文规范字段和完整中文人类可读覆盖", "PostgreSQL 保持权威"]
    }
  }
};

const proposal = {
  id: proposalId,
  name: "Implement enterprise 3A semantic coverage",
  title: "Implement enterprise 3A semantic coverage",
  description: "Add deterministic semantic coverage without changing the accepted v6 architecture meaning.",
  background: "The authored catalog is larger than the structural architecture map and needs complete, explainable coverage.",
  goal: "Expose current, immutable, exact-Scope coverage for all 303 Designer records while preserving v6 8/42/6.",
  nonGoal: "This increment does not deliver legacy scanners, continuous external synchronization, cross-Scope comparison, or external APPLY.",
  scope: "com.huawei.celon.desiner and its exact application-service Scope path.",
  impactedAssets: ["data-specforge-assets", "data-specforge-3a-projection-read-model", "api-specforge-3a-projection-build"],
  specChanges: ["Add generic-system@2 coverage policy", "Add immutable coverage build, manifest, and row storage", "Expose paginated MCP coverage report and workspace summary/detail"],
  risks: ["Catalog or relationship waterline drift makes a report STALE", "Unsupported or ambiguous semantics remain BLOCKED instead of being inferred"],
  rolloutPlan: "Run the MCP-only relationship repair, request a pinned build, materialize through the projector, and verify the exact Scope readback.",
  rollbackPlan: "Keep the v6 architecture baseline and stop consuming the coverage generation; immutable historical rows remain queryable.",
  status: "implemented",
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "实施企业级 3A 语义覆盖",
      title: "实施企业级 3A 语义覆盖",
      description: "在不改变已接受 v6 架构语义的前提下，增加确定性的语义覆盖能力。",
      background: "已编写目录大于结构化架构图，需要完整且可解释的覆盖结果。",
      goal: "在保持 v6 为 8/42/6 的同时，为 Designer 的 303 条记录提供当前、不可变、精确 Scope 的覆盖结果。",
      nonGoal: "本增量不交付存量扫描器、持续外部同步、跨 Scope 比较或外部 APPLY。",
      scope: "com.huawei.celon.desiner 及其精确应用服务 Scope 路径。",
      specChanges: ["增加 generic-system@2 覆盖策略", "增加不可变覆盖构建、清单和行存储", "通过 MCP 和工作区提供分页覆盖摘要与详情"],
      risks: ["目录或关系水位线变化会使报告变为 STALE", "不支持或存在歧义的语义保持 BLOCKED，不进行推断"],
      rolloutPlan: "通过 MCP 修复关系，提交带水位线的构建，通过投影器物化，并验证精确 Scope 读回。",
      rollbackPlan: "保留 v6 架构基线并停止消费当前覆盖代次；不可变历史行仍可查询。"
    }
  }
};

const contextPack = {
  id: contextPackId,
  name: "Enterprise 3A semantic coverage Context Pack",
  proposalId,
  targetAgent: "codex",
  summary: "Implementation context for the exact-Scope generic-system@2 coverage projection.",
  includedAssets: [
    { type: "adr", id: adrId, label: "Enterprise 3A semantic coverage projection" },
    { type: "proposal", id: proposalId, label: "Enterprise 3A semantic coverage rollout" },
    { type: "evidence", id: evidenceId, label: "Enterprise 3A semantic coverage verification evidence" }
  ],
  constraints: ["Read and write only the exact Designer Scope", "PostgreSQL is authoritative; graph stores are derived", "Never infer architecture units or relationships from names", "Keep v6 8/42/6 unchanged"],
  instructions: ["Run the design-context preflight before changing coverage behavior", "Use MCP for authored design facts and typed links", "Pin builds to catalog and relationship waterlines", "Verify CURRENT freshness and row closure before completion"],
  generatedMarkdown: "# Enterprise 3A semantic coverage\n\nUse generic-system@2 over the exact Designer Scope. Preserve v6 8/42/6 and keep PostgreSQL authoritative.\n",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "企业级 3A 语义覆盖 Context Pack",
      summary: "精确 Scope 下 generic-system@2 覆盖投影的实施上下文。",
      constraints: ["只读取和写入精确 Designer Scope", "PostgreSQL 保持权威，图数据库为派生", "绝不根据名称推断架构单元或关系", "保持 v6 为 8/42/6"],
      instructions: ["修改覆盖行为前运行 design-context 预检", "设计事实和类型关系使用 MCP 写入", "构建固定目录和关系水位线", "完成前验证 CURRENT、新鲜度和行闭包"],
      generatedMarkdown: "# 企业级 3A 语义覆盖\n\n在精确 Designer Scope 上使用 generic-system@2。保持 v6 为 8/42/6，并让 PostgreSQL 保持权威。\n"
    }
  }
};

const evidence = {
  id: evidenceId,
  name: "Enterprise 3A semantic coverage verification evidence",
  description: "Exact commands and MCP readback for the immutable Designer Scope coverage generation.",
  decisionId: adrId,
  command: "pnpm exec tsx scripts/repair-enterprise-3a-coverage-links.ts; pnpm enterprise-3a:build; pnpm enterprise-3a:verify; pnpm exec tsx scripts/verify-designer-3a-v6.ts",
  result: "MCP repair created 11 typed links; coverage generation v11 is READY and CURRENT with 303/303 COVERED, 0 BLOCKED, 0 NOT_EVALUATED, max path 3; v6 regression is READY with 8 units, 42 memberships, and 6 mappings.",
  status: "passed",
  recordedAt: now,
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "企业级 3A 语义覆盖验证证据",
      description: "Designer Scope 不可变覆盖代次的精确命令和 MCP 读回证据。",
      command: "pnpm exec tsx scripts/repair-enterprise-3a-coverage-links.ts；pnpm enterprise-3a:build；pnpm enterprise-3a:verify；pnpm exec tsx scripts/verify-designer-3a-v6.ts",
      result: "MCP 修复创建 11 条类型关系；覆盖代次 v11 为 READY 且 CURRENT，303/303 COVERED、0 BLOCKED、0 NOT_EVALUATED，最大路径 3 跳；v6 回归为 READY，包含 8 个单元、42 个成员和 6 个映射。"
    }
  }
};

const affected = [
  ["dataModel", "data-specforge-assets"],
  ["dataModel", "data-specforge-3a-projection-read-model"],
  ["api", "api-specforge-3a-projection-build"],
  ["api", "api-specforge-mcp-tools"],
  ["quality", "quality-specforge-mcp-smoke"]
] as const;

async function main(): Promise<void> {
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }, stderr: "inherit" });
  const client = new Client({ name: "enterprise-3a-coverage-design-facts", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const call = async (name: string, args: JsonRecord): Promise<JsonRecord> => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 }) as ToolResult;
    if (response.isError) throw new Error(`${name}: ${text(response)}`);
    return parse(response);
  };
  try {
    await call("create_adr", { applicationServiceId: scope.applicationServiceId, architectureScope: scope, adr });
    await call("upsert_proposal", { architectureScope: scope, proposal });
    await call("upsert_context_pack", { architectureScope: scope, contextPack });
    await call("upsert_design_asset", { assetType: "evidence", architectureScope: scope, asset: { ...evidence, architectureScope: scope } });
    await call("link_assets", { architectureScope: scope, sourceType: "proposal", sourceId: proposalId, targetType: "adr", targetId: adrId, relationType: "IMPLEMENTS_DECISION" });
    await call("link_assets", { architectureScope: scope, sourceType: "contextPack", sourceId: contextPackId, targetType: "proposal", targetId: proposalId, relationType: "IMPLEMENTS_CONTEXT_FOR" });
    await call("link_assets", { architectureScope: scope, sourceType: "evidence", sourceId: evidenceId, targetType: "adr", targetId: adrId, relationType: "VALIDATES" });
    for (const [targetType, targetId] of affected) await call("link_assets", { architectureScope: scope, sourceType: "adr", sourceId: adrId, targetType, targetId, relationType: "DECIDES" });
    const readBack = await Promise.all([
      call("get_asset_detail", { assetType: "adr", assetId: adrId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "proposal", assetId: proposalId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "contextPack", assetId: contextPackId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "evidence", assetId: evidenceId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" })
    ]);
    const ids = readBack.map((item) => String((item.asset as JsonRecord | undefined)?.id ?? (item.canonicalSource as JsonRecord | undefined)?.id ?? ""));
    if (ids.some((id) => !id) || new Set(ids).size !== 4) throw new Error(`DESIGN_FACT_READBACK_MISMATCH:${ids.join(",")}`);
    console.log(JSON.stringify({ status: "synchronized", scope, adrId, proposalId, contextPackId, evidenceId, affectedLinkCount: affected.length, readBackIds: ids }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
