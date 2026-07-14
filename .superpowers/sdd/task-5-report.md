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

## Bounded Execution Review Fix

The original PostgreSQL adapter materialized the recursive CTE result before applying the shared in-memory traversal kernel. That allowed a high-degree Scope to produce an unbounded number of simple paths in PostgreSQL even when the public node/path budgets were small.

`PostgresGraphStore` now resolves scoped roots once, then performs a bounded one-hop query for each queued path state. Each one-hop query has a local PostgreSQL statement timeout, parameterized current-node and visited UUID values, exact Scope/rule/direction/confidence filters, and a hard `remainingPaths + 1` candidate limit. The extra row is a sentinel: it causes a deterministic `PARTIAL/MAX_PATHS` result without fetching further candidates. The adapter keeps paths, visited IDs, queue, nodes, edges, and deterministic sorting in JavaScript; fetched candidate rows are bounded by the node/path budgets rather than the graph size.

PostgreSQL statement cancellation (`57014` or equivalent timeout text) is converted to a valid `PARTIAL/TIMEOUT` result with the current queued node as a non-empty frontier.

Projection writes now call the same shared `assertProjectionScope` guard as the in-memory adapter before issuing PostgreSQL. A mismatched node or either mismatched edge endpoint fails with `PROJECTION_SCOPE_MISMATCH` and no query is made.

New non-PostgreSQL regressions cover a high-branching hard candidate cap, query-cancel mapping, PostgreSQL pre-query projection Scope rejection, and the shared projection Scope contract. Final verification:

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts src/postgres.test.ts
pnpm --filter @specforge/graph-store typecheck
```

Result: 2 files passed, 24 tests passed; graph-store and core typechecks exited 0. PostgreSQL integration remains for the parent’s guarded disposable-schema rerun.

## Path-Frontier Follow-Up

Parent PostgreSQL verification found that a path-budget sentinel result included the already-expanded root node in the frontier. The bounded adapter previously built that sentinel frontier from the current state plus its queue.

The sentinel branch now uses only the first omitted eligible candidate and queued, unexpanded states. It never adds the state whose outgoing candidates were already expanded. The non-PostgreSQL high-branching regression first reproduced `[customer-api, branch-one]`, then verified the corrected `[branch-one, branch-two]` frontier; this is the same distinction that yields the parent fixture frontier `[customer-entity]` when the additional raw sentinel is cross-Scope and discarded.

Final verification for this follow-up:

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts src/postgres.test.ts
pnpm --filter @specforge/graph-store typecheck
```

Result: 2 files passed, 24 tests passed; typecheck exited 0. PostgreSQL integration remains for the parent’s guarded disposable-schema rerun.

## Global Deadline Follow-Up

PostgreSQL traversal now treats `plan.timeoutMs` as one absolute deadline, beginning before checkpoint resolution. Before checkpoint, root lookup, and every one-hop query, the adapter computes the remaining milliseconds; it returns `PARTIAL/TIMEOUT` with a non-empty current frontier when the budget has expired. Checkpoint, root, and one-hop SQL each receive only that remaining value through a local `statement_timeout`, so no later query resets the full plan timeout. Elapsed time includes checkpoint and root work.

The deterministic fake-clock regression uses a 10 ms budget: checkpoint consumes 6 ms, root resolution receives the remaining 4 ms and consumes a further 5 ms, and the adapter returns `TIMEOUT` before issuing any hop. It asserts SQL timeout inputs `[10, 4]`, a 11 ms elapsed result, and zero hop queries.

## Canonical Timeout Follow-Up

Task 1 defines `TIMEOUT` as the sole engine-neutral truncation reason. PostgreSQL cancellation and deadline exhaustion now use that exact code, matching the in-memory adapter and shared contract tests. The temporary `QUERY_TIMEOUT` alias was removed from the core union and all PostgreSQL regressions now assert `TIMEOUT`.

## Root Order Parity Follow-Up

PostgreSQL previously sliced the caller-provided root array before sorting database results, while `InMemoryGraphStore` sorted roots before applying the node budget. PostgreSQL now canonical-sorts authorized start identities before serializing the bounded root query and before deriving the initial overflow frontier.

The shared contract uses reversed starts with `maxNodes: 1` and verifies both adapters return `customer-api` as the sole node/path and `customer-entity` as the frontier. A PostgreSQL fake-query regression verifies the serialized root input follows that same canonical order.

Final verification:

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts src/postgres.test.ts
pnpm --filter @specforge/graph-store typecheck
```

Result: 2 files passed, 28 tests passed; typecheck exited 0. PostgreSQL integration remains for the parent’s guarded disposable-schema rerun.

Final verification:

```text
pnpm --filter @specforge/graph-store exec vitest run src/graph-store.contract.test.ts src/postgres.test.ts
pnpm --filter @specforge/graph-store typecheck
```

Result: 2 files passed, 25 tests passed; typecheck exited 0. PostgreSQL integration remains for the parent’s guarded disposable-schema rerun.

## Files

- `packages/graph-store/**`
- `pnpm-lock.yaml`
- `.superpowers/sdd/task-5-report.md`
