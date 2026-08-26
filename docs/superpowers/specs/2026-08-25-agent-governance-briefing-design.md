# Agent Governance Briefing Design

**Status:** Implemented; evidence recorded in ADR-0040 and MCP Proposal/Context Pack
**Scope:** `com.huawei.celon.desiner`
**Owner:** SpecForge Designer
**Design session:** `design-change-session:987271e5-6d04-4a24-a827-021fdb64acba`
**ADR:** `adr-agent-governance-briefing` (`docs/adr/0040-agent-governance-briefing.md`)

## Goal

Give every agent and human a single generated orientation artifact compiled from system records through MCP, so governance knowledge is consumed from the authoritative source instead of hand-written summaries.

## Design

1. `pnpm design:query` wraps MCP `search_design_assets` / `get_asset_detail` as the agent read path; direct database reads are retired from agent workflows.
2. `pnpm governance:briefing` reads business rules and ADRs across all four readable scopes via MCP, compiles them with the shared core function `compileGovernanceBriefing`, and writes digest-stamped `docs/governance-briefing.md` (FNV-1a digest over sorted asset ids).
3. The same core compiler renders the live `/governance/briefing` page server-side via core reuse (`rule-specforge-core-service-reuse`); the page adds no new grants.
4. A six-step orientation checklist travels inside the artifact: read briefing first, preflight before change, MCP-only writes, bilingual completeness, CONVERGED closure evidence, backlog facts for deferrals.
5. AGENTS.md regeneration from the record is deferred as backlog fact `backlog-agents-md-sync-from-record`.

## Acceptance Criteria

- Identical inputs produce identical digests; the document states it must not be hand-edited.
- The web surface and the markdown document resolve to the same rule and ADR sets within one waterline.
- All human-facing content ships English canonical plus Chinese overlay.

# 代理治理简报设计

**状态：** 已实现；证据见 ADR-0040 与 MCP Proposal/Context Pack
**范围：** `com.huawei.celon.desiner`
**负责人：** SpecForge Designer
**设计会话：** `design-change-session:987271e5-6d04-4a24-a827-021fdb64acba`

## 目标

为每个代理和人提供单一经 MCP 从系统记录生成的定向产物，使治理知识来自权威源而非手写摘要。

## 设计

1. `pnpm design:query` 封装 MCP `search_design_assets` / `get_asset_detail` 作为代理读路径；代理工作流退役直查数据库。
2. `pnpm governance:briefing` 经 MCP 跨四个可读 Scope 读取业务规则与 ADR，用共享核心函数编译并写出带摘要的 `docs/governance-briefing.md`。
3. 同一核心编译器经 Core 复用在服务端渲染线上 `/governance/briefing` 页面，不新增授权。
4. 六步入职清单随产物交付：先读简报、改前预检、仅经 MCP 写入、双语完整、CONVERGED 关闭证据、延期登记待办。
5. AGENTS.md 再生成为延期待办 `backlog-agents-md-sync-from-record`。

## 验收标准

- 相同输入产生相同摘要；文档声明禁止手改。
- 网页与 Markdown 在同一水位下解析到相同规则与 ADR 集合。
- 所有面向人的内容提供英文规范与中文覆盖。
