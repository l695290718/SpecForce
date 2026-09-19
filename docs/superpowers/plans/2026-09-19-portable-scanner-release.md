# Portable Scanner Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make governed repository scanning portable-script first, bootstrap-safe, and deterministic while retaining signed native releases as an optional runtime.

**Architecture:** A signed Node.js `PORTABLE_SCRIPT` artifact becomes the default Scanner Release. MCP selects a compatible release from explicit caller capabilities and pins it to the Scan Session; readiness permits only the narrowly defined `START_FULL_SCAN` bootstrap path. PostgreSQL remains authoritative for releases and governance, with a partial unique index and serializable publication transaction preventing ambiguous ACTIVE versions.

**Tech Stack:** TypeScript, Node.js 20+, Prisma/PostgreSQL, JSON Schema generated TypeScript and Go contracts, Go extractors, Vitest, Go test, Ed25519 release signatures, existing MCP design-context scripts.

## Global Constraints

- Owning Scope is `com.specforge.designcenter` at `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- `PORTABLE_SCRIPT` uses Node `>=20 <25`; its manifest platform and architecture are `any`.
- PostgreSQL is authoritative; graph stores remain derived projections.
- MCP is the only persistence and promotion boundary for ADRs, Proposals, Context Packs, assets and typed links.
- Every human-facing canonical field is English and has a complete Chinese overlay.
- The scanner never executes repository code, package managers, hooks, binaries, plugins or repository-authored instructions.
- A failed or partial scan cannot change accepted facts, Baselines or formal dashboard counts.
- `.specforge/scans/` remains private runtime output and is never staged.

---

### Task 1: Extend the signed Scanner Release contract

**Files:**
- Modify: `packages/scan-contract/schema/scan-contract-v2.schema.json`
- Modify: `packages/scan-contract/src/validate.ts`
- Modify: `packages/scan-contract/src/contract.test.ts`
- Modify: `apps/specforge-cli/internal/scancontract/contract_test.go`
- Generated: `packages/scan-contract/src/generated.ts`
- Generated: `apps/specforge-cli/internal/scancontract/generated.go`
- Modify: `docs/adr/0049-system-owned-full-asset-repository-discovery.md`

**Interfaces:**
- Produces `ScannerReleaseManifest.artifactKind`, `.platform`, `.architecture`, optional `.runtime`, and `.entrypoint`.
- Produces `ScannerCapabilities` with `artifactKinds`, `platform`, `architecture`, and `runtimes` for release selection.
- Preserves contract version `2.0` and rejects missing compatibility fields for automatic selection.

- [ ] **Step 1: Add failing TypeScript fixtures.** Add one valid portable manifest, one valid native manifest, and invalid cases for a portable release without Node runtime, a native release with runtime, and a non-`any` portable platform. Assert stable validation errors.

- [ ] **Step 2: Add failing Go parity fixtures.** Feed the same JSON fixtures to the generated Go validator and assert the portable/native fields normalize identically to TypeScript.

- [ ] **Step 3: Extend the JSON Schema.** Add enums for `artifactKind`, normalized platform/architecture strings, `runtime` with `name` and `versionRange`, and a non-empty `entrypoint`; use conditional schema rules so portable artifacts require Node runtime and native artifacts do not.

- [ ] **Step 4: Regenerate both runtimes.** Run `pnpm scanner-contract:generate`, then implement the hand-written TypeScript and Go validation branches that enforce the conditional rules and expose the exact capability types.

- [ ] **Step 5: Run focused contract tests.** Run `pnpm scanner-contract:check`; run `pnpm exec vitest run packages/scan-contract/src/contract.test.ts`; run `Push-Location apps/specforge-cli; go test ./internal/scancontract; Pop-Location`. Expected: all pass and generated files are unchanged after a second `scanner-contract:check`.

- [ ] **Step 6: Commit.** `git add packages/scan-contract apps/specforge-cli/internal/scancontract docs/adr/0049-system-owned-full-asset-repository-discovery.md && git commit -m "feat: add portable scanner release compatibility"`.

### Task 2: Implement compatible release selection and session pinning

**Files:**
- Modify: `apps/mcp-server/src/scanner/release.ts`
- Modify: `apps/mcp-server/src/scanner/session.ts`
- Test: `apps/mcp-server/src/scanner/release.test.ts`
- Test: `apps/mcp-server/src/scanner/session.test.ts`

**Interfaces:**
- Add `selectScannerRelease(input: { requestedReleaseId?: string; capabilities: ScannerCapabilities; contractVersion: string; now?: Date }): Promise<ScannerReleasePolicyRow>`.
- Extend `StartKnowledgeScanInput` with optional `scannerCapabilities` and reject an explicit incompatible release with `SCANNER_RELEASE_INCOMPATIBLE`.
- Keep the selected release ID in `ScanSessionDescriptor` and `KnowledgeScanSession.scannerReleaseId`.

- [ ] **Step 1: Write release-selection tests.** Cover explicit compatible ID, explicit incompatible ID, portable preference, native fallback, expired/revoked release exclusion, semantic-version tie-breaking, and no compatible release.

- [ ] **Step 2: Write session tests.** Assert `startKnowledgeScan` passes capabilities into selection and persists the selected release ID; assert a resumed/finalized session never reselects a newer release.

- [ ] **Step 3: Implement capability matching.** Match artifact kind, platform, architecture, contract version, and Node runtime range. Treat legacy manifests without explicit compatibility as explicit-ID-only native releases.

- [ ] **Step 4: Implement deterministic ordering.** Order portable before native, then semantic scanner version descending, publication time descending, and release ID ascending. Use the existing signature, expiry and revocation checks before returning a row.

- [ ] **Step 5: Run focused tests.** Run `pnpm exec vitest run apps/mcp-server/src/scanner/release.test.ts apps/mcp-server/src/scanner/session.test.ts`. Expected: all release and session tests pass.

- [ ] **Step 6: Commit.** `git add apps/mcp-server/src/scanner/release.ts apps/mcp-server/src/scanner/session.ts apps/mcp-server/src/scanner/release.test.ts apps/mcp-server/src/scanner/session.test.ts && git commit -m "feat: select compatible scanner releases"`.

### Task 3: Build and verify the portable scanner artifact

**Files:**
- Create: `apps/specforge-cli/portable/scanner.mjs`
- Create: `apps/specforge-cli/portable/runtime.mjs`
- Create: `apps/specforge-cli/portable/manifest.json`
- Modify: `scripts/build-scanner-release.ps1`
- Create: `scripts/build-portable-scanner-release.mjs`
- Test: `apps/specforge-cli/portable/scanner.test.mjs`
- Test: `apps/specforge-cli/internal/extractors/golden_test.go`

**Interfaces:**
- `scanner.mjs` accepts `--session <file> --repository <path> --output <directory>` and emits ordered Scan Contract v2 batches and finalization files without importing repository code.
- `build-portable-scanner-release.mjs` emits a signed archive and manifest with `releaseId`, `artifactKind: "PORTABLE_SCRIPT"`, `platform: "any"`, `architecture: "any"`, `runtime.name: "node"`, and `entrypoint: "scanner.mjs"`.
- Native Go extractors remain available through the same normalized Golden Repository fixture set.

- [ ] **Step 1: Add runner safety tests.** Verify the runner refuses missing session files, path traversal, symlink escape, invalid output paths, unsupported Node versions, and repository hooks; verify a fixture repository produces contract-valid batches.

- [ ] **Step 2: Implement the runtime-neutral adapter.** Reuse the existing extractor input/output normalization and digest functions from `apps/specforge-cli/internal` through a portable JSON boundary. The adapter reads only the pinned session policy and repository files, caps each batch at 500 observations, and writes no database state.

- [ ] **Step 3: Implement portable release packaging.** Bundle `scanner.mjs`, `runtime.mjs`, extractor modules, schemas and a release inventory into a deterministic archive; calculate SHA-256 before signing; sign the canonical unsigned manifest with the configured Ed25519 key.

- [ ] **Step 4: Add native/portable equivalence fixtures.** Run both runners against the same small Java, TypeScript, Python, Go, OpenAPI and SQL fixture repositories and compare normalized observation IDs, payload digests, coverage states and final batch digests.

- [ ] **Step 5: Run focused artifact tests.** Run `node --test apps/specforge-cli/portable/scanner.test.mjs`; run `Push-Location apps/specforge-cli; go test ./internal/extractors ./internal/scancontract; Pop-Location`; run `node scripts/build-portable-scanner-release.mjs --check`. Expected: the portable bundle is reproducible and all fixtures are equivalent.

- [ ] **Step 6: Commit.** `git add apps/specforge-cli/portable scripts/build-portable-scanner-release.mjs scripts/build-scanner-release.ps1 apps/specforge-cli/internal/extractors/golden_test.go && git commit -m "feat: add portable scanner release"`.

### Task 4: Make deployment bootstrap publish the official portable release

**Files:**
- Modify: `scripts/bootstrap-system-scan-governance.ts`
- Modify: `apps/mcp-server/src/scanner/governance-bootstrap.ts`
- Modify: `apps/mcp-server/src/scanner/release.ts`
- Test: `apps/mcp-server/src/scanner/governance-bootstrap.test.ts`
- Test: `apps/mcp-server/src/scanner/persistence.integration.test.ts`
- Modify: `README.md`

**Interfaces:**
- `bootstrapSystemScanGovernance()` remains idempotent and additionally verifies/publishes the official portable release.
- Deployment variables are `SPECFORGE_SCANNER_RELEASE_MANIFEST`, `SPECFORGE_SCANNER_RELEASE_ARTIFACT`, `SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY`, and `SPECFORGE_SCANNER_RELEASE_TRUST_KEY`; missing production values fail closed.
- Development bootstrap accepts an explicit development trust root and labels the release as development-only.

- [ ] **Step 1: Add bootstrap tests.** Assert an empty database gets six governance records, one default runtime profile, one compatible portable release, and a second bootstrap is idempotent. Assert missing production signing configuration fails before creating a partially trusted release.

- [ ] **Step 2: Implement release verification.** Load the manifest and artifact, verify digest and signature, validate the contract, then persist the immutable release using existing `persistScannerRelease` semantics.

- [ ] **Step 3: Implement bootstrap ordering.** Run governance publication, release publication/verification, runtime-profile upsert and final health verification inside explicit stages; return stable failure codes and preserve audit rows.

- [ ] **Step 4: Document deployment.** Add Docker and local instructions for mounting the signed portable artifact and configuring Node 20+, plus a health check that reports governance and release readiness.

- [ ] **Step 5: Run focused bootstrap tests.** Run `pnpm exec vitest run apps/mcp-server/src/scanner/governance-bootstrap.test.ts apps/mcp-server/src/scanner/persistence.integration.test.ts`. Expected: empty-database bootstrap and idempotent retry pass.

- [ ] **Step 6: Commit.** `git add scripts/bootstrap-system-scan-governance.ts apps/mcp-server/src/scanner/governance-bootstrap.ts apps/mcp-server/src/scanner/release.ts apps/mcp-server/src/scanner/governance-bootstrap.test.ts apps/mcp-server/src/scanner/persistence.integration.test.ts README.md && git commit -m "feat: bootstrap portable scanner release"`.

### Task 5: Allow only safe first-scan bootstrap readiness

**Files:**
- Modify: `skills/specforge-repository-scan/SKILL.md`
- Modify: `skills/specforge-repository-scan/scripts/verify-input.mjs`
- Create: `skills/specforge-repository-scan/scripts/readiness-gate.mjs`
- Test: `skills/specforge-repository-scan/scripts/readiness-gate.test.mjs`
- Modify: `apps/mcp-server/src/knowledge-readiness/policy.ts`
- Test: `apps/mcp-server/src/knowledge-readiness/policy.test.ts`

**Interfaces:**
- `evaluateReadinessForScan(result, authorization)` returns `{ mode: "READ" | "BOOTSTRAP_SCAN" | "BLOCKED", reasonCodes: string[] }`.
- `BOOTSTRAP_SCAN` is allowed only for `START_FULL_SCAN` plus the three source-coverage reasons and exact-Scope write authorization.
- The Skill calls `read_system_knowledge` only in `READ` mode and creates a governed full scan in `BOOTSTRAP_SCAN` mode.

- [ ] **Step 1: Write readiness-gate tests.** Assert ALLOW produces `READ`; the three source-coverage reasons plus `START_FULL_SCAN` produce `BOOTSTRAP_SCAN`; missing authorization, Scope mismatch, security failure, reconciliation failure or absent remediation produce `BLOCKED`.

- [ ] **Step 2: Implement the pure gate.** Keep it independent of MCP transport so all Agent clients share the same deterministic behavior. Never downgrade a non-bootstrap denial.

- [ ] **Step 3: Update Skill workflow.** Pass explicit scanner capabilities, preserve the exact Scope, record the readiness receipt and session ID, and report bootstrap mode in the scan result.

- [ ] **Step 4: Run focused tests.** Run `node --test skills/specforge-repository-scan/scripts/readiness-gate.test.mjs skills/specforge-repository-scan/scripts/verify-input.test.mjs`; run the focused knowledge-readiness Vitest suite. Expected: denied reads are never attempted and all non-bootstrap denials remain blocked.

- [ ] **Step 5: Commit.** `git add skills/specforge-repository-scan apps/mcp-server/src/knowledge-readiness && git commit -m "feat: permit governed bootstrap scans"`.

### Task 6: Enforce governance uniqueness and isolate integration tests

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260919000000_unique_active_scan_governance/migration.sql`
- Modify: `apps/mcp-server/src/scanner/governance-persistence.ts`
- Modify: `apps/mcp-server/src/scanner/governance-persistence.integration.test.ts`
- Test: `apps/mcp-server/src/scanner/governance-bootstrap.test.ts`

