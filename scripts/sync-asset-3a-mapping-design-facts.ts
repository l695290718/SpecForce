import { createRequire } from "node:module";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type ToolResult = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const root = process.cwd();
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const adrId = "adr-asset-to-3a-mapping-semantics";
const proposalId = "proposal-asset-to-3a-mapping-semantics";
const contextPackId = "context-pack-asset-to-3a-mapping-semantics";
const evidenceId = "evidence-asset-to-3a-mapping-semantics";
const now = new Date().toISOString();

function text(result: ToolResult): string { return result.content?.map((item) => item.type === "text" ? item.text ?? "" : "").join("") ?? ""; }
function parse(result: ToolResult): JsonRecord { const value = text(result); return value ? JSON.parse(value) as JsonRecord : {}; }

const adr = {
  id: adrId,
  name: "Asset-to-3A mapping semantics",
  title: "Asset-to-3A mapping semantics",
  description: "Make design-asset-to-3A assignment the primary mapping contract and separate unit-to-unit architecture realization.",
  context: "The Designer v6 Baseline has 8 units, 42 direct memberships, and 6 unit-to-unit relationships. The product must distinguish asset classification from architecture realization and design-fact evidence.",
  decision: "Use Asset-to-3A mapping for design asset assignment with DIRECT, TRACE, EXEMPT, and BLOCKED outcomes. Present existing unit-to-unit records as Architecture Realization. Keep PostgreSQL authoritative, MCP as the authored write boundary, and exact Scope fail-closed reads.",
  alternatives: ["Rename only visible labels", "Replace both concepts with generic graph edges", "Infer units from names or graph proximity"],
  consequences: ["Asset mapping becomes the primary 3A experience", "Trace results remain derived and cannot create memberships", "v5/v6 identities remain backward compatible"],
  constraints: ["Exact owning Scope only", "English canonical fields and complete Chinese overlays", "PostgreSQL authority", "No automatic v7 unit publication"],
  status: "accepted",
  owner: "SpecForge Architecture",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "设计资产到 3A 映射语义",
      title: "设计资产到 3A 映射语义",
      description: "以设计资产到 3A 单元的归属作为主要映射契约，并将单元间关系拆分为架构实现关系。",
      context: "Designer v6 Baseline 包含 8 个单元、42 条直接归属和 6 条单元间关系。产品必须区分资产分类、架构实现和设计事实证据。",
      decision: "设计资产映射使用 DIRECT、TRACE、EXEMPT、BLOCKED 四种结果；现有单元间记录展示为架构实现关系。PostgreSQL 保持权威，MCP 保持设计事实写入边界，精确 Scope 读取失败关闭。",
      alternatives: ["只修改页面标签", "把两类概念合并为通用图边", "根据名称或图邻近关系推断单元"],
      consequences: ["资产映射成为主要 3A 体验", "追溯结果保持派生性质且不能创建成员归属", "v5/v6 身份保持向后兼容"],
      constraints: ["只允许精确 owning Scope", "英文规范字段和完整中文覆盖", "PostgreSQL 保持权威", "不自动发布 v7 单元"]
    }
  }
};

