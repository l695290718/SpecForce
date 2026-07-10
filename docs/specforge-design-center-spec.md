# SpecForge Design Center Specification

## 1. Product Positioning

SpecForge Design Center is an MCP-native AI design center for spec-driven software development.

Its purpose is to keep product, architecture, API, event, data, rule, state-machine, quality, observability, and ADR knowledge in one structured design center. Human users manage and inspect that knowledge through the Web Console. AI Coding Agents consume and operate on that knowledge through the MCP Server.

Chinese name: 智设中枢.

## 2. Goals

- Provide a human-facing Web Console for browsing, editing, validating, and exporting design assets.
- Provide an MCP-first agent interface for Codex, Claude Code, Cursor, Copilot, and other AI Coding Agents.
- Reuse one shared `@specforge/core` service layer across Web and MCP.
- Generate Agent Context Packs from proposals.
- Run design governance checks before implementation.
- Preserve audit logs for MCP tool calls.
- Keep the MVP runnable locally with seed data.

## 3. Non-Goals

- Full OAuth login is not implemented in the MVP.
- Streamable HTTP MCP transport is reserved but not enabled.
- Persistent write-through for all mutations is not complete; the MVP uses seed-backed in-memory services.
- No delete tools are exposed.
- No arbitrary code execution is exposed through MCP.
- No raw database connection capability is exposed through MCP.

## 4. Architecture

```txt
specforge-design-center/
├── apps/
│   ├── web/          Next.js Web Console
│   └── mcp-server/   MCP Server over stdio
├── packages/
│   └── core/         Shared domain, governance, context, graph, audit, and AI provider services
├── prisma/           Database schema and seed script
└── docs/             Product and architecture specifications
```

The key architectural rule is:

```txt
Web UI -> @specforge/core <- MCP Server
```

Business rules and asset operations must live in `packages/core`. App layers should compose and present core capabilities, not duplicate them.

## 5. Core Service Contract

`packages/core` owns the shared service API:

- `searchDesignAssets()`
- `getAssetDetail()`
- `renderAssetAsMarkdown()`
- `analyzeProposalImpact()`
- `generateContextPack()`
- `runGovernanceChecks()`
- `runGovernanceChecksForTarget()`
- `createProposal()`
- `updateProposal()`
- `createAdr()`
- `linkAssets()`
- `buildAssetGraph()`
- `recordAuditLog()`
- `listAuditLogs()`

These services are the only business logic surface used by both `apps/web` and `apps/mcp-server`.

## 6. Web Console

The Web Console provides:

- Dashboard with asset metrics, proposal status, governance alerts, quick links, and animated status panels.
- Asset catalog pages for domains, data models, APIs, events, business rules, state machines, integrations, quality, observability, and ADRs.
- Asset detail pages with summary, structured JSON, governance results, and specialized sections.
- Proposal list, detail, and draft creation screens.
- Context Pack list and Markdown export/copy screens.
- Governance rule and governance check views.
- Asset graph filtering by domain and asset type.
- Settings page for future environment and policy controls.
- Chinese / English internationalization through `LanguageProvider` and `apps/web/lib/i18n.ts`.

## 7. MCP Server

`apps/mcp-server` uses the official `@modelcontextprotocol/sdk` TypeScript SDK.

Current transport:

- stdio transport for local MCP clients.

Reserved transport:

- Streamable HTTP transport for future remote deployments.

Run command:

```bash
pnpm mcp:dev
```

Smoke test:

```bash
pnpm --filter @specforge/mcp-server smoke
```

## 8. MCP Resources

Resources return agent-readable Markdown, with JSON code blocks when precise structure is useful.

- `specforge://domains`
- `specforge://domains/{id}`
- `specforge://data-models`
- `specforge://data-models/{id}`
- `specforge://apis`
- `specforge://apis/{id}`
- `specforge://events`
- `specforge://events/{id}`
- `specforge://business-rules`
- `specforge://business-rules/{id}`
- `specforge://state-machines`
- `specforge://state-machines/{id}`
- `specforge://integrations`
- `specforge://integrations/{id}`
- `specforge://adrs`
- `specforge://adrs/{id}`
- `specforge://proposals`
- `specforge://proposals/{id}`
- `specforge://context-packs`
- `specforge://context-packs/{id}`
- `specforge://graph`
- `specforge://graph/{domainId}`

## 9. MCP Tools

### `search_design_assets`

Searches design assets by query, asset type, and domain.

Permissions:

- `asset:read`