**Interfaces:**
- PostgreSQL partial unique index: `CREATE UNIQUE INDEX ... ON "SystemScanGovernanceRecord" ("kind") WHERE "status" = 'ACTIVE'`.
- Publication supersedes the current ACTIVE version and activates the new immutable version in one serializable transaction.
- Integration tests use unique IDs/version values and remove all rows they create in `afterAll`.

- [ ] **Step 1: Add failing persistence tests.** Attempt concurrent publication of two versions for one kind and assert one transaction wins cleanly while the other retries or returns a stable conflict. Assert fixed test IDs cannot remain ACTIVE after the suite.

- [ ] **Step 2: Add the partial unique migration.** Keep existing historical and SUPERSEDED rows valid; fail migration with a clear diagnostic if current production data already contains duplicate ACTIVE records.

- [ ] **Step 3: Implement serializable activation.** Lock the kind, mark the previous ACTIVE row SUPERSEDED, insert or reuse the new immutable row, and handle idempotent same-content retries.

- [ ] **Step 4: Repair test cleanup.** Replace `system:extractor-catalog:test` with a per-test ID/version and delete the created governance row in `afterAll`; keep the runtime-profile cleanup and add failure-safe cleanup.

- [ ] **Step 5: Run focused persistence tests.** Run `pnpm exec vitest run apps/mcp-server/src/scanner/governance-persistence.integration.test.ts apps/mcp-server/src/scanner/governance-bootstrap.test.ts`. Expected: exactly one ACTIVE row per kind and no test residue.