const proposal = {
  id: proposalId,
  name: "Implement asset-to-3A mapping semantics",
  title: "Implement asset-to-3A mapping semantics",
  description: "Expose design asset assignment as the primary 3A mapping and separate architecture realization relationships.",
  background: "Existing v6 unit relationships were being presented as 3A mappings even though users need asset-to-unit classification.",
  goal: "Provide bounded exact-Scope asset mapping outcomes while preserving v5/v6 Baselines and existing realization IDs.",
  nonGoal: "This increment does not publish new v7 architecture units, automate semantic promotion, or add cross-Scope comparison.",
  scope: `${scope.applicationServiceId} and its exact Scope path.`,
  impactedAssets: ["adr-readable-3a-architecture-mapping", "api-specforge-3a-architecture-query", "data-specforge-3a-projection-read-model"],
  specChanges: ["Add DIRECT, TRACE, EXEMPT, and BLOCKED asset mapping outcomes", "Expose exact-Scope MCP asset mapping reads", "Present unit-to-unit records as Architecture Realization", "Update the 3A workspace and bilingual terminology"],
  risks: ["Coverage rows may be stale", "Conflicting direct targets must remain BLOCKED", "Compatibility aliases can prolong ambiguous client terminology"],
  rolloutPlan: "Run focused core, MCP, and Web checks; synchronize the exact-Scope design facts; read the current v6 baseline and coverage waterlines back through MCP.",
  rollbackPlan: "Keep v5/v6 projections and stop consuming the new asset mapping read path; no authored membership or realization revisions are deleted.",
  status: "implemented",
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "实施设计资产到 3A 映射语义",
      title: "实施设计资产到 3A 映射语义",
      description: "将设计资产归属作为主要 3A 映射，并把架构单元间关系单独展示为架构实现关系。",
      background: "现有 v6 单元间关系被展示成 3A 映射，但用户真正需要的是资产到单元的分类。",
      goal: "在保持 v5/v6 Baseline 和已有实现关系 ID 的同时，提供精确 Scope 的有界资产映射结果。",
      nonGoal: "本增量不发布新的 v7 架构单元，不自动提升语义，也不提供跨 Scope 比较。",
      scope: `${scope.applicationServiceId} 及其精确 Scope 路径。`,
      specChanges: ["增加 DIRECT、TRACE、EXEMPT、BLOCKED 资产映射结果", "提供精确 Scope 的 MCP 资产映射读取", "将单元间记录展示为架构实现", "更新 3A 工作台和双语术语"],
      risks: ["覆盖行可能过期", "冲突的直接目标必须保持 BLOCKED", "兼容别名可能延长客户端的旧术语"],
      rolloutPlan: "运行核心、MCP 和 Web 聚焦检查；同步精确 Scope 设计事实；通过 MCP 回读当前 v6 Baseline 和覆盖水位。",
      rollbackPlan: "保留 v5/v6 投影并停止消费新的资产映射读取路径；不删除任何成员或实现关系修订。"
    }
  }
};

const contextPack = {
  id: contextPackId,
  name: "Asset-to-3A mapping semantics Context Pack",
  proposalId,
  targetAgent: "codex",
  summary: "Use asset-to-3A mapping as the primary classification model and call unit-to-unit records realizations.",
  includedAssets: [adrId, proposalId, evidenceId],
  constraints: ["Read and write only the exact Designer Scope", "PostgreSQL is authoritative", "MCP is the authored design-fact write boundary", "Never infer direct assignments from names or graph proximity"],
  instructions: ["Read the ADR and Proposal before changing 3A mapping behavior", "Keep DIRECT and TRACE distinct", "Use exact Baseline and Projection identities", "Run focused checks and read back MCP evidence before completion"],
  generatedMarkdown: "# Asset-to-3A mapping semantics\n\nUse asset-to-3A assignments as the primary mapping. Treat unit-to-unit records as architecture realizations.\n",
  createdAt: now,
  updatedAt: now,
  localizedContent: {
    zh: {
      name: "设计资产到 3A 映射语义 Context Pack",
      summary: "以设计资产到 3A 的归属作为主要分类，并将单元间关系称为架构实现。",
      constraints: ["只读取和写入精确 Designer Scope", "PostgreSQL 保持权威", "MCP 是设计事实写入边界", "绝不根据名称或图邻近关系推断直接归属"],
      instructions: ["修改 3A 映射前读取 ADR 和 Proposal", "严格区分 DIRECT 和 TRACE", "使用精确 Baseline 和 Projection 身份", "完成前运行聚焦检查并回读 MCP 证据"],
      generatedMarkdown: "# 设计资产到 3A 映射语义\n\n以资产到 3A 的归属作为主要映射，把单元间关系作为架构实现。\n"
    }
  }
};

