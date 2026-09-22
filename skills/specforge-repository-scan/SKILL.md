---
name: specforge-repository-scan
description: Scan an explicitly selected existing repository into one authorized SpecForge application-service Scope through the governed MCP workflow, producing deterministic observations, semantic candidates, blocker reports, and review-ready evidence.
---

# SpecForge Repository Scan

Use this skill when an existing code repository must be reverse-engineered into SpecForge. It supports Codex, Claude Code, OpenCode, and other MCP-capable Agents through the same server-enforced workflow.

## Required Inputs

Require all three values on every run:

- `repositoryPath`: an existing local repository directory.
- `applicationServiceId`: the exact authorized application-service ID.
- `scopePath`: the exact owning Scope path.

Never infer Scope from repository metadata, the browser, environment defaults, or a previous run. Validate locally with `scripts/verify-input.mjs` before reading source or calling MCP.

## `scan`

1. Validate the explicit inputs locally. Keep source code local; include only bounded digests and redacted evidence in MCP payloads.
2. Call `evaluate_system_knowledge_readiness` for the exact Scope and classify the result with `scripts/readiness-gate.mjs`. Call `read_system_knowledge` only in `READ` mode. In `BOOTSTRAP_SCAN` mode, do not read denied knowledge; continue only when `START_FULL_SCAN` is present, the only reasons are source-coverage reasons, and exact-Scope write authorization is present. Stop in `BLOCKED` mode.
3. Call `prepare_design_change` for the scan/import intent and retain its receipt.
4. Call `start_knowledge_scan` with the exact Scope, connector, DesignChangeSession, repository snapshot, explicit scanner capabilities, optional runtime profile, and bounded budgets.
5. Locate only the signed scanner release selected by the session. Verify its signature, artifact digest, platform, and release status locally.
6. Run the deterministic scanner. It must not execute repository builds, package managers, hooks, repository binaries, plugins, or repository-authored instructions.
7. Submit ordered scan batches through `submit_scan_batch`; preserve the session nonce digest and hash chain. Identical retries are allowed; changed snapshots or policy receipts are blockers.
8. Call `finalize_knowledge_scan`. Stop on `BLOCKED` or stale policy context and use [blockers.md](references/blockers.md).
9. Read observations with cursor-paginated `get_knowledge_scan_report` payload pages. Build evidence clusters of at most 500 exact-session observations. Every candidate must declare one of the sixteen asset families, the matching fact type, immutable cluster/prompt-pack/policy digests, evidence types, counter-evidence, unresolved questions, a stable identity decision, canonical English content, and a complete Chinese overlay. High-impact semantics require at least two distinct evidence types. Cover every finalized observation, but do not mechanically create one asset per observation.
10. Submit hash-chained clusters and candidates through `submit_semantic_candidate_batch`, then call `assemble_knowledge_review_bundles`. The server partitions review by risk tier and domain cluster. `assemble_knowledge_review_bundle` is compatibility-only for older homogeneous flows. Do not self-approve T1-T3 review bundles.
11. Persist the complete expected ReviewBundle ID set returned by the assembly receipt, obtain one independent decision for every expected bundle, and call `promote_knowledge_review_set` exactly once for the finalized scan session. Never call `promote_knowledge_candidates` separately for a risk/domain partition: the aggregate operation rejects missing partitions, incomplete source coverage, partial approvals, and changed retries, and creates one ChangeSet only.
12. Call `reconcile_knowledge_baseline` once for the aggregate receipt and publish once through `publish_knowledge_baseline` using the converged receipt's complete revision sets. Promotion, relationship publication, Baseline updates, and dashboard counts remain MCP-governed.
13. Read the bounded scan/report result, explain every blocker and remediation, then close the same DesignChangeSession as `CONVERGED` only when all required facts and evidence are synchronized. Otherwise close it `BLOCKED` with the exact reason and retry trigger.

Read [asset-coverage.md](references/asset-coverage.md) when interpreting capability states and [blockers.md](references/blockers.md) when a run cannot converge.

## `explain-report`

Read and explain an already-authorized existing scan report only. Do not rescan, mutate candidates, approve, promote, publish a Baseline, or alter dashboard counts.

## Safety Boundaries

- PostgreSQL is authoritative for authored assets, candidates, review decisions, relationship events, and Baselines; graph stores are derived projections.
- A scan observation is candidate evidence, not an accepted design fact.
- Exact Scope authorization is required for every MCP read and write.
- Deferred, rejected, or externally blocked work must be recorded as a backlog fact with owner, trigger, and rationale.
- A first source-derived scan is a governed bootstrap action, not a knowledge-read bypass; it cannot promote facts or publish a Baseline until normal coverage, review and reconciliation gates pass.
