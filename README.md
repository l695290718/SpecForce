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

## WebGL 3A Graph Explorer

The 3A workspace provides three bounded views for one exact application-service Scope:

- `Overview` shows precomputed cluster summaries and is the default Graph view.
- `Explore` loads a focused neighborhood and follows explicit continuation instead of fetching the whole Scope.
- `Impact` ranks upstream and downstream candidates with deterministic, policy-versioned explanations.

Open the graph view with:

```text
http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner&tab=architecture&mode=graph&graphView=overview
```

The API initially caps Overview at 250 nodes and 500 edges. The browser store retains at most 2,000 nodes and 5,000 edges. Sigma.js/WebGL renders the bounded Graphology store when WebGL is available; browsers without WebGL or with a lost context receive the same graph as an accessible semantic list. PostgreSQL remains authoritative, while graph summaries and impact indexes are derived projections. A graph database is optional and must satisfy the same exact-Scope provider contract.

Every graph request carries the subject, tenant, application service, full Scope path, Baseline, Projection, operation, filters, policy version, and expiry. The workspace never silently merges sibling services. If a derived analysis is unavailable, the UI keeps the exact-Scope catalog fallback and reports the bounded degraded mode.

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

Read tools require `applicationServiceId` and accept `locale`. Write tools require the exact `architectureScope` and a complete bilingual payload. Principal capabilities include asset/proposal/ADR/Context Pack upsert, asset links, scoped search/detail/graph, governance, impact analysis, Context Pack generation/export, and proposal workflow tools. `search_design_assets` supports bounded `pageSize`/opaque `cursor`; `query_asset_links` and `query_asset_graph` are bounded read paths, and graph responses report `partial` with a truncation reason.

For an existing database, rebuild the bilingual summary projection after deploying the read-model change:

```bash
pnpm design-read:rebuild
```

The command is derived-data maintenance only. It preserves authored PostgreSQL rows and defaults to `com.huawei.celon.desiner`; set `SPECFORGE_APPLICATION_SERVICE_ID` to rebuild another authorized application service.

Scoped MCP resource templates use URIs such as:

```text
specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}
specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}/{id}
specforge://scopes/{applicationServiceId}/{locale}/graph
```

The MVP transport is stdio. Streamable HTTP and production OAuth/RBAC are not implemented.

### System Knowledge Readiness Gate

Agents that need to understand an existing system must use the readiness-gated MCP path for the exact application-service Scope `com.huawei.celon.desiner`:

```text
1. evaluate_system_knowledge_readiness
2. read_system_knowledge
3. consume every signed cursor page before describing a complete result
```

The supported Profiles are `ARCHITECTURE_OVERVIEW`, `CHANGE_ASSESSMENT`, and `RUNTIME_DIAGNOSIS`. `SELF_CONTAINED` means the requested knowledge is sufficient at the returned `asOf` boundary; `SOURCE_CHECK_REQUIRED` means the Agent must not treat SpecForge as the sole source yet; `BLOCKED` means a conflict, reconciliation failure, authorization failure, or policy violation must be resolved first. Denials return no asset or relationship bodies.

The receipt and cursor bind the exact Scope, caller grant, query, policy, catalog version, and source waterlines. PostgreSQL is authoritative for authored facts, observations, policies, receipts, and relationship events; graph stores are derived projections only. Set `SPECFORGE_KNOWLEDGE_READ_ENFORCEMENT=enforce` to reject ordinary legacy low-level reads. Explicit `knowledge:diagnostic` is reserved for governed diagnosis and is audited. `RUNTIME_DIAGNOSIS` remains not ready until policy-approved runtime evidence exists.

**系统知识可信读取门禁：** 面向存量系统理解的 Agent 必须先调用 `evaluate_system_knowledge_readiness`，再调用 `read_system_knowledge`，并耗尽全部签名游标页面后才能描述完整结果。`SELF_CONTAINED` 只表示在返回的 `asOf` 边界内足够；`SOURCE_CHECK_REQUIRED` 表示仍需检查来源；`BLOCKED` 表示冲突、对账、授权或策略问题必须先处理。收据和游标绑定精确 Scope、调用授权、查询、策略、目录版本和来源水位；拒绝时不返回资产或关系正文。PostgreSQL 是权威存储，图数据库仅是派生投影。生产扫描器、持续同步、跨 Scope 聚合、Web 策略管理和自动修复仍未交付。

## Design-Fact Governance

Baseline architectural decisions are recorded in `docs/adr/` and mapped in `docs/design-facts/baseline-manifest.json`. Use the local PostgreSQL connection before running:

```bash
pnpm design-facts:sync
pnpm design-facts:check
```

### Designer 3A v7 Candidate Flow

3A expansion is explicit and MCP-governed. An authorized Agent first submits a bounded candidate JSON file through `analyze_3a_architecture_candidates`; the service records the source Baseline, catalog digest, relationship version, and design-context digest. Candidate revisions are not authoritative until ReviewBundle approval, promotion, reconciliation, and immutable Baseline publication.

The repository provides MCP-only orchestration commands:

```bash
pnpm designer-3a:v7:analyze -- --candidate-file path/to/candidate.json --source-baseline knowledge-baseline:designer:3a:v6 --session design-change-session:<id> --intent "Expand Designer 3A semantics" --idempotency-key designer-3a-v7:<run>
pnpm designer-3a:v7:publish -- --candidate-set architecture-fact-batch:<id> --review-bundle knowledge-review-bundle:<id> --decision knowledge-promotion-decision:<id> --stream working-stream:designer:3a --session design-change-session:<id> --baseline knowledge-baseline:designer:3a:v7
pnpm designer-3a:v7:verify -- --candidate-set architecture-fact-batch:<id> --baseline knowledge-baseline:designer:3a:v7 --v6-baseline knowledge-baseline:designer:3a:v6
```

