# SpecForge Design Center

SpecForge Design Center（智设中枢）是面向 AI Coding Agent 的 MCP-first、规格驱动设计中心。Web Console 为人提供按应用服务隔离的双语浏览与分析界面；MCP Server 是设计资产的唯一持久化写入边界；PostgreSQL 保存规范、关系和精确的华为应用架构 Scope。

> English is canonical. Chinese is a required presentation overlay.
>
> 英文是事实源，中文是必需的展示层翻译。

## Architecture

```text
AI Agent ── MCP stdio ── apps/mcp-server ── packages/core ── PostgreSQL
Human    ── Next.js ───── apps/web ───────────────┘
```

| Module            | Responsibility                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js 15 read-oriented console: dashboard, catalog, details, proposals, governance, graph, search, impact, and Context Packs            |
| `apps/mcp-server` | Scoped MCP tools/resources/prompts, validation, authorization, audit wrapper, persistence, and MCP-native seed client                     |
| `packages/core`   | Typed assets, localization, architecture authorization, graph/search/governance/impact/Context Pack services, and AI Provider abstraction |
| `prisma`          | PostgreSQL schema, legacy identity migration, and reproducible bilingual self-design fixtures                                             |

Normal reads and writes always identify one application service. Runtime readers do not fall back to the global demo seed when scoped PostgreSQL content is requested.

## Bilingual Asset Contract

Every MCP-managed asset uses its existing English fields as canonical content and stores Chinese human-facing text under `localizedContent.zh`:

```json
{
  "id": "api-example",
  "name": "Example API",
  "description": "Canonical English description.",
  "localizedContent": {
    "zh": {
      "name": "示例 API",
      "description": "中文展示说明。"
    }
  }
}
```

- English canonical fields and every required Chinese overlay field must be non-empty before an MCP write succeeds.
- `localizedContent.en` is not the storage model; legacy proposal overlays are normalized into canonical root fields.
- IDs, codes, paths, enum values, schema keys, HTTP methods, topics, state/event codes, relation types, and other executable structures remain language-neutral.
- Web pages call the shared localization service. They do not contain per-page merge rules.
- Browser create/edit routes redirect to read views. Persistent asset authoring and modification are performed through MCP.

Localization failures return a stable `code`, `assetType`, `assetId`, and `path`. Current codes are:

| Code                                   | Meaning                                                               |
| -------------------------------------- | --------------------------------------------------------------------- |
| `ASSET_TRANSLATION_REQUIRED`           | A required Chinese overlay or nested translation is missing           |
| `CANONICAL_CONTENT_REQUIRED`           | Required canonical English content is missing                         |
| `TRANSLATION_FIELD_NOT_ALLOWED`        | The overlay contains a field that is not translatable                 |
| `TRANSLATION_STRUCTURE_MISMATCH`       | Overlay keys or collection shape do not match the canonical structure |
| `TRANSLATION_TECHNICAL_FIELD_MUTATION` | A technical identifier or contract field was changed by translation   |

See [Bilingual Design Assets Design](docs/superpowers/specs/2026-07-13-bilingual-design-assets-design.md) for the field matrix, merge rules, and acceptance criteria.

## Huawei Application Architecture

```text
Product Family
└── Product
    └── Sub-product
        ├── Module: Celon Designer
        │   ├── com.huawei.celon.desiner
        │   ├── com.huawei.celon.specstudio
        │   ├── com.huawei.celon.policyhub
        │   └── com.huawei.celon.integrationgateway
        └── Module: Celon Runtime
            └── com.huawei.celon.runtime
```

The current mock hierarchy contains 10 Scope nodes: 1 product family, 1 product, 1 sub-product, 2 modules, and 5 application services. The minimum writable unit is an application service.

The default Agent, `specforge-default-agent`, has inherited read access to the four services in the Designer module and write access only to `com.huawei.celon.desiner`. It has no Runtime-module grant. A seed-only system actor receives Designer-module write access only inside the MCP seed child process.

An Agent may read different application services when its grants allow it, but each current dashboard, catalog, search, graph, and derived result is bound to exactly one selected service. An authorized multi-service comparison/aggregation view is a deferred feature; it must permission-filter every participating service before cross-service analysis.

## Exact Scope Isolation

Persistent rows are selected by exact `applicationServiceId` **and** exact `scopePath`. Prefix matching is not accepted. `DesignAsset`, `Proposal`, `ContextPack`, and `AssetLink` use:

- an internal UUID `dbId` primary key; and
- a unique logical identity of `(applicationServiceId, scopePath, id)`.

The same logical asset ID can therefore exist independently in multiple application services. Dashboard metrics, lists, details, governance, search, graph, impact analysis, and Context Packs use a scoped catalog and cannot silently merge sibling-service records.

