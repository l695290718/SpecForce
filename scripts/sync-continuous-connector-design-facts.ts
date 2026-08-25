import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type ToolResult = { content?: Array<{ type?: string; text?: string }>; isError?: boolean };

const root = process.cwd();
const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;
const adrId = "adr-delta-connector-run-completion";
const proposalId = "proposal-delta-connector-run-completion";
const contextPackId = "context-pack-delta-connector-run-completion";
const evidenceId = "evidence-delta-connector-run-completion";
const now = new Date().toISOString();

function text(result: ToolResult): string {
  return (result.content ?? []).map((item) => item.type === "text" ? item.text ?? "" : "").join("");
}

function parse(result: ToolResult): JsonRecord {
  const value = text(result);
  return value ? JSON.parse(value) as JsonRecord : {};
}

const adr = {
  id: adrId,
  name: "Delta connector run completion",
  title: "Delta connector run completion",
  description: "Close successful DELTA connector runs atomically without invoking snapshot deletion inference.",
  context: "A last-page DELTA batch previously left its run in FINALIZING even though the Worker finalizes only FULL_SNAPSHOT runs.",
  decision: "When a last-page DELTA batch is accepted, mark the run SUCCEEDED, record finishedAt, and release its lease in the same PostgreSQL transaction. Keep FULL_SNAPSHOT finalization completeness- and boundary-gated.",
  alternatives: ["Make the Worker call snapshot finalization for DELTA runs", "Leave DELTA runs in FINALIZING until lease expiry"],
  consequences: ["DELTA runs have a terminal lifecycle", "Lease cleanup is atomic with successful ingestion", "Explicit delta tombstones remain candidate observations and do not bypass MCP promotion"],
  constraints: ["Exact owning Scope only", "PostgreSQL is authoritative", "Graph stores remain derived", "English canonical fields require complete Chinese human-facing overlays"],
  status: "accepted",
  owner: "SpecForge Architecture and Runtime",
  createdAt: now,
  updatedAt: now,
  relatedAssets: ["data-specforge-assets", "api-specforge-mcp-tools"],
  localizedContent: {
    zh: {
      name: "增量连接器运行闭环",
      title: "增量连接器运行闭环",
      description: "在不触发快照删除推断的前提下，原子结束成功的 DELTA 连接器运行。",
      context: "最后一页 DELTA 批次此前会让运行停留在 FINALIZING，而 Worker 只终结 FULL_SNAPSHOT 运行。",
      decision: "接受最后一页 DELTA 批次时，在同一 PostgreSQL 事务中将运行置为 SUCCEEDED、写入 finishedAt 并释放租约。FULL_SNAPSHOT 仍必须经过完整性和边界门禁。",
      alternatives: ["让 Worker 对 DELTA 调用快照终结", "让 DELTA 一直停留在 FINALIZING 并等待租约过期"],
      consequences: ["DELTA 运行拥有明确终态", "租约释放与成功摄取原子完成", "显式增量删除仍是候选观测，不能绕过 MCP 提升"],
      constraints: ["只允许精确 owning Scope", "PostgreSQL 保持权威", "图数据库保持派生", "英文规范字段必须有完整中文面向人覆盖"]
    }
  }
};