The Candidate Set is bounded at 6 BIZ, 12 SYS, and 5 TECH units. Every SYS unit must realize BIZ, every TECH unit must be used by SYS, and one primary asset cannot be assigned to multiple units. A stale Candidate Set must be re-analyzed. v6 remains the fallback Baseline when v7 publication is not converged.

`design-facts:sync` writes the baseline ADR records through the MCP stdio boundary using each manifest entry's exact scope. `design-facts:check` reads them back through scoped MCP tools and exits non-zero for missing, mismatched, out-of-scope, or blocked records. A failed synchronization or check blocks completion under `AGENTS.md`.

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

Open [http://localhost:3000](http://localhost:3000) for local development. For the supported Docker deployment, use [http://localhost:3010](http://localhost:3010). The selected application service is carried in the `scope` query parameter and restored from the validated application-service cookie; the locale is restored independently from `specforge-locale`.

## Legacy Baseline Discovery

Phase 1 provides a signed, portable Node scanner by default, with the native Go scanner retained as an optional accelerator, and an Agent-mediated MCP flow for turning an existing repository into an exact-Scope, reviewed Baseline v1. Scanner releases use an explicit Ed25519 trust root with no trust-on-first-use; local batches are resumable and hash-chained, while PostgreSQL remains authoritative for Sessions, observations, review decisions, ChangeSets, and Baselines.

第一阶段默认提供签名的跨平台 Node 扫描器，原生 Go 扫描器保留为可选加速器，并通过 Agent 中介的 MCP 流程将存量仓库转换为精确 Scope、经评审的 Baseline v1。扫描器使用显式 Ed25519 信任根，禁止首次使用自动信任；本地批次支持哈希链断点续传，PostgreSQL 对 Session、观察、评审决策、ChangeSet 和 Baseline 保持权威。

```powershell
# Stage-level verification; DATABASE_URL is required for PostgreSQL integration.
pnpm legacy-baseline:verify

# Build one native signed scanner artifact. The private key comes from a secret.
./scripts/build-scanner-release.ps1 -Version 2.0.0 -SigningKeyId corp-scanner-2026-01 `
  -ArtifactBaseUri https://artifacts.example.com/specforge/scanner
```

See [Legacy Baseline Discovery Operations](docs/operations/legacy-baseline-discovery.md) for trust installation, Session and Agent flow, resume, T0-T3 review, promotion, reconciliation, publication, revocation, rotation, cleanup, audit, and deferred production capabilities.

## Provider-Neutral Repository Scan Skill

Use [the repository scan Skill](skills/specforge-repository-scan/SKILL.md) to import an existing codebase through the same governed MCP boundary from Codex, Claude Code, or OpenCode. Every run must provide `repositoryPath`, `applicationServiceId`, and `scopePath`; the Skill never infers the target Scope. It creates deterministic local observations, resumable policy-pinned batches, bilingual semantic candidates, and review-ready evidence. It never writes accepted assets or Baselines directly.

See [Agent integration](docs/agent-integration/repository-scan-skill.md) for client setup and [the blocker reference](skills/specforge-repository-scan/references/blockers.md) for remediation.

## Single-Host Docker Deployment

Deploy the Web console, PostgreSQL, direct first-startup Bootstrap, Knowledge Projector, and governed 3A Bootstrap on one host with Docker. On a fresh empty database, direct Bootstrap applies the versioned initial catalog and canonical relationship events once; the governed 3A Bootstrap then invokes MCP to create and publish the exact-Scope baseline projection before Web starts. After that, business design changes still use MCP. PostgreSQL remains private to the Compose network; MCP stays a client-side stdio process and is not deployed as a network container.

```powershell
# Windows: start Docker Desktop first and wait until the Docker Engine is ready.
Copy-Item deploy/.env.example deploy/.env
# Set a strong POSTGRES_PASSWORD and deployment-only 3A cursor secret in deploy/.env.
.\deploy\scripts\start.ps1
.\deploy\scripts\status.ps1
```

`start.ps1` is the supported deployment entrypoint. It validates Docker readiness, starts the Web, PostgreSQL, Bootstrap, 3A Bootstrap, and Knowledge Projector services, and waits for health checks. It does not start Docker Desktop itself. On Linux, start the Docker daemon before running it. The script-managed Docker Web uses port `3010`; `pnpm dev` on port `3000` is a separate local development process.

The default Docker Web port is `3010`; local development remains on `3000`. Stop the deployment with `.\deploy\scripts\stop.ps1`; the PostgreSQL volume is preserved. See [Single-Host Docker Compose Operations](docs/operations/single-host-docker-compose.md) and [deployment operations](deploy/README.md) for external PostgreSQL mode, configuration checks, and recovery.

See [Single-Host Docker Compose Operations](docs/operations/single-host-docker-compose.md) for upgrades, backup/restore, verification, and external PostgreSQL mode.

## Specifications

- [Product and architecture specification](docs/specforge-design-center-spec.md)
- [Bilingual Design Assets Design](docs/superpowers/specs/2026-07-13-bilingual-design-assets-design.md)
- [Huawei application architecture scope design](docs/superpowers/specs/2026-07-12-huawei-architecture-scope-design.md)
- [Agent-service workspace design](docs/superpowers/specs/2026-07-13-agent-service-workspace-design.md)
- [Strict application-service isolation plan](docs/superpowers/plans/2026-07-13-strict-application-service-isolation.md)
- [Product backlog](docs/TODO.md)
