# Governed Scan Coverage Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository scan completeness depend on an auditable coverage policy, then rescan `com.specforge.designcenter` into candidates without changing approved assets or the active Baseline.

**Architecture:** Add a policy-driven classifier in `@specforge/core` that labels each traversed file as supported, excluded, required-but-unsupported, or out-of-policy. Extend the scan report contract and MCP persistence to carry a deterministic policy digest and bounded classification evidence. Keep extraction, candidate persistence, semantic review, promotion, and Baseline publication as separate gates.

**Tech Stack:** TypeScript, Vitest, Prisma/PostgreSQL, MCP stdio client, pnpm.

## Global Constraints

- All operational writes use exact Scope `com.specforge.designcenter` and its registered Scope path.
- PostgreSQL is authoritative; graph projections remain derived.
- Scans create candidate observations only; they never overwrite approved design assets or publish a Baseline.
- Canonical machine fields are English; human-facing policy reasons include Chinese localized text.
- Explicit exclusions must be deterministic, versioned, and included in the report digest.

---

### Task 1: Define the Core Coverage Contract

**Files:**
- Modify: `packages/core/src/scanner/types.ts`
- Create: `packages/core/src/scanner/coverage-policy.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/scanner.test.ts`

**Interfaces:**
- Produces `ScanFileClassification`, `ScanCoveragePolicy`, `ScanCoverageEntry`, and `classifyScanFile(path, policy)`.
- Consumes normalized repository-relative paths only.

- [ ] **Step 1: Write failing classification tests**

```ts
expect(classifyScanFile("apps/web/src/app/page.ts", defaultScanCoveragePolicy).kind).toBe("SUPPORTED");
expect(classifyScanFile("node_modules/pkg/index.js", defaultScanCoveragePolicy).kind).toBe("EXCLUDED");
expect(classifyScanFile("deploy/compose.yaml", defaultScanCoveragePolicy).kind).toBe("REQUIRED_UNSUPPORTED");
expect(classifyScanFile("notes/example.txt", defaultScanCoveragePolicy).kind).toBe("OUT_OF_POLICY");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --filter @specforge/core exec vitest run src/__tests__/scanner.test.ts`

Expected: FAIL because policy exports do not exist.

- [ ] **Step 3: Implement the policy model**

```ts
export type ScanFileClassificationKind = "SUPPORTED" | "EXCLUDED" | "REQUIRED_UNSUPPORTED" | "OUT_OF_POLICY";

export interface ScanCoveragePolicy {
  id: string;
  version: string;
  rules: readonly ScanCoverageRule[];
}

export interface ScanCoverageEntry {
  path: string;
  kind: ScanFileClassificationKind;
  ruleId: string;
  reason: { en: string; zh: string };
}
```

Add ordered rules for current source formats, excluded local/generated/dependency directories, high-value declarative paths (`Dockerfile`, Compose, workflow, Kubernetes, Helm, YAML), and a final out-of-policy rule. Export `defaultScanCoveragePolicy` and `scanCoveragePolicyDigest(policy)`.

- [ ] **Step 4: Run the focused test and confirm pass**

Run: `pnpm --filter @specforge/core exec vitest run src/__tests__/scanner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scanner packages/core/src/index.ts
git commit -m "feat: define governed scan coverage policy"
```

### Task 2: Produce Policy-Audited Scan Reports

**Files:**
- Modify: `packages/core/src/scanner/service.ts`
- Modify: `packages/core/src/scanner/types.ts`
- Test: `packages/core/src/__tests__/scanner.test.ts`

**Interfaces:**
- Consumes `ScanCoveragePolicy` from Task 1.
- Produces `ScanCoverage` with per-classification counts, policy digest, bounded representative paths, and blocking rule IDs.

- [ ] **Step 1: Add failing report tests**

```ts
const report = buildScanReport({ rootLabel: "orders", architectureScope: scope, files, coveragePolicy: defaultScanCoveragePolicy });
expect(report.coverage.excludedFiles).toBe(1);
expect(report.coverage.requiredUnsupportedFiles).toBe(1);
expect(report.coverage.complete).toBe(false);
expect(report.coverage.blockingRuleIds).toContain("required-compose-yaml");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm --filter @specforge/core exec vitest run src/__tests__/scanner.test.ts`

Expected: FAIL because the extended coverage fields do not exist.

- [ ] **Step 3: Implement report classification and validation**

Replace the single skipped/unsupported calculation with deterministic classification counts. Set `complete` only when traversal completes and `requiredUnsupportedFiles`, extractor failures, and rule conflicts are zero. Preserve compatibility fields while adding `policyId`, `policyVersion`, `policyDigest`, `excludedFiles`, `outOfPolicyFiles`, `requiredUnsupportedFiles`, `blockingRuleIds`, and no more than 50 representative entries per non-supported class. Include the policy fields in report digest validation.

- [ ] **Step 4: Run focused core tests**

Run: `pnpm --filter @specforge/core exec vitest run src/__tests__/scanner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scanner packages/core/src/__tests__/scanner.test.ts
git commit -m "feat: report governed scan coverage"
```

### Task 3: Add High-Value Declarative Extractors

**Files:**
- Modify: `packages/core/src/scanner/service.ts`
- Test: `packages/core/src/__tests__/scanner.test.ts`
- Modify: `apps/mcp-server/src/connectors/local-repository.ts`
- Test: `apps/mcp-server/src/connectors/local-repository.test.ts`

**Interfaces:**
- Extends `scanFilePath` with deterministic descriptors for Docker, Compose, CI, Kubernetes/Helm, and YAML contracts/configuration.
- Uses existing source-minimized observation payloads; no source content is persisted.