const proposal = {
  id: proposalId,
  name: "Implement delta connector run completion",
  title: "Implement delta connector run completion",
  description: "Make successful last-page DELTA ingestion terminal and lease-safe while preserving snapshot deletion safeguards.",
  background: "The continuous observation worker has separate FULL_SNAPSHOT and DELTA semantics, but persistence previously treated both last pages as FINALIZING.",
  goal: "Complete DELTA runs atomically and verify explicit update and tombstone observations without automatic promotion.",
  nonGoal: "This increment does not add automatic semantic promotion, external APPLY, enterprise identity, or graph authority.",
  scope: "The exact com.huawei.celon.desiner application-service Scope and continuous-observation/v2 persistence boundary.",
  impactedAssets: ["data-specforge-assets", "api-specforge-mcp-tools"],
  specChanges: ["Mark last-page DELTA runs SUCCEEDED", "Release the DELTA run lease atomically", "Verify incomplete snapshot safety and explicit delta tombstones"],
  risks: ["A changed source boundary must never trigger snapshot tombstones", "Source observations must remain candidates until governed review"],
  rolloutPlan: "Deploy the persistence change with the connector worker image, run the PostgreSQL integration suite, and read back the scoped design facts.",
  rollbackPlan: "Revert the persistence commit; existing source observations and authored assets remain in PostgreSQL.",
  status: "implemented",
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "实施增量连接器运行闭环",
      title: "实施增量连接器运行闭环",
      description: "在保持快照删除安全边界的同时，让成功的最后一页 DELTA 摄取进入终态并安全释放租约。",
      background: "持续观测 Worker 区分 FULL_SNAPSHOT 和 DELTA，但持久化此前把两者的最后一页都置为 FINALIZING。",
      goal: "原子完成 DELTA 运行，并验证显式更新和删除观测不自动提升。",
      nonGoal: "本增量不包含自动语义提升、外部 APPLY、企业身份或图数据库权威化。",
      scope: "精确 com.huawei.celon.desiner 应用服务 Scope 和 continuous-observation/v2 持久化边界。",
      specChanges: ["将最后一页 DELTA 运行置为 SUCCEEDED", "原子释放 DELTA 运行租约", "验证未完成快照安全和显式增量删除"],
      risks: ["变化的来源边界不能触发快照删除候选", "来源观测必须在治理审核前保持候选状态"],
      rolloutPlan: "随连接器 Worker 镜像部署持久化变更，运行 PostgreSQL 集成套件，并回读精确 Scope 的设计事实。",
      rollbackPlan: "回滚持久化提交；已有来源观测和已编写资产仍保留在 PostgreSQL。"
    }
  }
};

const contextPack = {
  id: contextPackId,
  name: "Delta connector run completion Context Pack",
  proposalId,
  targetAgent: "codex",
  summary: "Exact-Scope implementation context for terminal DELTA runs and snapshot safety.",
  includedAssets: [
    { type: "adr", id: adrId, label: "Delta connector run completion" },
    { type: "proposal", id: proposalId, label: "Delta connector run completion rollout" },
    { type: "evidence", id: evidenceId, label: "Delta connector run completion verification evidence" }
  ],
  constraints: ["Read and write only the exact Designer Scope", "PostgreSQL is authoritative", "Do not infer deletion from incomplete or changed-boundary snapshots", "Do not promote source observations automatically"],
  instructions: ["Read ADR and Proposal before changing connector persistence", "Run the v2 PostgreSQL integration test", "Verify DELTA SUCCEEDED state and lease cleanup", "Keep Chinese overlays aligned with English canonical fields"],
  generatedMarkdown: "# Delta connector run completion\n\nDELTA last pages complete the run atomically. FULL_SNAPSHOT deletion inference remains completeness- and boundary-gated.\n",
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "增量连接器运行闭环 Context Pack",
      summary: "增量运行终态和快照安全边界的精确 Scope 实施上下文。",
      constraints: ["只读取和写入精确 Designer Scope", "PostgreSQL 保持权威", "不得从未完成或边界变化的快照推断删除", "不得自动提升来源观测"],
      instructions: ["修改连接器持久化前读取 ADR 和 Proposal", "运行 v2 PostgreSQL 集成测试", "验证 DELTA 的 SUCCEEDED 状态和租约释放", "保持中文覆盖与英文规范字段一致"],
      generatedMarkdown: "# 增量连接器运行闭环\n\nDELTA 最后一页原子完成运行。FULL_SNAPSHOT 删除推断仍受完整性和边界门禁。\n"
    }
  }
};

