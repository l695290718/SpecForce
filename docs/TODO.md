# SpecForge Backlog

## Design-Fact Governance

### Complete dual-record synchronization

**Status:** Complete (locally verified on 2026-07-17).

The baseline ADR records, matching Proposals, Context Packs, typed ADR-to-asset links, and independent Evidence assets are synchronized through MCP. The reconciliation report verifies all of these records in the exact owning application-service scope and fails closed on any mismatch.

**Completion evidence:** On 2026-07-17, `pnpm design-facts:sync` persisted all seven baseline decisions and their Evidence/`VALIDATES` links; `pnpm design-facts:check` reported seven verified decisions with no missing, mismatched, out-of-scope, or blocked records.

### Reconcile historical ADR status text

**Status:** Complete (locally verified on 2026-07-19).

ADR-0001 through ADR-0006 now contain bilingual reconciliation updates that supersede historical MCP synchronization deferrals while preserving their real production-runtime and product-capability deferrals.

**Completion evidence:** `pnpm design-facts:sync` persists the updated bilingual ADR content and `pnpm design-facts:check` reports all seven baseline decisions verified without missing, mismatched, out-of-scope, or blocked facts.

## Enterprise Impact Analysis

### NebulaGraph production projection

**Status:** Pending production-profile verification.

Implement the NebulaGraph 3.8.0 projection path described in the enterprise impact-analysis design:

- add the Go graph gateway using the official NebulaGraph Go client;
- provision the supported local Docker Compose profile, or configure a reachable shared NebulaGraph 3.8.0 cluster;
- create the `specforge_graph` space, verify vertex and edge writes, and verify multi-hop traversal;
- add the idempotent PostgreSQL outbox projector, checkpointing, retry handling, and graph health telemetry; and
- complete the GraphStore/Nebula integration and MCP smoke suites.

**Completion evidence:** a repeatable NebulaGraph 3.8.0 compatibility test using the official Go client, followed by the complete integration and smoke suites.

### PostgreSQL graph traversal final regression

**Status:** Pending environment verification.

Re-run the complete PostgreSQL-backed GraphStore suite after the final deterministic root-ordering change, against the local `specforge` PostgreSQL database.

**Completion evidence:** the PostgreSQL integration suite exits successfully with all GraphStore traversal and relationship tests passing.

## Deferred product capability

### Authorized multi-service comparison

**Status:** Deferred.

Agents with explicit grants may eventually compare or aggregate multiple application services. This view must permission-filter every participating application service before it reads, joins, or presents any design asset or derived analysis.

### Production identity and authorization

**Status:** Deferred.

Replace the MVP mock actor grants with production identity, tenant policy, OAuth/RBAC enforcement, and auditable cross-service authorization decisions. This must preserve the existing fail-closed application-service scope boundary.

**Completion evidence:** authenticated MCP and Web requests enforce tenant and application-service grants in integration tests, including denied cross-service reads and writes.