- [ ] **Step 1: Add failing descriptor tests**

```ts
expect(scanFilePath("deploy/compose.yaml")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
expect(scanFilePath(".github/workflows/ci.yml")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
expect(scanFilePath("charts/web/templates/deployment.yaml")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @specforge/core exec vitest run src/__tests__/scanner.test.ts`

Expected: FAIL because these paths are currently unsupported.

- [ ] **Step 3: Implement ordered descriptor rules**

Recognize `Dockerfile`, Compose file names, CI workflow paths, Helm/Kubernetes manifest paths, and YAML/JSON contract/configuration paths before the generic source rule. Classify generic YAML outside high-value paths as `OUT_OF_POLICY`, not as a blocked required source.

- [ ] **Step 4: Verify connector paging preserves the policy coverage**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/connectors/local-repository.test.ts`

Expected: PASS with the same policy digest and coverage fields on every page.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scanner/service.ts packages/core/src/__tests__/scanner.test.ts apps/mcp-server/src/connectors/local-repository.ts apps/mcp-server/src/connectors/local-repository.test.ts
git commit -m "feat: scan declarative architecture sources"
```

### Task 4: Persist and Expose Coverage Evidence Through MCP

**Files:**
- Modify: `apps/mcp-server/src/scanner/persistence.ts`
- Modify: `apps/mcp-server/src/scanner/persistence.integration.test.ts`
- Modify: `scripts/rescan-workspace-through-mcp.ts`
- Test: `apps/mcp-server/src/tools.test.ts`

**Interfaces:**
- Consumes extended `ScanReport.coverage`.
- Produces a `RECEIVED` report only when policy coverage is complete; otherwise persists `BLOCKED` with blocking rule evidence.

- [ ] **Step 1: Add persistence tests**

```ts
expect(stored.status).toBe("BLOCKED");
expect(stored.coverage.blockingRuleIds).toEqual(["required-compose-yaml"]);
expect(stored.coverage.policyDigest).toMatch(/^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run the failing integration test**

Run: `SPECFORGE_INTEGRATION=1 pnpm --filter @specforge/mcp-server exec vitest run src/scanner/persistence.integration.test.ts`

Expected: FAIL until extended coverage survives persistence.

- [ ] **Step 3: Persist bounded coverage evidence and improve CLI output**

Validate the policy digest and blocking rule IDs in `validateScanReport`. Keep the existing bounded transaction timeout for compatibility imports. Make `scan:workspace:mcp` print report ID, policy digest, classification counts, and blocking rule IDs after MCP returns.

- [ ] **Step 4: Run focused MCP tests**

Run: `pnpm --filter @specforge/mcp-server typecheck && pnpm exec vitest run apps/mcp-server/src/scanner/persistence.integration.test.ts apps/mcp-server/src/tools.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/scanner/persistence.ts apps/mcp-server/src/scanner/persistence.integration.test.ts scripts/rescan-workspace-through-mcp.ts apps/mcp-server/src/tools.test.ts
git commit -m "feat: persist governed scan coverage evidence"
```

### Task 5: Synchronize Design Facts and Run the Target Rescan

**Files:**
- Modify: `docs/adr/` existing or new scan coverage ADR
- Modify: design-fact sync manifest/source used by `pnpm design-facts:sync`
- Create: `docs/evidence/governed-scan-coverage-rescan.md`

**Interfaces:**
- Uses MCP `prepare_design_change` and `close_design_change_session` in `com.specforge.designcenter`.
- Produces a target-scope candidate scan report and no approved-asset mutation.

- [ ] **Step 1: Write the ADR and bilingual MCP asset payload**

Record the policy scope, classifications, explicit exclusions, candidate-only boundary, and deferred semantic review/promotion. Link the ADR to `api-specforge-mcp-tools`, `data-specforge-assets`, and the scan report contract.

- [ ] **Step 2: Synchronize design facts via MCP**

Run: `pnpm design-facts:sync`

Expected: target Scope receives the ADR, Proposal/Context Pack updates where required, and typed links without cross-scope writes.

- [ ] **Step 3: Open a target design-change session and rescan**

Run:

```powershell
$env:SPECFORGE_APPLICATION_SERVICE_ID='com.specforge.designcenter'
$env:SPECFORGE_SCOPE_PATH='pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter'
$env:SPECFORGE_SCAN_SESSION='<open-session-id>'
pnpm scan:workspace:mcp
```

Expected: a `RECEIVED` report when no required unsupported files remain, or a `BLOCKED` report that names only high-value missing extractors.

- [ ] **Step 4: Verify isolation and baseline safety**

Run read-only target and legacy Scope checks. Confirm observations exist only in `com.specforge.designcenter`, while approved asset counts and active Baseline are unchanged.

- [ ] **Step 5: Close session and commit evidence**

```bash
git add docs/adr docs/evidence
git commit -m "docs: record governed scan coverage rescan evidence"
```

## Plan Self-Review

- Coverage: Tasks 1-2 implement policy classification and report semantics; Task 3 adds the agreed high-value formats; Task 4 preserves the evidence through MCP; Task 5 enforces Scope, design-fact synchronization, candidate isolation, and operational validation.
- Placeholder scan: no TBD/TODO placeholders; the open session ID is intentionally runtime-generated rather than a design omission.
- Type consistency: policy types originate in Task 1, extend reports in Task 2, and are consumed by connector/persistence work in Tasks 3-4.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-16-governed-scan-coverage-policy.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** - execute tasks in this session with checkpoints.
