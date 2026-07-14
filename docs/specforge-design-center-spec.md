# SpecForge Design Center Specification

**Product:** SpecForge Design Center / 智设中枢

**Architecture:** MCP-first, application-service scoped, English-canonical bilingual design center

**Bilingual contract:** [SpecForge Bilingual Design Assets Design](superpowers/specs/2026-07-13-bilingual-design-assets-design.md)

## 1. Product Positioning

SpecForge centralizes product, domain, data, API, event, business-rule, state-machine, integration, quality, observability, ADR, Proposal, and Agent Context Pack knowledge as structured design assets.

- Humans use a read-oriented Web Console to inspect one authorized application service at a time.
- AI Coding Agents use MCP as the primary design read/write protocol.
- PostgreSQL is the durable, scope-aware source for runtime content.
- `@specforge/core` supplies shared localization, governance, graph, impact, Context Pack, authorization, and AI Provider contracts.

The Web Console is not a parallel authoring channel. Browser create/edit routes redirect to read views; durable design changes go through validated MCP operations.

## 2. Goals

- Make the application service the minimum writable architecture unit.
- Keep every normal dashboard, list, detail, search, graph, and derived result isolated to one exact application-service Scope.
- Allow an Agent to read or write a service only when its inherited Scope grants permit it.
- Require canonical English and complete Chinese human-facing content for every new or updated asset.
- Keep technical identifiers and executable contract structures language-neutral.
- Generate scoped governance, impact analysis, and Context Packs without global seed fallback.
- Persist deterministic self-design and sibling-service fixtures through MCP.
- Keep the MVP locally runnable with PostgreSQL and stdio MCP.

## 3. Non-Goals

- Browser-based asset authoring is not supported in this phase.
- An aggregate or comparison dashboard spanning multiple application services is not implemented.
- Streamable HTTP transport, OAuth, production RBAC, and multi-tenant deployment are not implemented.
- `OpenAIProvider` does not call a real model.
- Raw database access and arbitrary code execution are not exposed through MCP.
- General delete operations are not exposed. Seed cleanup is process-gated and exact-scope only.
- The MVP does not translate technical identifiers, schemas, relation codes, paths, or protocol structures.

## 4. System Architecture

```text
AI Agent -> MCP stdio -> apps/mcp-server -> packages/core -> PostgreSQL
Human    -> Next.js   -> apps/web --------------------------^
```

| Layer       | Contract                                                      |
| ----------- | ------------------------------------------------------------- |
| Web         | Read-oriented, locale-aware, one selected application service |
| MCP         | Agent protocol, validation and persistent mutation boundary   |
| Core        | Pure/shared asset localization and derived-view services      |
| Persistence | Exact Scope predicates and scope-aware logical identity       |

App layers may compose Core services but must not duplicate asset merge rules or silently use global fixture data for scoped requests.

## 5. Huawei Architecture Scope

The mock hierarchy contains:

| Level               | Count | Current nodes                                                   |
| ------------------- | ----: | --------------------------------------------------------------- |
| Product family      |     1 | Huawei                                                          |
| Product             |     1 | Celon                                                           |
| Sub-product         |     1 | Celon Platform                                                  |
| Module              |     2 | Celon Designer, Celon Runtime                                   |
| Application service |     5 | Designer, Spec Studio, Policy Hub, Integration Gateway, Runtime |

The current service ID supplied by the product owner remains `com.huawei.celon.desiner` (including the existing spelling). Its canonical Scope path is:

```text
pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
```

The same path pattern applies to the three sibling services in the Designer module. `com.huawei.celon.runtime` is under a separate module and is present to verify access boundaries.

## 6. Scope Isolation And Identity

All persisted `DesignAsset`, `Proposal`, `ContextPack`, and `AssetLink` operations require exact equality on both:

```text
applicationServiceId + scopePath
```

Each table uses an internal UUID `dbId` as the primary key and a unique logical identity:

```text
(applicationServiceId, scopePath, id)
```

Consequences:

- two services may store the same logical `id` without collision;
- a near-prefix `scopePath` is not readable or deletable as the selected Scope;
- payload Scope metadata is checked against trusted row columns;
- links, graph nodes, and graph edges preserve service identity;
- metrics and derived output are computed from the selected service catalog only.

The checked-in PostgreSQL migration upgrades legacy globally keyed tables without discarding historical rows. Legacy empty Scope values are assigned to the Designer service before exact composite constraints are applied.

