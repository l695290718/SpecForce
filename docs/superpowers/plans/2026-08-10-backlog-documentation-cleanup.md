# Backlog Documentation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mojibake-heavy mixed-status backlog with a concise bilingual active backlog and a traceable archive, without changing operational design-fact identities or database state.

**Architecture:** `docs/TODO.md` becomes the active operational index; `docs/archive/backlog-history.md` becomes the repository history index. Existing ADRs and MCP records remain the semantic authority. An exact-Scope Design Change Session gates the edit, read-only reconciliation verifies the operational records, and the same session closes with command evidence.

**Tech Stack:** Markdown, PowerShell, Git, pnpm design-context scripts, SpecForge MCP, PostgreSQL.

## Global Constraints

- Owning Scope is `com.huawei.celon.desiner` with `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- English is canonical and every active human-facing backlog item has a complete Chinese localization.
- Do not delete, close, relabel, or otherwise mutate Design Change Sessions, outbox events, ADRs, Proposals, Context Packs, Evidence, or typed links as part of documentation cleanup.
- Preserve stable ADR IDs, owners, rationale, activation triggers, and completion evidence.
- Keep `.superpowers/sdd/task-1-report.md` and `.superpowers/sdd/task-3-report.md` untouched and out of commits.

---

### Task 1: Open The Exact-Scope Documentation Cleanup Session

**Files:**
- Read: `docs/TODO.md`
- Read: `docs/design-facts/baseline-manifest.json`
- Read: `docs/superpowers/specs/2026-08-10-backlog-documentation-cleanup-design.md`

**Interfaces:**
- Consumes: Existing ADR IDs and the configured `DATABASE_URL` from `.env`.
- Produces: One `DesignChangeSession` ID in status `OPEN`, bound to the exact Designer Scope.

- [ ] **Step 1: Verify the affected ADR records exist in the repository manifest**

Run:

```powershell
rg -n 'adr-local-git-hook-change-attestation|adr-application-service-scope-isolation|adr-continuous-observation-governance|adr-3a-architecture-navigation-workspace|adr-nebulagraph-production-projection|adr-design-context-preflight-gate|adr-single-authoritative-local-postgresql' docs/design-facts/baseline-manifest.json
```

Expected: every listed ID appears at least once.

- [ ] **Step 2: Open the exact-Scope preflight session**

Run:

```powershell
$preflightOutput = pnpm design-context:preflight -- --intent "Clean the bilingual active backlog and archive completed history without changing operational design-fact identities or database state." --affected "adr-local-git-hook-change-attestation,adr-application-service-scope-isolation,adr-continuous-observation-governance,adr-3a-architecture-navigation-workspace,adr-nebulagraph-production-projection,adr-design-context-preflight-gate,adr-single-authoritative-local-postgresql" --evidence "docs/superpowers/specs/2026-08-10-backlog-documentation-cleanup-design.md" | Out-String
$preflight = $preflightOutput | ConvertFrom-Json
if (-not $preflight.receipt.sessionId) { throw 'DESIGN_CHANGE_SESSION_ID_MISSING' }
$preflight.receipt.sessionId | Set-Content .specforge/design-context/backlog-documentation-cleanup.session -Encoding UTF8
$preflightOutput
```

Expected: JSON receipt with exact `applicationServiceId`, exact `scopePath`, status `OPEN`, a non-empty design-context digest, and a session ID. Record that ID for Task 4.

- [ ] **Step 3: Capture the authoritative operational snapshot without mutation**

Run a read-only Prisma query against the `.env` database that prints:

```text
DesignChangeSession grouped by status
OPEN session IDs and intents
FederationOutbox grouped by eventType and status
ProjectionBuildJob grouped by status
Proposal grouped by status
```

Expected: the output is used only to state current operational inconsistencies in the active backlog. No row is updated or deleted.

### Task 2: Split Active Backlog From Historical Completion Records

**Files:**
- Modify: `docs/TODO.md`
- Create: `docs/archive/backlog-history.md`

**Interfaces:**
- Consumes: Task 1 repository and operational snapshots.
- Produces: A bilingual active backlog and a separate historical index with stable source references.

- [ ] **Step 1: Create the history archive**

Create `docs/archive/backlog-history.md` with this structure and no mojibake text:

```markdown
# SpecForge Backlog History

