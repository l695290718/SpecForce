# SpecForge Backlog

## Design-Fact Governance

### Complete dual-record synchronization

**Status:** Pending.

The baseline ADR records are synchronized and reconciled through MCP. Extend the same workflow to the matching Proposals, Context Packs, typed ADR-to-asset links, and command/test evidence. The reconciliation report must verify all of these records in the exact owning application-service scope and fail closed on any mismatch.

**Completion evidence:** `pnpm design-facts:sync` and `pnpm design-facts:check` report no missing, mismatched, out-of-scope, or blocked records for ADRs, Proposals, Context Packs, links, and evidence.

### Reconcile historical ADR status text

**Status:** Pending.

Update ADR-0001 through ADR-0006 so their MCP Record and Evidence sections distinguish the completed baseline ADR synchronization from still-deferred Proposal, Context Pack, link, and production-runtime work. Keep English canonical text and Chinese overlays aligned.

**Completion evidence:** ADR repository records and their persisted MCP ADR payloads have matching current synchronization status and bilingual content.

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
