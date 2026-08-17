# ADR-0028: PostgreSQL Schema Observation Adapter

- Status: Accepted for the connector foundation
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`

## Decision

The first source adapter observes PostgreSQL metadata only. It uses parameterized catalog SQL over `pg_namespace`, `pg_class`, `information_schema.columns`, constraints, indexes, and enum metadata. It never reads application rows. Selected schemas and excluded schemas are validated as identifiers, sorted, and included with the visibility policy in the inventory-boundary digest.

Pages are sorted by metadata kind and stable external identity. The source cursor contains only a bounded numeric offset and source high-water mark. The adapter exposes `postgres-schema-v1` and produces v2 UPSERT observations; it does not infer deletion or promote business semantics.

## Evidence

- `pnpm --filter @specforge/connector-worker test`: 6 passed.
- `pnpm exec tsc -p apps/connector-worker/tsconfig.json --noEmit`: passed.
- Commit follows after the adapter implementation.

## Deferred

Connection-pool wiring, live PostgreSQL integration coverage, relationship promotion, and MCP design-fact synchronization remain subsequent work. The current MCP tool surface still does not expose the required close/write operation.