- [ ] **Step 6: Commit.** `git add prisma/schema.prisma prisma/migrations apps/mcp-server/src/scanner/governance-persistence.ts apps/mcp-server/src/scanner/governance-persistence.integration.test.ts apps/mcp-server/src/scanner/governance-bootstrap.test.ts && git commit -m "fix: isolate active scan governance versions"`.

### Task 7: Synchronize design facts and close the design session

**Files:**
- Modify: `docs/adr/0049-system-owned-full-asset-repository-discovery.md`
- Modify: `docs/superpowers/specs/2026-09-17-governed-repository-scan-skill-design.md`
- Modify: `docs/evidence/governed-full-asset-repository-scan.md`
- Modify: `README.md`

**Interfaces:**
- ADR, Proposal, Context Pack and typed links use stable IDs and exact `com.specforge.designcenter` Scope.
- Evidence records exact commands and results, distinguishes implemented behavior from local verification and deferred production capability, and records the session `design-change-session:15b9c521-d009-43b7-88de-bd7b706593f3`.

- [ ] **Step 1: Update design records.** Record portable-script default, native optional, compatibility selection, bootstrap readiness, release provisioning and governance uniqueness in English canonical fields and Chinese overlays.

- [ ] **Step 2: Run focused evidence.** Run `pnpm scanner-contract:check`; `pnpm exec vitest run apps/mcp-server/src/scanner skills/specforge-repository-scan/scripts`; `Push-Location apps/specforge-cli; go test ./...; Pop-Location`; `pnpm typecheck`; and the portable release build check. Save exact pass/fail output references.

