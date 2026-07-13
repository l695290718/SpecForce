# SpecForge Bilingual Design Assets Design

**Date:** 2026-07-13  
**Status:** Approved for implementation planning

## 1. Objective

All human-facing content in every SpecForge design asset must support Chinese and English display through the existing global language switch.

English is the canonical source of truth. Chinese is a required display translation. Technical identifiers and executable contract structures remain language-neutral and must never be duplicated or translated.

Asset content remains MCP-managed. This phase does not add browser-based asset editing.

## 2. Design Principles

1. One asset identity, one technical contract, and one relationship graph.
2. English semantic content is canonical and remains in the existing asset fields.
3. Chinese semantic content is stored as a typed overlay in `localizedContent.zh`.
4. Every required human-facing field must have both English and Chinese content before an MCP write succeeds.
5. Application-service scope isolation remains unchanged and applies equally to both languages.
6. All readers use one localization service; pages must not implement asset-specific merge logic.
7. Translation must not change IDs, paths, schema keys, field names, topics, codes, state identifiers, or relationship targets.

## 3. Storage Model

The persisted asset remains a single JSON payload. No translation table and no duplicate language-specific asset row are introduced.

```ts
interface BaseAsset {
  id: string;
  name: string;          // Canonical English
  description: string;   // Canonical English
  localizedContent: {
    zh: LocalizedContent;
  };
}
```

The existing indexed `DesignAsset.name` and `DesignAsset.description` columns continue to contain canonical English values. Chinese search content is read from the persisted payload.

Existing proposal payloads that contain `localizedContent.en` are normalized by copying their English content to the canonical top-level fields. New writes store only `localizedContent.zh`.

## 4. Localizable Field Registry

The core package owns an explicit registry keyed by `AssetType`. Each registry entry defines:

- the required English semantic fields;
- the required Chinese overlay fields;
- optional semantic fields;
- stable keys for nested collections;
- technical fields forbidden in the translation overlay;
- localization and structural validation functions.

The public core operations are:

```ts
localizeAsset(assetType, asset, locale)
validateAssetLocalization(assetType, asset)
```

`localizeAsset` returns canonical fields for English and a safe merged view for Chinese. `validateAssetLocalization` returns stable issue codes and field paths and is used by every MCP write path.

## 5. Asset Coverage

| Asset type | Human-facing localized content | Language-neutral content examples |
| --- | --- | --- |
| Domain model | name, description, capability labels, glossary display terms, entity and service descriptions | id, code, bounded-context code, ownership identity |
| Data model | name, description, field display name, meaning, constraint narrative, relationship and lifecycle narrative | field name, data type, table name, nullability, schema keys |
| API contract | name, description, authentication, idempotency and compatibility explanations | HTTP method, path, request/response schema, error code |
| Event contract | name, description, trigger, retry, dead-letter and compatibility explanations | topic, event type, schema, idempotency key |
| Business rule | name, description, condition, action, exception and examples | id, rule code, asset references, severity enum |
| State machine | name, description, state/event display labels, guard/action descriptions and failure handling | state/event codes, transition endpoints, emitted event code |
| Integration contract | name, description, mapping, SLA, retry, fallback and circuit-breaker explanations | source/target IDs, protocol identifiers |
| Quality requirement | name, description, target, measurement and verification method | category and priority enums, target asset ID |
| Observability design | name, description, alert/dashboard descriptions, runbook and SLO narrative | metric/log/trace identifiers, target asset ID |
| ADR | name, title, context, decision, alternatives, consequences and constraints | status enum, related asset IDs |
| Proposal | name, title, background, goal, non-goal, scope, changes, risks and rollout/rollback plans | status enum, impacted asset IDs |
| Context Pack | name, summary, constraints, instructions and generated Markdown | proposal ID, target agent ID, included asset IDs |

### 5.1 Nested Structures

Nested translations use stable technical keys rather than array indexes wherever the domain already has a key. For example, translated data-field content is associated by `fieldName`; translated state labels are associated by state code; translated transition narratives are associated by a composite transition identity.

Plain narrative arrays are translated as complete arrays and must preserve element count and ordering. Relationship labels are resolved from the referenced asset at render time instead of being translated independently.

## 6. MCP Write Contract

All asset write tools, including `upsert_design_asset` and `upsert_proposal`, invoke the core localization validator before persistence.

### 6.1 Required Behavior

- New and updated payloads are complete asset snapshots.
- Canonical English fields and required Chinese fields must both be present and non-empty.
- Chinese nested entries must correspond to canonical technical keys.
- Translation overlays may contain only fields allowed by the asset-type registry.
- The persisted scope is still derived from the authorized MCP actor and requested architecture scope.
- Validation happens before the database upsert, so an invalid payload cannot partially update an asset.

