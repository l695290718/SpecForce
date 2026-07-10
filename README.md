# SpecForge Design Center

SpecForge Design Center is an MCP-native AI design center for spec-driven software development.

The Web UI is the human management console. The MCP Server is the primary interface for AI Coding Agents such as Codex, Claude Code, Cursor, and Copilot.

## Apps And Packages

```txt
apps/web              Next.js Web Console
apps/mcp-server       MCP Server over stdio, with Streamable HTTP reserved
packages/core         Shared design asset, proposal, context pack, governance, graph, impact, and audit services
prisma                Prisma schema and seed script
```

Web and MCP both call `@specforge/core`; business logic should not be duplicated in app-specific layers.

## Local Setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Optional database setup:

```bash
cp .env.example .env
pnpm db:push
pnpm db:seed
```

## MCP Server

Start the stdio MCP Server:

```bash
pnpm mcp:dev
```

For local MCP clients, connect over stdio with:

```json
{
  "mcpServers": {
    "specforge": {
      "command": "pnpm",
      "args": ["--dir", "C:\\Users\\69529\\OneDrive\\文档\\SpecForge", "mcp:dev"]
    }
  }
}
```

On Windows clients that require an executable suffix, use `pnpm.cmd`.

## MCP Resources

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

Resources return agent-readable Markdown and may include JSON blocks for precise contracts.

## MCP Tools

- `search_design_assets`: read-only search across design assets.
- `get_asset_detail`: read one asset as Markdown or JSON.
- `analyze_proposal_impact`: analyze affected domains, assets, risks, checks, and tasks.
- `generate_context_pack`: generate an Agent Context Pack with explicit Do-not Rules.
- `run_governance_checks`: run built-in design governance checks.
- `create_proposal`: create a validated proposal.
- `update_proposal`: update allowed proposal fields.
- `create_adr`: create an Architecture Decision Record.
- `link_assets`: create an audited relationship between assets.
- `export_context_pack`: export a Context Pack as Markdown or JSON.

Every tool declares required permissions in `_meta.permissions`. The first policy is `allowAllPolicy`, designed to be replaced by RBAC or OAuth later.

## MCP Prompts

- `design_feature`
- `review_design_proposal`
- `generate_api_contract`
- `generate_event_contract`
- `model_data`
- `generate_test_plan`
- `generate_coding_context`

## Example Agent Scenario

Ask Codex or another MCP client:

```txt
Use SpecForge to get the Context Pack for 订单部分退款.
```

The agent should:

1. Call `search_design_assets` with `query: "订单 部分退款"`.
2. Open `specforge://proposals/proposal-partial-refund`.
3. Call `generate_context_pack` with `proposalId: "proposal-partial-refund"` and `targetAgent: "codex"`.
4. Call `run_governance_checks` for the proposal before implementation.

## Audit And Security

- All MCP tool calls write an `AuditLog` entry through `packages/core`.
- Write tools use Zod validation.
- Errors returned to MCP clients are sanitized.
- No delete tools are exposed by default.
- Raw database connections are not exposed.
- Arbitrary code execution is not supported.
- Context Pack generation includes explicit Do-not Rules.

The Prisma schema includes `AuditLog` for durable audit persistence. The current MVP core service uses the shared in-memory seed store; a later persistence pass can map `recordAuditLog()` to Prisma without changing MCP tool contracts.

## Streamable HTTP And OAuth Roadmap

`apps/mcp-server/src/server.ts` already separates server construction from transport startup. The MVP only enables stdio. To enable remote deployment later:

1. Add a Streamable HTTP entrypoint using the SDK transport.
2. Replace `allowAllPolicy` with RBAC/OAuth-backed authorization.
3. Persist audit logs and write operations through Prisma.
4. Add deployment-level TLS, rate limits, and tenant isolation.

## Common Commands

```bash
pnpm dev
pnpm mcp:dev
pnpm --filter @specforge/mcp-server smoke
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm db:push
pnpm db:seed
```
