# Huawei Application Architecture Scope Design

## Goal

Make SpecForge a Huawei-application-architecture-aware design center. All design
data is scoped to an application service at minimum, persisted through the MCP
write boundary, and visible or writable only when the active actor has the
corresponding scope permission.

The initial active application service is `com.huawei.celon.desiner`.

## Scope Model

The architecture hierarchy is a rooted tree:

1. Product family
2. Product
3. Sub-product
4. Module
5. Application service

Each node has a stable id, code, name, description, owner, parent id, level, and
materialized `scopePath`. The seed contains one Huawei-themed tree, including the
current application service. Names and owners outside the supplied service id are
mock data and can be replaced without changing the model.

Assets, proposals, context packs, and asset links carry an architecture scope.
Their minimum writable scope is an application service. A stored scope includes
the service id and its canonical path, so filtering and impact analysis do not
need recursive client-side traversal.

## Authorization

The active mock actor has grants containing a scope id and an action: `read` or
`write`. Grants inherit down the scope tree. A grant at a module therefore applies
to every application service under that module.

The default mock actor has read/write access to `com.huawei.celon.desiner` and
read access to its module. Its visible scope picker contains only scopes for
which it has read access. A write is allowed only when the actor has an inherited
write grant for the target application service.

Permissions are evaluated in the shared core authorization service. Web request
helpers and MCP tools invoke this same service, preventing the UI from exposing
data that MCP would reject, or vice versa.

## MCP Boundary

All mutations remain MCP-native. `upsert_design_asset`, proposal/context-pack
writes, and `link_assets` accept an application-service scope or resolve it from
the actor's active service. They validate that it is an application service and
that the actor has write permission. All read tools filter by the actor's allowed
scope paths and return no forbidden assets.

Cross-scope links are allowed only when the actor can read both endpoints and
write the source service. Impact analysis aggregates affected scopes from the
stored paths in addition to domains and contract relationships.

## Web Experience

The application shell includes an architecture-scope picker. It shows the active
product-family-to-service path and allows choosing permitted scopes. Asset lists,
details, graph nodes, proposals, context packs, dashboard counts, and impact
analysis use the selected scope. A service-level selection is the only context
that enables create/edit actions.

The current default selection is `com.huawei.celon.desiner`. Read-only ancestors
are selectable for aggregate browsing; their child service assets are visible but
their edit controls remain unavailable.

## Persistence and Compatibility

PostgreSQL gets normalized architecture-scope and actor-grant tables plus indexed
scope fields on persisted assets, proposals, context packs, and links. Existing
seeded records are assigned to the default application service during reseeding.
The payload retains architecture scope as well, allowing MCP JSON and database
records to remain consistent.

After the MCP migration seed completes, `applicationServiceId` and `scopePath`
are mandatory for every scoped record. There is no runtime fallback to legacy
null-scope data. All Web helpers, API routes, MCP tools, resources, graph
queries, dashboard totals, governance checks, and searches accept an explicit
scope context; a missing or unauthorized context is rejected rather than
silently defaulting to the Designer service.

## Error Handling

Unknown scope ids, non-service write targets, and unauthorized reads/writes return
a stable authorization error through MCP and a suitable forbidden/not-found state
through Web. Forbidden data is not included in list counts, graph metadata, or
impact-analysis summaries.

## Tests and Acceptance Criteria

- Core tests cover path inheritance, service-only write validation, and denied
  access.
- MCP tests prove reads are scoped and writes cannot target unauthorized services.
- Web data helpers filter each supported artifact type by selected scope.
- Seed data includes the Huawei hierarchy and assigns all current design assets to
  `com.huawei.celon.desiner`.
- Existing typecheck, lint, and MCP smoke tests still pass.
