# SpecForge Design Center

SpecForge Design Center（智设中枢）是面向 AI Coding Agent 的 MCP-native、规格驱动设计中心。Web Console 是人的管理界面，MCP Server 是 Codex、Claude Code、Cursor、Copilot 等 Agent 的主要设计读写入口，PostgreSQL 保存设计资产及其应用架构 scope。

## Current Architecture

```text
AI Agent ── MCP stdio ── apps/mcp-server ─┐
                                          ├── packages/core ── PostgreSQL
Human ──── Next.js ───── apps/web ────────┘
```

| Module | Responsibility |
| --- | --- |
| `apps/web` | Next.js 15 bilingual management console, asset details, governance, graph, proposals, and Context Packs |
| `apps/mcp-server` | MCP tools, resources, prompts, authorization boundary, audit wrapper, and fail-fast seed client |
| `packages/core` | Shared asset types, architecture authorization, proposal localization, governance, graph, impact, AI Provider abstraction, and audit services |
| `prisma` | PostgreSQL schema plus reproducible self-design and multi-service fixtures |

Web and MCP reuse `@specforge/core`. Normal database reads and writes must carry one explicit application-service scope; there is no runtime fallback to unscoped seed data.

## Huawei Application Architecture

SpecForge models the hierarchy below:

```text
Product Family
└── Product
    └── Sub-product
        └── Module
            └── Application Service
```

The minimum writable unit is an application service. The current mock hierarchy includes:

| Application service | Purpose | Default Agent access |
| --- | --- | --- |
| `com.huawei.celon.desiner` | SpecForge Designer | Read and write |
| `com.huawei.celon.specstudio` | Specification composition and review | Read only |
| `com.huawei.celon.policyhub` | Architecture policy and governance | Read only |
| `com.huawei.celon.integrationgateway` | External API and event integration | Read only |

The default Agent inherits read access from `module-celon-designer` and has write access only to `com.huawei.celon.desiner`. A seed-only system actor can write deterministic fixtures under that module; it is enabled only for the MCP seed child process.

Dashboard totals, asset catalogs, proposal lists, Context Packs, governance checks, API routes, and graphs are isolated by the selected application service. Cross-service aggregation is intentionally deferred; future cross-service reads belong in an explicit, permission-filtered impact-analysis view.

## Prerequisites

- Node.js 20 or newer
- Corepack with pnpm 9.15.4
- PostgreSQL with a database named `specforge`

The default local connection in `.env.example` is:

```env
DATABASE_URL="postgresql://admin:admin@localhost:5432/specforge?schema=public"
```

## Local Setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first visit redirects to the default authorized application service. Later service selections are preserved in the URL, local storage, and a validated cookie.

On Windows, when `pnpm` is not directly available in the current shell, run Corepack explicitly:

```powershell
& 'D:\Program Files\nodejs\corepack.cmd' pnpm --filter '@specforge/web' dev
```

## MCP Server

Start the stdio server:

```bash
pnpm mcp:dev
```

Example local client configuration:

```json
{
  "mcpServers": {
    "specforge": {
      "command": "pnpm.cmd",
      "args": ["--dir", "C:\\path\\to\\SpecForge", "mcp:dev"]
    }
  }
}
```

The MVP enables stdio only. Streamable HTTP and OAuth/RBAC remain deployment work; application-service scope authorization is already enforced in the shared architecture model.

## Scoped MCP Calls

Read tools require `applicationServiceId`:

```json
{
  "name": "search_design_assets",
  "arguments": {
    "applicationServiceId": "com.huawei.celon.policyhub",
    "query": "scope isolation",
    "limit": 10
  }
}
```

Write tools require the canonical architecture scope:

```json
{
  "name": "upsert_proposal",
  "arguments": {
    "proposal": {
      "id": "proposal-example",
      "name": "Example",
      "title": "Example Proposal",
      "description": "Example scoped design change.",
      "background": "A design change is required.",
      "goal": "Describe the intended outcome.",
      "nonGoal": "Exclude unrelated changes.",
      "scope": "com.huawei.celon.desiner",
      "impactedAssets": [],
      "specChanges": ["Add the approved design change."],
      "risks": ["Implementation can drift from the proposal."],
      "rolloutPlan": "Review, implement, and verify.",
      "rollbackPlan": "Restore the previous proposal payload.",
      "status": "draft",
      "createdAt": "2026-07-13T00:00:00.000Z",
      "updatedAt": "2026-07-13T00:00:00.000Z"
    },
    "architectureScope": {
      "applicationServiceId": "com.huawei.celon.desiner",
      "scopePath": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
    }
  }
}
```

The main tools are:

- `upsert_design_asset`, `upsert_proposal`, `upsert_context_pack`, `link_assets`
- `search_design_assets`, `get_asset_detail`, `analyze_proposal_impact`
- `generate_context_pack`, `export_context_pack`
- `run_governance_checks`, `create_proposal`, `update_proposal`, `create_adr`

Static `specforge://...` resources do not guess an application service. They direct clients to scoped tools until service-aware resource templates are introduced.

## MCP-native Seed

`pnpm db:seed` starts SpecForge MCP as a child process and writes fixtures only through MCP tools. The seed:

- migrates legacy records to `com.huawei.celon.desiner`;
- writes SpecForge self-design assets and bilingual architecture proposals;
- creates distinct assets for Spec Studio, Policy Hub, and Integration Gateway;
- fails immediately when an MCP tool returns `isError`;
- remains idempotent through stable asset IDs and upserts.

Example verification query:

```sql
SELECT "applicationServiceId", count(*)
FROM "DesignAsset"
GROUP BY "applicationServiceId"
ORDER BY "applicationServiceId";
```

## AI Provider

`packages/core/src/ai` defines the provider abstraction. `MockAIProvider` is deterministic and active for the MVP. `OpenAIProvider` is reserved as an interface boundary and does not call a real model or require secrets yet.

## Security and Audit

- MCP tool inputs use Zod validation.
- MCP write operations validate application-service write grants.
- MCP reads validate inherited read grants and filter PostgreSQL queries by scope.
- Seed elevation is process-local and uses a dedicated system actor.
- Tool errors are sanitized for clients; the seed still treats `isError` as a failure.
- Delete tools and raw database access are not exposed through MCP.
- Tool calls pass through the audit wrapper; durable audit persistence remains an extension point.

## Specifications

- [Product and architecture specification](docs/specforge-design-center-spec.md)
- [Huawei application architecture scope design](docs/superpowers/specs/2026-07-12-huawei-architecture-scope-design.md)
- [Agent-service workspace design](docs/superpowers/specs/2026-07-13-agent-service-workspace-design.md)
- [Strict isolation implementation plan](docs/superpowers/plans/2026-07-13-strict-application-service-isolation.md)

## Commands

```bash
pnpm dev
pnpm mcp:dev
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @specforge/mcp-server smoke
```
