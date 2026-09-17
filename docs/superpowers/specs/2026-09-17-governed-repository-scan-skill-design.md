# Governed Repository Scan Skill Design

## Purpose

Provide a reusable Agent Skill that scans a user-selected local repository and submits structural, candidate-only observations to one explicitly named SpecForge application-service Scope through MCP. The Skill makes governed scanning available to Codex, Claude Code, OpenCode, and compatible Agents without requiring a scanner daemon or direct database access.

## Decisions

### Explicit inputs only

The Skill requires these inputs:

- `repositoryPath`: absolute or current-workspace-relative local repository path.
- `applicationServiceId`: exact authorized target application-service ID.
- `scopePath`: exact target Scope path.

It never infers a Scope from a repository name, Git remote, current UI selection, environment default, or previously used Scope. The repository path may be manually selected. Missing, invalid, or mismatched inputs fail before a scan begins.

### Automatic governed lifecycle

The Skill owns the operational sequence:

1. Validate the local repository path and target inputs.
2. Read target Scope authorization and current bounded system knowledge through MCP.
3. Open a `DesignChangeSession` in that exact Scope.
4. Run the deterministic governed local scan using the repository path.
5. Register or reuse an `OBSERVE`-only repository connector in that Scope.
6. Submit the scan report and structural observations through MCP.
7. Read back the persisted report and summarize coverage.
8. Close the same session as `CONVERGED` or `BLOCKED` with exact evidence.

The Skill must use the deployment's configured MCP endpoint and credentials. It must not connect to PostgreSQL, graph databases, or internal service databases directly.

### Candidate-only boundary

The Skill uploads only deterministic structural observations and coverage metadata. It does not create, update, promote, retire, or delete authored assets, Proposals, ADRs, Context Packs, Baselines, or typed links. Candidate interpretation and promotion remain separately governed MCP workflows.

## Coverage Policy

The scan reports every discovered file under a versioned policy:

| Classification | Meaning | Completion effect |
|---|---|---|
| `SUPPORTED` | A recognized extractor created structural evidence. | Non-blocking |
| `EXCLUDED` | Explicitly excluded generated, private, or sensitive material. | Non-blocking |
| `OUT_OF_POLICY` | Outside the declared scanner contract. | Non-blocking but reported |
| `REQUIRED_UNSUPPORTED` | A required declaration lacks a supported extractor. | Blocking |

The Skill surfaces policy ID/version/digest, classification totals, a bounded representative list, and blocking rule IDs. It treats a report as complete only when `REQUIRED_UNSUPPORTED` is zero.

## Blocking Behavior And Remediation

If a scan cannot converge, the Skill closes the session as `BLOCKED` where possible, preserves the report and any candidate observations already accepted by MCP, and returns a structured remediation guide.

| Blocker | Required output | Recommended next action |
|---|---|---|
| `REQUIRED_UNSUPPORTED` | Paths, policy rule IDs, and report digest | Add a deterministic extractor for the declaration type, or approve a narrowly scoped policy exclusion if the material has no architecture value. Re-run with a new session. |
| Scope authorization denied or mismatch | Requested Scope and server-safe error code | Obtain a token grant for the exact application service; do not retry against another Scope. |
| MCP unavailable or persistence failure | Failed lifecycle stage and retry trigger | Restore the MCP endpoint or its authoritative database dependency, then re-run the whole governed lifecycle. |
| Repository path invalid or unreadable | Sanitized path error and inaccessible class | Correct the path or grant local read access. Never upload inaccessible-path details. |
| Existing report/session conflict | Existing report/session IDs and status | Reuse a completed immutable report when applicable; otherwise create a new session and submit a new report. |

The Skill must distinguish a blocked scan from a successful scan with `OUT_OF_POLICY` files. It must never claim that a candidate scan has created an approved design baseline.

## Interaction Contract

The Skill exposes two modes:

- **Scan:** run the full automatic lifecycle for explicit inputs.
- **Explain report:** inspect an existing report ID in the same explicit Scope and produce the coverage/remediation summary without scanning.

The success result includes repository identity, exact Scope, session ID, report ID/digest, policy metadata, candidate count, classification counts, and the statement that no authored assets were changed. The blocked result includes the same identity fields plus blocker-specific remediation steps and a retry command template.

## Security And Privacy

- Repository source content remains local by default; MCP receives normalized observations, paths, digests, and minimum structural metadata defined by the scanner contract.
- The Skill must not print tokens, connection strings, raw secret material, or excluded-path contents.
- The target Scope is authorization-bound server-side. Client-side validation is only an early usability check.
- The Skill must not widen a token's authorized Scope set, synthesize authorization, or use implicit cross-Scope fallbacks.

## Verification

Implementation must include focused tests for input validation, Scope mismatch/denial, complete scans with out-of-policy files, blocking required-unsupported declarations, MCP persistence failures, session closure evidence, idempotent report behavior, and proof that authored assets/Baselines are not mutated. A live test must use a disposable target Scope or a candidate-only fixture and read back the MCP report.

## Deferred Work

- Semantic analysis and review-bundle generation.
- Candidate promotion into authored design facts.
- Scheduled or continuous scanning.
- External repository-provider connectors and CodeHub CI enforcement.
- Per-language deep parsers beyond the governed deterministic extractor set.