const evidence = {
  id: evidenceId,
  name: "Delta connector run completion verification evidence",
  description: "Exact commands and results for DELTA terminal state, incomplete snapshot protection, and scoped persistence.",
  decisionId: adrId,
  command: "pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit; pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/connectors/v2-persistence.integration.test.ts; pnpm --filter @specforge/connector-worker test; pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/federation/tools.test.ts",
  result: "TypeScript passed; PostgreSQL v2 integration passed 4 tests; connector-worker passed 13 tests with 1 database test skipped without the integration flag; MCP tools passed 39 tests; commit 2d87386.",
  status: "passed",
  recordedAt: now,
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: {
    zh: {
      name: "增量连接器运行闭环验证证据",
      description: "DELTA 终态、未完成快照保护和精确 Scope 持久化的命令与结果。",
      command: "pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit；pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/connectors/v2-persistence.integration.test.ts；pnpm --filter @specforge/connector-worker test；pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/federation/tools.test.ts",
      result: "TypeScript 通过；PostgreSQL v2 集成通过 4 项；connector-worker 通过 13 项，未启用集成标志时跳过 1 项数据库测试；MCP 工具通过 39 项；提交为 2d87386。"
    }
  }
};

function parseTool(result: ToolResult): JsonRecord {
  if (result.isError) throw new Error(text(result) || "MCP_TOOL_FAILED");
  return parse(result);
}

function persistedId(result: JsonRecord): string {
  const asset = result.asset as JsonRecord | undefined;
  const canonical = result.canonicalSource as JsonRecord | undefined;
  return String(asset?.id ?? canonical?.id ?? "");
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId },
    stderr: "inherit"
  });
  const client = new Client({ name: "specforge-continuous-connector-design-facts", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const call = async (name: string, arguments_: JsonRecord): Promise<JsonRecord> => parseTool(await client.callTool({ name, arguments: arguments_ }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 }) as ToolResult);
  try {
    await call("create_adr", { applicationServiceId: scope.applicationServiceId, architectureScope: scope, adr });
    await call("upsert_proposal", { proposal, architectureScope: scope });
    await call("upsert_context_pack", { contextPack, architectureScope: scope });
    await call("upsert_design_asset", { assetType: "evidence", asset: evidence, architectureScope: scope });
    const links = [
      ["proposal", proposalId, "adr", adrId, "IMPLEMENTS_DECISION"],
      ["contextPack", contextPackId, "proposal", proposalId, "IMPLEMENTS_CONTEXT_FOR"],
      ["evidence", evidenceId, "adr", adrId, "VALIDATES"],
      ["adr", adrId, "dataModel", "data-specforge-assets", "DECIDES"],
      ["adr", adrId, "api", "api-specforge-mcp-tools", "DECIDES"]
    ] as const;
    for (const [sourceType, sourceId, targetType, targetId, relationType] of links) await call("link_assets", { architectureScope: scope, sourceType, sourceId, targetType, targetId, relationType });
    const readBack = await Promise.all([
      call("get_asset_detail", { assetType: "adr", assetId: adrId, applicationServiceId: scope.applicationServiceId, architectureScope: scope, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "proposal", assetId: proposalId, applicationServiceId: scope.applicationServiceId, architectureScope: scope, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "contextPack", assetId: contextPackId, applicationServiceId: scope.applicationServiceId, architectureScope: scope, format: "json", locale: "en" }),
      call("get_asset_detail", { assetType: "evidence", assetId: evidenceId, applicationServiceId: scope.applicationServiceId, architectureScope: scope, format: "json", locale: "en" })
    ]);
    const readBackIds = readBack.map(persistedId);
    if (!readBackIds.every(Boolean) || new Set(readBackIds).size !== 4) throw new Error(`DESIGN_FACT_READBACK_MISMATCH:${readBackIds.join(",")}`);
    const linkResult = await call("list_asset_links", { applicationServiceId: scope.applicationServiceId, architectureScope: scope });
    const linkRows = Array.isArray(linkResult) ? linkResult : Array.isArray(linkResult.links) ? linkResult.links as JsonRecord[] : [];
    const scopedLinks = linkRows.filter((link) => links.some(([sourceType, sourceId, targetType, targetId, relationType]) => link.sourceType === sourceType && link.sourceId === sourceId && link.targetType === targetType && link.targetId === targetId && link.relationType === relationType));
    if (scopedLinks.length !== links.length) throw new Error(`DESIGN_FACT_LINK_READBACK_MISMATCH:${scopedLinks.length}/${links.length}`);
    console.log(JSON.stringify({ status: "synchronized", architectureScope: scope, adrId, proposalId, contextPackId, evidenceId, readBackIds, typedLinkCount: scopedLinks.length }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