## 7. Agent Permission Model

Architecture authorization uses explicit read/write grants on hierarchy nodes. A grant is inherited only by descendants and does not imply the other action.

The default mock Agent has:

- Designer-module read access, covering Designer, Spec Studio, Policy Hub, and Integration Gateway;
- application-service write access only to `com.huawei.celon.desiner`; and
- no grant for the Runtime module.

The seed actor has module-level read/write access only while `SPECFORGE_MCP_SEED=1` in the MCP seed child. The cleanup tool is not registered for normal MCP clients.

MCP tool metadata declares capability permissions such as `asset:read`, `asset:write`, `proposal:read`, `proposal:write`, `context-pack:generate`, `governance:run`, `adr:write`, and `graph:read`. The MVP capability policy is currently permissive; architecture Scope grants are the enforced data boundary. OAuth/RBAC remains future work.

An Agent may read multiple services if authorized, but there is currently no combined view. The deferred **authorized multi-service comparison** feature must filter each participating service by the Agent's grants and must never turn the default dashboard into a global aggregate.

## 8. Bilingual Asset Model

English root fields are canonical and required. Chinese human-facing content is a typed overlay:

```ts
type LocalizedContent<TZh> = {
  zh: TZh;
};
```

The concrete overlay type differs by asset type. Examples include descriptions and glossary values for domains, field display metadata for data models, narrative policy text for APIs/events, state and transition labels for state machines, and full human-facing sections for Proposals and Context Packs.

Technical invariants include IDs, codes, Scope, domain links, table/schema keys, HTTP methods and paths, topics, event types, enum values, state/event codes, relationship types, timestamps, and structured protocol values. These are neither duplicated nor translated.

### Validation Errors

Every MCP write validates localization before database mutation. Failures expose stable machine-readable fields: `code`, `assetType`, `assetId`, and `path`.

| Code                                   | Contract                                               |
| -------------------------------------- | ------------------------------------------------------ |
| `ASSET_TRANSLATION_REQUIRED`           | Required `localizedContent.zh` content is absent       |
| `CANONICAL_CONTENT_REQUIRED`           | Required English canonical content is absent           |
| `TRANSLATION_FIELD_NOT_ALLOWED`        | Overlay attempts to provide a non-localizable field    |
| `TRANSLATION_STRUCTURE_MISMATCH`       | Overlay keys/shape do not match canonical content      |
| `TRANSLATION_TECHNICAL_FIELD_MUTATION` | Translation changes a language-neutral technical value |

Governance rule `ASSET_BILINGUAL_COMPLETENESS` reports these errors using localized reason and suggestion text while preserving the stable code and field path.

## 9. Locale Resolution

The request locale is `en` or `zh`; invalid or missing values resolve to `en`.

- The Web language switch writes the `specforge-locale` cookie for one year with `Path=/` and `SameSite=Lax`.
- It mirrors the value to local storage, updates the HTML language, then refreshes the router so server-rendered content changes with client UI text.
- Server pages read the locale cookie.
- API routes accept an explicit `locale` query parameter, otherwise they read the cookie.
- Application-service selection and locale selection are independent and preserved separately.

Localization composes a presentation view. It does not mutate canonical stored content.

## 10. Web Console Contract

The Web Console provides:

- a per-Agent, per-application-service dashboard;
- scoped asset, Proposal, and Context Pack lists/details;
- bilingual search across English canonical text and Chinese overlays;
- governance results and remediation details;
- relationship graph filtering with scope-aware links;
- proposal impact and Context Pack views; and
- a global Chinese/English switch.

Create/edit/new Proposal URLs redirect to their scoped read destinations and preserve query parameters. The browser does not expose persistent asset authoring forms. Read APIs resolve exact Scope and locale before accessing PostgreSQL.

## 11. Scoped Derived Services

Derived services receive an explicit scoped catalog instead of reading the built-in seed store:

- **Search:** matches both English and Chinese semantic content, then localizes display output.
- **Graph:** uses scoped node identities so duplicate logical IDs across services do not merge; relationship codes remain canonical.
- **Governance:** validates selected persisted content and localizes rule names, reasons, and suggestions.
- **Impact:** derives impacted assets, implementation tasks, risks, rollout, and rollback from the selected scoped Proposal.
- **Context Pack:** generates canonical English plus a validated Chinese overlay, binds the exact Scope, and persists through MCP.
- **Markdown/JSON:** localizes human-facing narratives without changing technical blocks.

