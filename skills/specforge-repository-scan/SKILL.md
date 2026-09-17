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
2. Call `evaluate_system_knowledge_readiness` and then consume only `read_system_knowledge` for the exact Scope.
3. Call `prepare_design_change` for the scan/import intent and retain its receipt.
4. Call `start_knowledge_scan` with the exact Scope, connector, DesignChangeSession, repository snapshot, optional runtime profile, and bounded budgets.
5. Locate only the signed scanner release selected by the session. Verify its signature, artifact digest, platform, and release status locally.
6. Run the deterministic scanner. It must not execute repository builds, package managers, hooks, repository binaries, plugins, or repository-authored instructions.
7. Submit ordered scan batches through `submit_scan_batch`; preserve the session nonce digest and hash chain. Identical retries are allowed; changed snapshots or policy receipts are blockers.
8. Call `finalize_knowledge_scan`. Stop on `BLOCKED` or stale policy context and use [blockers.md](references/blockers.md).
9. Read bounded observations and form bilingual semantic candidate batches. Keep canonical English authoritative and provide complete Chinese overlays for human-facing content. Submit candidates through `submit_semantic_candidate_batch` only; never write accepted assets directly.
10. Call `assemble_knowledge_review_bundle`. Do not self-approve T1-T3 review bundles. Promotion, relationship publication, Baseline updates, and dashboard counts remain MCP-governed.
11. Read the bounded scan/report result, explain every blocker and remediation, then close the same DesignChangeSession as `CONVERGED` only when all required facts and evidence are synchronized. Otherwise close it `BLOCKED` with the exact reason and retry trigger.

Read [asset-coverage.md](references/asset-coverage.md) when interpreting capability states and [blockers.md](references/blockers.md) when a run cannot converge.

## `explain-report`

Read and explain an already-authorized existing scan report only. Do not rescan, mutate candidates, approve, promote, publish a Baseline, or alter dashboard counts.

## Safety Boundaries

- PostgreSQL is authoritative for authored assets, candidates, review decisions, relationship events, and Baselines; graph stores are derived projections.
- A scan observation is candidate evidence, not an accepted design fact.
- Exact Scope authorization is required for every MCP read and write.
- Deferred, rejected, or externally blocked work must be recorded as a backlog fact with owner, trigger, and rationale.
