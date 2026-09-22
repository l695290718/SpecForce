# Repository Scan Skill Integration

`skills/specforge-repository-scan` is the provider-neutral workflow for importing an existing repository into SpecForge. The repository supplies no authoritative governance constants; MCP resolves the signed policy, extractor catalog, semantic prompt pack, risk policy, and exact Scope overlay.

## Agent setup

- Codex: expose the skill folder in the workspace or install it under the configured Codex skills directory, then connect the SpecForge MCP server.
- Claude Code: link the skill folder into the configured Claude skills directory and expose the same MCP server/token.
- OpenCode: add the skill folder to the configured skills path and use the same MCP endpoint and token grants.

All three clients must provide `repositoryPath`, `applicationServiceId`, and `scopePath` explicitly per run. A token may have grants for multiple application services, but each invocation selects exactly one Scope and every tool call must repeat that Scope.

## Operational contract

The local scanner performs deterministic extraction only. Semantic interpretation is performed by the available Agent and submitted as bounded bilingual candidate batches. Each batch carries digest-pinned evidence clusters, the system prompt-pack and policy digests, full-asset-family identity, evidence types, stable identity decisions, counter-evidence, and unresolved questions. High-impact candidates require multiple evidence types. Candidates remain isolated from accepted design assets until every risk/domain ReviewBundle is independently approved, the complete set is submitted once to `promote_knowledge_review_set`, and aggregate promotion, relationship, reconciliation, and Baseline gates complete. A partition cannot create a partial Baseline.

The aggregate receipt is the handoff boundary: persist its `reviewSetId`, expected bundle IDs, decision IDs, source coverage, ChangeSet ID, and digest; retry only with the same input set. A missing or changed partition is a blocker, not a reason to publish the reviewed subset.

Keep `.specforge/scans/` private. Retain signed manifests, session and actor IDs, snapshot and policy digests, batch receipts, blocker reasons, and MCP reconciliation evidence according to the enterprise retention policy.

See the skill's `references/asset-coverage.md` and `references/blockers.md` for asset-family and remediation guidance.
