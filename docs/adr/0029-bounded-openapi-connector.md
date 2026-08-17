# ADR-0029: Bounded OpenAPI Connector

- Status: Accepted for the connector foundation
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`

## Decision

OpenAPI ingestion is normalized through a bounded adapter. HTTP sources require HTTPS, an explicit host allowlist, DNS resolution that rejects private/link-local addresses, bounded redirects, response bytes, and timeout cancellation. Local documents may only be read under configured roots. OpenAPI 3.0 and 3.1 operation identities use unique `operationId` values when present and normalized method/path otherwise.

Unsupported external references are reported as coverage issues; they are never fetched implicitly. The adapter emits API-operation candidates only and does not promote business meaning or infer deletion.

## Evidence

- `pnpm --filter @specforge/connector-worker test`: 10 passed.
- `pnpm exec tsc -p apps/connector-worker/tsconfig.json --noEmit`: passed.

## Deferred

Remote `$ref` retrieval, live connector registry wiring, and MCP design-fact synchronization remain subsequent work. The current MCP tool surface does not expose the required close/write operation.
