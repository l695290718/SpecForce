# ADR-0030: Declarative REST/JSON Catalog Connector

- Status: Accepted for the connector foundation
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`

## Decision

CMDB and aggregated runtime-service catalogs use one declarative connector profile. A profile may define only an HTTPS endpoint, JSON Pointers, a stable ID, field mappings, a cursor parameter, operation/deletion fields, and bounded page limits. Script, module, shell, URL-fetch, and arbitrary expression fields are rejected.

The connector emits `cmdb-catalog` or `runtime-service-catalog` candidates with mapping/profile digests and explicit pagination coverage. It never infers deletion from an incomplete page; source tombstones must be explicit and the v2 persistence boundary remains responsible for complete-snapshot semantics.

## Evidence

- `pnpm --filter @specforge/connector-worker test`: 12 passed.
- `pnpm exec tsc -p apps/connector-worker/tsconfig.json --noEmit`: passed.

## Deferred

MCP operation exposure, candidate promotion, runtime evidence retention enforcement, and design-fact synchronization remain subsequent work. The current MCP tool surface does not expose the required close/write operation.