const evidence = {
  id: evidenceId,
  name: "Asset-to-3A mapping semantics verification evidence",
  description: "Focused checks and exact-Scope read-back for the asset mapping semantics implementation.",
  decisionId: adrId,
  command: "pnpm --filter @specforge/core typecheck; pnpm exec vitest run packages/core/src/architecture-map/asset-mapping.test.ts apps/mcp-server/src/tools.test.ts --exclude .worktrees/** --exclude .pnpm-store/**; pnpm exec tsc -p apps/web/tsconfig.json --noEmit; pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit; pnpm enterprise-3a:build; pnpm enterprise-3a:verify; pnpm exec tsx scripts/verify-designer-3a-v6.ts; pnpm design-facts:check; git diff --check",
  result: "Core typecheck passed; 34 focused tests passed; Web and MCP TypeScript checks passed; coverage generation v13 is CURRENT with 307/307 COVERED, 0 BLOCKED, 0 NOT_EVALUATED, maximum path 3; asset mapping read-back is 307 total with DIRECT 38, TRACE 255, BLOCKED 14, EXEMPT 0; exact-Scope v6 remains READY with 8 units, 42 direct memberships, and 6 architecture realizations.",
  status: "passed",
  recordedAt: now,
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "设计资产到 3A 映射语义验证证据",
      description: "资产映射语义实现的聚焦检查和精确 Scope 回读证据。",
      command: "pnpm --filter @specforge/core typecheck；pnpm exec vitest run packages/core/src/architecture-map/asset-mapping.test.ts apps/mcp-server/src/tools.test.ts --exclude .worktrees/** --exclude .pnpm-store/**；pnpm exec tsc -p apps/web/tsconfig.json --noEmit；pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit；pnpm enterprise-3a:build；pnpm enterprise-3a:verify；pnpm exec tsx scripts/verify-designer-3a-v6.ts；pnpm design-facts:check；git diff --check",
      result: "核心类型检查通过；34 项聚焦测试通过；Web 和 MCP TypeScript 检查通过；覆盖代次 v13 为 CURRENT，307/307 条 COVERED、0 条 BLOCKED、0 条 NOT_EVALUATED，最大路径 3 跳；资产映射回读共 307 条，其中 DIRECT 38、TRACE 255、BLOCKED 14、EXEMPT 0；精确 Scope 的 v6 回读仍为 READY，包含 8 个单元、42 条直接归属和 6 条架构实现关系。"
    }
  }
};

const affected = [
  ["adr", "adr-readable-3a-architecture-mapping", "DECIDES"],
  ["api", "api-specforge-3a-architecture-query", "DECIDES"],
  ["dataModel", "data-specforge-3a-projection-read-model", "DECIDES"]
] as const;

async function main(): Promise<void> {
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")], cwd: root, env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }, stderr: "inherit" });
  const client = new Client({ name: "asset-3a-mapping-design-facts", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const call = async (name: string, args: JsonRecord): Promise<JsonRecord> => { const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 }) as ToolResult; if (response.isError) throw new Error(`${name}: ${text(response)}`); return parse(response); };
  try {
    await call("create_adr", { applicationServiceId: scope.applicationServiceId, architectureScope: scope, adr });
    await call("upsert_proposal", { architectureScope: scope, proposal });
    await call("upsert_context_pack", { architectureScope: scope, contextPack });
    await call("upsert_design_asset", { assetType: "evidence", architectureScope: scope, asset: evidence });
    await call("link_assets", { architectureScope: scope, sourceType: "proposal", sourceId: proposalId, targetType: "adr", targetId: adrId, relationType: "IMPLEMENTS_DECISION" });
    await call("link_assets", { architectureScope: scope, sourceType: "contextPack", sourceId: contextPackId, targetType: "proposal", targetId: proposalId, relationType: "IMPLEMENTS_CONTEXT_FOR" });
    await call("link_assets", { architectureScope: scope, sourceType: "evidence", sourceId: evidenceId, targetType: "adr", targetId: adrId, relationType: "VALIDATES" });
    for (const [targetType, targetId, relationType] of affected) await call("link_assets", { architectureScope: scope, sourceType: "adr", sourceId: adrId, targetType, targetId, relationType });
    const readBack = await Promise.all([
      call("get_asset_detail", { assetType: "adr", assetId: adrId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "proposal", assetId: proposalId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "contextPack", assetId: contextPackId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "evidence", assetId: evidenceId, applicationServiceId: scope.applicationServiceId, format: "json", locale: "en" })
    ]);
    const ids = readBack.map((item) => String((item.asset as JsonRecord | undefined)?.id ?? (item.canonicalSource as JsonRecord | undefined)?.id ?? ""));
    if (ids.some((id) => !id) || new Set(ids).size !== 4) throw new Error(`ASSET_3A_MAPPING_DESIGN_FACT_READBACK_MISMATCH:${ids.join(",")}`);
    console.log(JSON.stringify({ status: "synchronized", scope, adrId, proposalId, contextPackId, evidenceId, readBackIds: ids }, null, 2));
  } finally { await client.close(); await transport.close(); }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
