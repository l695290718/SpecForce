# Task 5 Report: Scope-Safe GraphStore Traversal

## Implementation

Added `@specforge/graph-store` with:

- `InMemoryGraphStore` for deterministic contract fixtures and projection updates.
- `PostgresGraphStore`, backed by static parameterized SQL and a recursive CTE that carries visited UUIDs per path.
- `createGraphStore(config)` for memory and PostgreSQL construction.
- Shared traversal logic that produces deterministic nodes, typed edges, evidence paths, graph versions, elapsed time, `COMPLETE` results, and `PARTIAL` results with non-empty frontiers and explicit `truncationReasons`.

The PostgreSQL CTE applies the one authorized Scope tuple once in its anchor and once in its recursive relationship term. It filters by rule code, direction, and confidence; caps CTE depth; sets a statement timeout from the plan; and maps returned rows through the same Scope validation used by the in-memory adapter. Returned cross-Scope nodes or edges are discarded even if a malformed database row bypasses ledger foreign keys.

`upsertProjection` and `checkpoint` are implemented for both adapters. The PostgreSQL adapter binds all values as query parameters; it accepts no caller-provided SQL or engine-specific traversal syntax.

## TDD Evidence

Initial RED:

```text
pnpm --filter @specforge/graph-store test
```

Failed because `src/index.ts` did not exist and the shared contract suite could not import `./index`.

The later multi-start-node budget regression was added before its fix:

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts
```

It failed with two returned nodes where `maxNodes: 1` required one. The root-limit implementation made the same test green.

## Verification

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts
```

Result: 1 file passed, 8 tests passed. Coverage includes directional filtering, cycle-safe paths, exact Scope isolation, depth/node/path/time truncation, deterministic frontiers, and multiple start-node node-budget enforcement.

```text
pnpm --filter @specforge/graph-store typecheck
```

Result: exit 0.

## PostgreSQL Handoff

`src/postgres.integration.test.ts` runs the same shared contract suite against `PostgresGraphStore`. It is guarded by both `SPECFORGE_PG_INTEGRATION=1` and `DATABASE_URL`, creates only a random `specforge_graph_store_test_<32 hex>` schema, validates that prefix before dropping it, and uses a separate public-schema admin client solely to create and clean up that disposable schema.

Per instruction, no PostgreSQL integration command was run. A full package test command inherited an enabled PostgreSQL flag and was terminated before completion so the parent can own database execution. Parent verification command:

```text
SPECFORGE_PG_INTEGRATION=1 pnpm --filter @specforge/graph-store test
```

## Depth-Boundary Follow-Up

Parent PostgreSQL verification found that a `maxDepth` traversal returned `COMPLETE` because the recursive CTE stopped before returning any eligible successor at the boundary. The shared traversal kernel can only classify a depth limit as partial when it can see an eligible unvisited transition.

`PostgresGraphStore` now adds a `depth_frontier` CTE. For every path exactly at `maxDepth`, it applies the same exact Scope tuple, relation rule, direction, confidence, and cycle predicates as the recursive term and returns the eligible successor as a traversal sentinel. The shared kernel sees that transition, returns `PARTIAL` with `MAX_DEPTH`, and keeps the boundary successor out of result nodes and evidence paths.

The non-PostgreSQL adapter regression in `src/postgres.test.ts` first reproduced the reported `COMPLETE` result, then passed after the CTE change. Final follow-up verification:

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts src/postgres.test.ts
```

Result: 2 files passed, 17 tests passed.

```text
pnpm --filter @specforge/graph-store typecheck
```

Result: exit 0.

The PostgreSQL integration suite remains unrun in this worktree. Parent should rerun the guarded disposable-schema command above.

## Files

- `packages/graph-store/**`
- `pnpm-lock.yaml`
- `.superpowers/sdd/task-5-report.md`