### 6.2 Stable Errors

Validation failures include a machine-readable code, asset type, asset ID, and field path.

Primary codes:

- `ASSET_TRANSLATION_REQUIRED`
- `CANONICAL_CONTENT_REQUIRED`
- `TRANSLATION_FIELD_NOT_ALLOWED`
- `TRANSLATION_STRUCTURE_MISMATCH`
- `TRANSLATION_TECHNICAL_FIELD_MUTATION`

### 6.3 MCP Reads and Search

Raw asset reads return the canonical asset plus its Chinese overlay. Rendered summaries and search operations accept an optional locale. Search matches canonical English and Chinese semantic content, while returned names and summaries follow the requested locale.

## 7. Web Display Architecture

The global language switch controls UI messages and asset content together.

- Locale persistence moves from localStorage-only state to a cookie plus React context.
- Server-rendered routes read the locale cookie to produce the correct initial HTML.
- Switching locale refreshes the current route while preserving application-service scope, asset ID, query, filters, and graph state.
- Asset lists, details, dashboard activity, proposals, ADRs, Context Packs, relationship graphs, impact results, Markdown exports, and previews all use the core localizer.
- Technical blocks such as OpenAPI, JSON Schema, paths, topics, codes, and field names render unchanged.
- Browser asset-editing entry points are hidden or presented as MCP-managed; they must not provide an alternate write path.

Governance results use stable rule codes and bilingual message templates. Reasons and suggestions are rendered in the selected locale rather than persisted as unrelated translated strings.

## 8. Missing Translation Behavior

After migration, MCP writes reject incomplete bilingual content. The web reader still fails safely for legacy or corrupt data:

1. render canonical English for the missing field;
2. record the missing field path;
3. expose a failed bilingual-completeness governance result;
4. do not crash the list, dashboard, graph, or detail page.

This fallback is operational protection, not an accepted steady state.

## 9. Scope Isolation

Localization does not create a new data-access dimension. The authorized application-service scope is resolved before localization.

- Asset counts remain scope-specific.
- Search examines only assets visible in the selected scope.
- Graph labels are localized only after scoped assets and relationships are loaded.
- Locale switching never changes the selected application service.
- A translated asset cannot reference or reveal an unauthorized asset from another scope.

## 10. Migration

The migration is performed through MCP writes rather than direct PostgreSQL mutation.

1. Inventory all assets per application-service scope.
2. Report missing canonical and Chinese semantic fields by asset type and path.
3. Normalize proposal English overlays into canonical fields.
4. Add complete Chinese overlays for every asset type.
5. Upsert each complete asset through its MCP write boundary.
6. Re-read through MCP and compare asset counts, relationships, scopes, and localization completeness.
7. Enable mandatory bilingual validation for normal writes.

The migration command is idempotent. Re-running it must not duplicate assets, links, proposals, or Context Packs.

## 11. Verification Strategy

### Core

- Localization and validation tests for every asset type.
- Missing English, missing Chinese, unknown translated field, and technical-key mutation tests.
- Nested-key and narrative-array structural matching tests.
- English and Chinese rendering tests.

### MCP

- Successful bilingual create and update tests.
- Stable validation error tests with exact field paths.
- Atomic rejection tests proving the previous persisted asset is unchanged.
- Locale-aware read, search, and summary tests.
- Scope authorization and isolation regression tests.

### Web

- Cookie-based server-rendered locale tests.
- Language switch tests that preserve scope, route, search, and filters.
- Dashboard, list, detail, graph, impact analysis, export, and governance rendering tests.
- Technical contract invariance tests in both languages.
- Safe fallback tests for deliberately incomplete legacy payloads.

### Migration and Release

- Migration idempotency and before/after inventory comparison.
- Type checking, unit tests, production build, and browser smoke tests.
- Chinese and English regression passes across multiple application-service scopes.

## 12. Acceptance Criteria

1. Every persisted design asset has complete canonical English and required Chinese semantic content.
2. MCP rejects any new or updated asset that does not meet bilingual completeness rules.
3. One global switch changes both UI messages and all human-facing asset content.
4. No technical identifier or executable schema changes between locales.
5. Locale selection survives refresh and does not reset application-service scope.
6. Dashboard counts, design assets, search, graph, and impact analysis remain fully scope-isolated.
7. No browser editing path can bypass MCP localization validation.
8. Migration is MCP-based, auditable, and idempotent.