## Locale Behavior

English is the default request locale. The global language switch writes `specforge-locale=en|zh` as a `SameSite=Lax` cookie, mirrors the selection in local storage, updates the document language, and refreshes server components. Server pages and APIs resolve the cookie; API callers may explicitly pass `?locale=en` or `?locale=zh`.

The language switch changes human-facing asset content and derived narratives. Technical fields and relationship codes remain unchanged.

## Scoped Derived Views

The Web and MCP layers build the following from the exact scoped PostgreSQL catalog:

- bilingual search that indexes canonical English and Chinese overlays;
- asset graph nodes and edges with scope-aware identity;
- localized governance reasons and remediation suggestions;
- proposal impact, implementation tasks, rollout/rollback guidance, and risks derived from the selected proposal;
- canonical English Context Packs with validated Chinese overlays; and
- localized Markdown/JSON rendering without translating technical structures.

MCP Context Pack generation persists the canonical bilingual pack in the same application-service scope. No derived reader may fall back to another service's built-in fixture.

## Seeded Content

`pnpm db:seed` launches the MCP server as a child process and writes through MCP tools only. The current deterministic inventory is:

| Application service                   | Persisted seed content                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| `com.huawei.celon.desiner`            | 32 design assets, 5 proposals, 1 Context Pack, 53 relationships |
| `com.huawei.celon.specstudio`         | 1 domain + 1 data model                                         |
| `com.huawei.celon.policyhub`          | 1 domain + 1 business rule                                      |
| `com.huawei.celon.integrationgateway` | 1 domain + 1 API + 1 event                                      |
| `com.huawei.celon.runtime`            | No seeded design content; used to verify permission boundaries  |

That is 45 bilingual asset/proposal/Context Pack payloads across four seeded services, plus 53 Designer relationships. The old partial-refund demo records are removed by a seed-only, exact-scope cleanup tool.

## PostgreSQL Setup And Migration

Prerequisites: Node.js 20+, Corepack/pnpm 9.15.4, and PostgreSQL with a database named `specforge`.

```env
DATABASE_URL="postgresql://admin:admin@localhost:5432/specforge?schema=public"
```

Fresh local setup:

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed
```

For an existing database that used globally keyed `id` columns, apply the checked-in migration before seeding:

```bash
pnpm db:generate
pnpm exec prisma migrate deploy
pnpm db:seed
```

The migration backfills `dbId`, `applicationServiceId`, and `scopePath`, moves primary keys to UUIDs, removes global logical-ID uniqueness, and adds exact composite unique constraints. Persistence startup also performs an idempotent compatibility check for legacy local schemas.

## MCP Server

Start the stdio server:

```bash
pnpm mcp:dev
```

Example client configuration:

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

Read tools require `applicationServiceId` and accept `locale`. Write tools require the exact `architectureScope` and a complete bilingual payload. Principal capabilities include asset/proposal/ADR/Context Pack upsert, asset links, scoped search/detail/graph, governance, impact analysis, Context Pack generation/export, and proposal workflow tools.

Scoped MCP resource templates use URIs such as:

```text
specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}
specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}/{id}
specforge://scopes/{applicationServiceId}/{locale}/graph
```

The MVP transport is stdio. Streamable HTTP and production OAuth/RBAC are not implemented.

## AI Provider Boundary

`packages/core/src/ai` defines one provider interface for Proposal, ADR, business-rule, test-suggestion, and Agent Context Pack draft generation. `MockAIProvider` is deterministic and active for the MVP. `OpenAIProvider` is a reserved boundary and intentionally makes no real model call and requires no API secret.

This AI abstraction does not bypass localization, Scope, MCP persistence, or governance validation.

## Start And Verify

```bash
pnpm dev
pnpm mcp:dev
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm exec prisma validate
pnpm --filter @specforge/mcp-server smoke
```

Open [http://localhost:3000](http://localhost:3000). The selected application service is carried in the `scope` query parameter and restored from the validated application-service cookie; the locale is restored independently from `specforge-locale`.

## Specifications

- [Product and architecture specification](docs/specforge-design-center-spec.md)
- [Bilingual Design Assets Design](docs/superpowers/specs/2026-07-13-bilingual-design-assets-design.md)
- [Huawei application architecture scope design](docs/superpowers/specs/2026-07-12-huawei-architecture-scope-design.md)
- [Agent-service workspace design](docs/superpowers/specs/2026-07-13-agent-service-workspace-design.md)
- [Strict application-service isolation plan](docs/superpowers/plans/2026-07-13-strict-application-service-isolation.md)
- [Product backlog](docs/TODO.md)