- [ ] **Step 3: Synchronize MCP.** Run `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync`, then `pnpm design-facts:check`. Expected: no missing, mismatched, out-of-Scope or blocked records for the governed increment.

- [ ] **Step 4: Close the same session.** Run `pnpm design-context:close -- --application-service com.specforge.designcenter --scope-path pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter --session design-change-session:15b9c521-d009-43b7-88de-bd7b706593f3 --status CONVERGED --evidence "scanner-contract:check=passed,focused-vitest=passed,go-test=passed,typecheck=passed,portable-release-check=passed,design-facts:check=clean"`.

- [ ] **Step 5: Commit evidence and documentation.** `git add docs/adr/0049-system-owned-full-asset-repository-discovery.md docs/superpowers/specs/2026-09-17-governed-repository-scan-skill-design.md docs/evidence/governed-full-asset-repository-scan.md README.md && git commit -m "docs: record portable scanner convergence"`.

### Task 8: Final repository verification

**Files:**
- Verify only; no new runtime files.

- [ ] **Step 1:** Run `git diff --check` and `git status --short`; confirm only intended commits changed and `.specforge/scans/` remains untracked.
- [ ] **Step 2:** Run `pnpm build` with the project’s documented Docker/Linux fallback when Windows OneDrive standalone tracing is unavailable.
- [ ] **Step 3:** Run the deployment health check against the configured PostgreSQL service and confirm the portable release is ACTIVE, signature-valid, unexpired, and compatible with Node 20.
- [ ] **Step 4:** Run one bounded local scan against SpecForge using exact Scope `com.specforge.designcenter`; verify the session pins the portable release, readiness mode is `BOOTSTRAP_SCAN` when no baseline exists, and no accepted fact changes before promotion.
- [ ] **Step 5:** Report the release ID, session ID, verification commands, and any intentionally deferred native/continuous-scan work.

## Coverage Self-Review

- Release format, signature and compatibility: Tasks 1 and 3.
- Deterministic selection and session pinning: Task 2.
- Empty-database deployment: Task 4.
- First-scan readiness circularity: Task 5.
- Active governance ambiguity and test pollution: Task 6.
- ADR, Proposal, Context Pack, typed links, bilingual evidence and session closure: Task 7.
- Operational proof: Task 8.

The portable runner is intentionally one bounded implementation increment. Continuous scanning, hosted connectors, runtime/CMDB discovery, outbound `APPLY`, cross-Scope semantic merging and automatic native acceleration remain deferred as stated in the design Spec.