This file preserves completed, superseded, and resolved backlog records. Active work is tracked in `docs/TODO.md`. Detailed decisions and evidence remain authoritative in the linked ADRs and MCP records.

## Completed Governance And Deployment Increments

- Design-fact dual-record synchronization and historical ADR reconciliation — completed; see ADR-0007 and `docs/design-facts/baseline-manifest.json`.
- Federated governance-core and hardening slices — completed; see ADR-0010 and the federation hardening reports.
- Single-host Docker Compose deployment — completed; see ADR-0011.
- Architecture overview home and MCP synchronization — completed; see ADR-0013.
- Single authoritative local PostgreSQL migration — completed; see ADR-0014.

## Completed Knowledge And 3A Increments

- Agent-driven legacy Baseline discovery Phase 1 — completed; see ADR-0015.
- Deterministic 3A projections Phase 2 — completed; see ADR-0019.
- Continuous-observation governance core and local-repository connector Phase 3 — completed; see ADR-0020.
- PostgreSQL-first 3A navigation workspace and canonical acceptance gate — completed; see ADR-0022.

## Completed Graph Increments

- PostgreSQL graph traversal regression — completed; see ADR-0005 and ADR-0006.
- Legacy graph-outbox archival — completed without deleting historical rows; see `docs/TODO.md` history before this cleanup and the corresponding audit receipt.
- Local single-node NebulaGraph compatibility projection — completed; see ADR-0012. Enterprise multi-node certification remains active in `docs/TODO.md`.

## Resolved Incidents

- The canonical PostgreSQL tunnel outage on `localhost:15433` was recovered and subsequent design-fact checks converged. Retry and operator-diagnostic hardening remains active in `docs/TODO.md`.

## 中文历史摘要

本文件保留已完成、已替代和已解决的待办历史。双重设计记录、联邦治理核心、单机 Docker 部署、系统概览首页、单一权威 PostgreSQL、存量基线发现第一阶段、确定性 3A 投影第二阶段、持续观察治理第三阶段、PostgreSQL-first 3A 工作台、本地单节点 NebulaGraph 兼容投影及历史图 Outbox 归档均已完成。仍未完成的企业级增量继续记录在 `docs/TODO.md`，详细决策和证据以对应 ADR 与 MCP 记录为准。
```

- [ ] **Step 2: Replace `docs/TODO.md` with active work only**

Use exactly these top-level active items, in this priority order:

```markdown
# SpecForge Active Backlog

Only incomplete work is listed here. Completed and superseded records are preserved in `docs/archive/backlog-history.md`.