### `get_asset_detail`

Reads one asset as Markdown or JSON.

Permissions:

- `asset:read`

### `analyze_proposal_impact`

Analyzes proposal impact across domains, assets, risks, checks, and implementation tasks.

Permissions:

- `proposal:read`
- `asset:read`
- `graph:read`

### `generate_context_pack`

Generates an Agent Context Pack for a proposal, including implementation guidance and explicit Do-not Rules.

Permissions:

- `context-pack:generate`
- `proposal:read`
- `asset:read`

### `run_governance_checks`

Runs built-in governance checks for assets, proposals, or context packs.

Permissions:

- `governance:run`

### `create_proposal`

Creates a validated proposal.

Permissions:

- `proposal:write`

### `update_proposal`

Updates allowed proposal fields.

Permissions:

- `proposal:write`

### `create_adr`

Creates an Architecture Decision Record.

Permissions:

- `adr:write`

### `link_assets`

Creates a relationship between two design assets.

Permissions:

- `asset:write`

### `export_context_pack`

Exports a context pack as Markdown or JSON.

Permissions:

- `asset:read`

## 10. MCP Prompts

- `design_feature`: guides agents from natural-language feature request to proposal, impact analysis, context pack, and governance checks.
- `review_design_proposal`: reviews a proposal for gaps, risks, and missing design assets.
- `generate_api_contract`: drafts API contracts from a proposal.
- `generate_event_contract`: drafts event contracts from a proposal.
- `model_data`: generates or improves data models.
- `generate_test_plan`: generates implementation test suggestions.
- `generate_coding_context`: generates Codex-ready implementation context.

## 11. Audit Model

Audit logs record MCP tool usage and are represented by `AuditLog`:

- `id`
- `actorType`: `user` / `agent` / `system`
- `actorId`
- `channel`: `web` / `mcp` / `api`
- `action`
- `targetType`
- `targetId`
- `inputSummary`
- `outputSummary`
- `status`: `success` / `failed`
- `errorMessage`
- `createdAt`

The Prisma schema includes `AuditLog`. The MVP core audit service stores entries in the shared seed-backed store; persistence can later be routed through Prisma without changing MCP contracts.

## 12. Permission Model

The MVP defines the following permission vocabulary:

```ts
type Permission =
  | "asset:read"
  | "asset:write"
  | "proposal:read"
  | "proposal:write"
  | "context-pack:generate"
  | "governance:run"
  | "adr:write"
  | "graph:read";
```

`allowAllPolicy` is used for the MVP. The policy boundary is isolated in `apps/mcp-server/src/auth.ts` so RBAC or OAuth can replace it later.

## 13. Security Rules

- Validate all MCP write inputs with Zod.
- Audit all MCP tool calls.
- Sanitize MCP tool errors before returning them to clients.
- Include explicit Do-not Rules in generated Context Packs.
- Do not expose delete tools by default.
- Do not expose raw database connections.
- Do not execute arbitrary code.
- Keep MCP tool descriptions clear about capability boundaries.

## 14. Seed Scenario

The default seed scenario is "订单部分退款" / "partial order refund".

It includes:

- Order domain model.
- Order and refund data models.
- CreateRefund API contract.
- RefundCreated and RefundSucceeded event contracts.
- Refund amount business rule.
- Refund state machine.
- Payment refund integration contract.
- Refund latency quality requirement.
- Refund success-rate observability design.
- ADR preventing synchronous order-to-inventory coupling.
- Partial refund proposal.
- Agent Context Pack.

## 15. Verification

Primary verification commands:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm --filter @specforge/mcp-server smoke
pnpm exec prisma validate
```

Runtime checks:

```bash
pnpm dev
pnpm mcp:dev
```

Expected MCP smoke result:

- tools are listed.
- resources are listed.
- prompts are listed.
- `search_design_assets` finds `proposal-partial-refund`.
- `generate_context_pack` returns `# Agent Context Pack`.
- `run_governance_checks` returns check results.

## 16. Roadmap

Near-term:

- Persist proposal, ADR, link, and audit writes through Prisma.
- Add richer Context Pack templates per target agent.
- Add visual graph filtering and relationship type controls.
- Add governance detail drill-down and remediation guidance.

Later:

- Enable Streamable HTTP MCP transport.
- Replace `allowAllPolicy` with RBAC / OAuth.
- Add multi-tenant asset stores.
- Add import pipelines from OpenAPI, AsyncAPI, Prisma schema, and source repositories.
- Add CI integration for governance checks.