Missing or malformed localized content is an error. Explicit scoped catalogs do not fall back to unrelated seed assets.

## 12. MCP Contract

Current transport: stdio using the official TypeScript MCP SDK.

Read operations require `applicationServiceId`; locale-aware operations accept `en` or `zh`. Persistent writes require an exact `architectureScope` and complete bilingual payload.

Principal tools:

- `upsert_design_asset`, `upsert_proposal`, `upsert_context_pack`, `link_assets`;
- `search_design_assets`, `get_asset_detail`, `get_asset_graph`;
- `analyze_proposal_impact`, `run_governance_checks`;
- `generate_context_pack`, `export_context_pack`; and
- scoped `create_proposal`, `update_proposal`, and `create_adr` workflow tools.

Scoped resources:

```text
specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}
specforge://scopes/{applicationServiceId}/{locale}/assets/{assetType}/{id}
specforge://scopes/{applicationServiceId}/{locale}/graph
```

Legacy static resource names remain compatibility entry points, but scoped tools/templates are the authoritative runtime path.

## 13. MCP-native Seed Inventory

Before opening the MCP child, the seed validates every canonical/Chinese payload and prints deterministic counts. It then performs exact-scope, idempotent upserts through MCP and fails on any tool error.

| Service             | Assets / records                                        |
| ------------------- | ------------------------------------------------------- |
| Designer            | 32 design assets, 5 Proposals, 1 Context Pack, 53 links |
| Spec Studio         | Domain + data model                                     |
| Policy Hub          | Domain + business rule                                  |
| Integration Gateway | Domain + API + event                                    |
| Runtime             | No content fixture                                      |

The bilingual inventory contains 45 payloads across four services. The seed removes legacy partial-refund IDs only through its process-gated cleanup tool and only within the exact Designer Scope.

The self-design content includes the implemented strict-isolation, Agent workspace, MCP-native seed, and bilingual-assets Proposals; MCP-first and English-canonical ADRs; bilingual governance rules; API/data/event/state-machine contracts; and their relationship graph.

## 14. PostgreSQL Operations

Local connection example:

```env
DATABASE_URL="postgresql://admin:admin@localhost:5432/specforge?schema=public"
```

Fresh schema:

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
```

Legacy schema migration:

```bash
pnpm db:generate
pnpm exec prisma migrate deploy
pnpm db:seed
```

`pnpm db:seed` is MCP-native; it does not directly upsert design content with Prisma. Re-running it is expected to preserve counts through stable scoped identities.

## 15. AI Provider Boundary

`AIProvider` supports five draft-generation capabilities:

- Proposal;
- ADR;
- business rule;
- test suggestions; and
- Agent Context Pack.

`MockAIProvider` returns deterministic local output and is the usable MVP provider. `OpenAIProvider` reserves the interface for a future real integration and currently performs no network/model request. Provider output must still pass the same localization, Scope, MCP persistence, and governance contracts before becoming design-center data.

## 16. Audit And Security

- MCP inputs are validated with Zod and localization validators.
- Architecture Scope grants are checked independently from tool capability metadata.
- Client errors are sanitized; seed calls fail fast on `isError`.
- Raw database access and arbitrary code execution are not MCP capabilities.
- Seed elevation is process-local; seed cleanup is unavailable to normal clients.
- MCP calls pass through the audit wrapper. Durable audit persistence remains an extension point and must not be described as complete production auditing.

## 17. Start And Verification

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

PostgreSQL verification can additionally group rows by `applicationServiceId` and confirm that the same logical ID can be stored independently under two exact Scope identities.

The MCP smoke covers scoped resources/tools, localized graph output, export, missing Scope rejection, and unauthorized Scope rejection. Browser verification should switch both service and locale and confirm independent dashboard counts, assets, governance, graph, Proposal, and Context Pack output.

## 18. Roadmap

Near-term but not implemented:

- authorized multi-service comparison and impact views;
- production OAuth/RBAC replacing the permissive capability policy;
- durable audit-log persistence and operational retention policy;
- Streamable HTTP transport;
- real OpenAI Provider integration;
- richer import pipelines for OpenAPI, AsyncAPI, database schemas, and repositories; and
- CI governance gates.