1. Governance operational-state reconciliation
2. CodeArts/CodeHub protected-branch enforcement
3. Production identity, tenant authorization, and multi-service comparison
4. Live enterprise source connectors and continuous synchronization
5. Knowledge-Assertion-aware Nebula 3A and production-scale certification
6. PostgreSQL/MCP synchronization resilience
7. Legacy graph verification stack retirement
```

For every item, add these English canonical fields followed by a complete Chinese localization:

```markdown
**Status:** Deferred or In progress.
**Owner:** Existing owner from the current backlog or governing ADR.
**Rationale:** Why the incomplete capability is still required.
**Trigger:** The exact condition that authorizes implementation.
**Completion evidence:** The observable checks required to close it.
**Design references:** Stable ADR IDs and relevant implementation records.
```

Use the current operational snapshot for item 1. State the exact count of `OPEN` sessions and pending outbox records as a dated observation, not as an immutable contract. Explicitly say cleanup must use MCP commands and cannot delete audit history.

For items 2-7, preserve the delivery boundaries already recorded in ADR-0001, ADR-0012, ADR-0014, ADR-0017, ADR-0018, ADR-0020, ADR-0021, and ADR-0022. Do not claim CodeHub enforcement, enterprise IdP integration, external live adapters, Nebula 3A history, multi-node sizing, Kubernetes, object storage, secret management, or billion-scale certification as implemented.

- [ ] **Step 3: Review the split for semantic loss**

Compare the new files with the prior `docs/TODO.md` diff. Every incomplete capability must appear in the active file; every completed capability named in the old file must appear in the archive or its linked ADR. Restore any missing owner, trigger, rationale, or evidence reference before verification.

### Task 3: Verify Encoding, Classification, And Repository Integrity

**Files:**
- Verify: `docs/TODO.md`
- Verify: `docs/archive/backlog-history.md`

**Interfaces:**
- Consumes: Task 2 Markdown files.
- Produces: Exact command evidence that the split is readable, active-only, bilingual, and patch-clean.

- [ ] **Step 1: Reject common mojibake markers**

Run:

```powershell
$matches = rg -n '锛|銆|鈥|涓枃|�' docs/TODO.md docs/archive/backlog-history.md
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }
```

Expected: exit code `0` from the wrapper and no match output.

- [ ] **Step 2: Reject completed status from the active backlog**

Run:

```powershell
$matches = rg -n '^\*\*Status:\*\*.*(Complete|Completed|Implemented|Superseded|已完成|已替代)' docs/TODO.md
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }
```

Expected: exit code `0` from the wrapper and no match output.

- [ ] **Step 3: Verify the seven active sections and bilingual field coverage**

Run:

```powershell
$text = Get-Content docs/TODO.md -Raw -Encoding UTF8
$sections = ([regex]::Matches($text, '(?m)^## ')).Count
$englishOwners = ([regex]::Matches($text, '(?m)^\*\*Owner:\*\*')).Count
$chineseOwners = ([regex]::Matches($text, '(?m)^\*\*负责人：\*\*')).Count
if ($sections -ne 7 -or $englishOwners -ne 7 -or $chineseOwners -ne 7) { throw "BACKLOG_STRUCTURE_MISMATCH sections=$sections englishOwners=$englishOwners chineseOwners=$chineseOwners" }
```

Expected: exit code `0` with no exception.

- [ ] **Step 4: Verify the patch**

Run:

```powershell
git diff --check
git diff -- docs/TODO.md docs/archive/backlog-history.md
```

Expected: `git diff --check` exits `0`; the diff contains only the intended active/history split and clean UTF-8 text.

### Task 4: Reconcile Design Facts, Close The Session, And Commit

**Files:**
- Verify: `docs/design-facts/baseline-manifest.json`
- Modify only if reconciliation proves a semantic mismatch: the matching ADR or manifest record identified by the failure.

**Interfaces:**
- Consumes: Task 1 session ID and Task 3 verification evidence.
- Produces: Clean exact-Scope reconciliation, a `CONVERGED` session closure, and one repository commit.

- [ ] **Step 1: Run scoped design-fact read-back**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-local-git-hook-change-attestation,adr-application-service-scope-isolation,adr-continuous-observation-governance,adr-3a-architecture-navigation-workspace,adr-nebulagraph-production-projection,adr-design-context-preflight-gate,adr-single-authoritative-local-postgresql'
pnpm design-facts:check
Remove-Item Env:SPECFORGE_DESIGN_FACT_IDS
```

Expected: no missing, mismatched, blocked, pending, or out-of-Scope facts. If the check reports a semantic mismatch, update only the matching repository record, synchronize it through MCP, and rerun this step; do not directly edit PostgreSQL.

- [ ] **Step 2: Close the exact preflight session**

Run with the session ID captured by Task 1:

```powershell
$sessionId = (Get-Content .specforge/design-context/backlog-documentation-cleanup.session -Raw -Encoding UTF8).Trim()
if (-not $sessionId.StartsWith('design-change-session:')) { throw 'INVALID_DESIGN_CHANGE_SESSION_ID' }
pnpm design-context:close -- --session $sessionId --status CONVERGED --evidence "backlog_mojibake_scan=PASS,active_status_scan=PASS,bilingual_structure=PASS,git_diff_check=PASS,design_facts_check=PASS"
```

Expected: the same session returns exact Scope and status `CONVERGED`.

- [ ] **Step 3: Stage only the cleanup files**

Run:

```powershell
git add -- docs/TODO.md docs/archive/backlog-history.md docs/superpowers/plans/2026-08-10-backlog-documentation-cleanup.md
git status --short
```

Expected: only the three cleanup files are staged. The two existing `.superpowers/sdd` report modifications remain unstaged.

- [ ] **Step 4: Commit the cleanup**

Run:

```powershell
git commit -m "docs: clean active backlog history"
```

Expected: one commit containing the active backlog, archive, and implementation plan; no unrelated file is committed.
