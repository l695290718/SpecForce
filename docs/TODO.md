# SpecForge Backlog

## Enterprise Impact Analysis

### NebulaGraph production projection

**Status:** Blocked on local or shared infrastructure.

Implement the NebulaGraph 3.8.0 projection path described in the enterprise impact-analysis design:

- add the Go graph gateway using the official NebulaGraph Go client;
- provision the local Docker Compose profile, or configure a reachable shared NebulaGraph 3.8.0 cluster;
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
