# Parallel Governance Workstreams Implementation Plan

> **For agentic workers:** Implement task-by-task with a fresh focused review after each task. Keep the exact Scope and MCP closure requirements active throughout.

**Goal:** Deliver a provider-neutral ScopedPrincipal boundary, a read-only CI Change Attestation verification contract, and reconciled bilingual governance records without claiming CodeHub or enterprise-IdP delivery.

**Architecture:** Core owns the normalized principal shape and pure Scope decision rules. MCP owns credential-boundary normalization, audit-safe request context, and the read-only attestation verification tool. The CI contract consumes signed attestations and recomputed repository evidence; it does not call CodeHub APIs or write authored facts directly. PostgreSQL remains authoritative.

**Tech Stack:** TypeScript, Vitest, Prisma/PostgreSQL, MCP SDK, existing Ed25519 signing format, Go CLI fixtures.

## Global Constraints

- Every operation requires the exact application-service Scope `com.huawei.celon.desiner` and its canonical Scope path.
- Missing, malformed, expired, revoked, or provider-unavailable credentials fail closed.
- Seed claims are development-only and cannot be accepted as production identity proof.
- English remains canonical; human-facing decision content requires a complete Chinese overlay.
- CodeHub/CodeArts adapters, protected-branch configuration, live enterprise IdP integration, cross-Scope joins, and graph authority changes remain deferred.
- PostgreSQL is authoritative for authored facts and relationship events; graph stores remain derived projections.
- The preflight receipt is `design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb`; the same session must close through MCP after verification and read-back.

---

### Task 1: Add the provider-neutral ScopedPrincipal contract

**Files:**
- Create: `packages/core/src/architecture/principal.ts`
- Modify: `packages/core/src/architecture/types.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/principal.test.ts`

**Interfaces:**
- Consumes: `ArchitectureScopeRegistry`, `ArchitectureScope`, `ScopeGrant`, and `ScopedActor` from `packages/core/src/architecture/types.ts`.
- Produces: `ScopedPrincipal`, `PrincipalClaims`, `normalizePrincipalClaims`, and `authorizePrincipalScope` for MCP authentication code.

- [x] **Step 1: Write failing principal tests** covering normalized subject/tenant/source, duplicate grants, unsupported actor type, exact application-service Scope, parent-only denial, sibling denial, read/write distinction, and missing claims.
- [x] **Step 2: Run `pnpm --filter @specforge/core test -- principal.test.ts` and confirm the new symbols are missing.**
- [x] **Step 3: Implement `ScopedPrincipal` and pure normalization/authorization functions.** Preserve `ScopedActor` compatibility by making the principal structurally usable wherever an actor is expected; never infer a Scope from a parent grant.
- [x] **Step 4: Run `pnpm --filter @specforge/core test -- principal.test.ts` and `pnpm --filter @specforge/core typecheck`; expect all principal cases to pass.**
- [x] **Step 5: Commit `feat: add scoped principal authorization contract`.**

### Task 2: Route MCP HTTP claims through the normalized principal

**Files:**
- Modify: `apps/mcp-server/src/auth.ts`
- Modify: `apps/mcp-server/src/index.ts`
- Modify: `apps/mcp-server/src/federation/tools.ts`
- Test: `apps/mcp-server/src/auth.test.ts`
- Test: `apps/mcp-server/src/federation/tools.test.ts`

**Interfaces:**
- Consumes: `normalizePrincipalClaims` and `authorizePrincipalScope` from Task 1.
- Produces: request auth metadata with stable `subject`, `tenantId`, `authSource`, normalized grants, and redacted decision reference; seed mode remains explicit.

- [x] **Step 1: Add failing tests for static bearer claims, seed claims, malformed claims, missing actor identity, exact Scope denial, and audit-safe metadata.**
- [x] **Step 2: Run the focused MCP tests and confirm the current raw-claims path fails the new expectations.**
- [x] **Step 3: Add a verifier-neutral `BearerClaimsVerifier` interface and normalize the existing environment claims through it; do not add an IdP SDK or persist bearer tokens.**
- [x] **Step 4: Update `requestActor`, `auditActor`, and HTTP `buildAuthInfo` to consume normalized principal metadata while preserving existing tool permission names and seed behavior.**
- [x] **Step 5: Run `pnpm --filter @specforge/mcp-server test -- auth.test.ts federation/tools.test.ts` and `pnpm --filter @specforge/mcp-server typecheck`; expect existing scope isolation tests plus new principal tests to pass.**
- [x] **Step 6: Commit `feat: normalize MCP scoped principals`.**

### Task 3: Add the provider-neutral CI attestation verification contract

**Files:**
- Create: `apps/mcp-server/src/federation/attestation-verification.ts`
- Modify: `apps/mcp-server/src/federation/tools.ts`
- Test: `apps/mcp-server/src/federation/attestation-verification.test.ts`
- Modify: `apps/specforge-cli/main.go`
- Test: `apps/specforge-cli/main_test.go`

**Interfaces:**
- Consumes: normalized principal authorization from Task 2 and existing `ChangeAttestation` payload/signature format from `apps/mcp-server/src/federation/attestation.ts`.
- Produces: `verify_change_attestation` read-only MCP tool and deterministic CI verification results: `VERIFIED`, `ATTESTATION_MISSING`, `ATTESTATION_TREE_MISMATCH`, `ATTESTATION_SCOPE_COVERAGE_INCOMPLETE`, `ATTESTATION_SESSION_NOT_CONVERGED`, `ATTESTATION_KEY_REVOKED`, or signature/expiry failures.

- [x] **Step 1: Write failing TypeScript tests for valid proof, repository mismatch, committed-tree mismatch, missing multi-Scope coverage, invalid signature, expired proof, revoked key, non-converged session, and sibling-Scope denial.**
- [x] **Step 2: Implement pure canonical-payload signature and evidence validation, reading current session/reconciliation state only through exact Scope predicates.**
- [x] **Step 3: Register `verify_change_attestation` as read-only with `asset:read` and `governance:run`; require every submitted Scope binding to pass the caller's exact read grant and never mutate authored facts.**
- [x] **Step 4: Extend the Go local verification fixture to validate repository identity, committed tree, required Scope coverage, and trusted/revoked key policy while keeping the local Hook behavior unchanged.**
- [x] **Step 5: Run `pnpm --filter @specforge/mcp-server test -- federation/attestation-verification.test.ts federation/tools.test.ts`, `pnpm --filter @specforge/mcp-server typecheck`, and `go test ./...` in `apps/specforge-cli`; expect deterministic failures for every invalid fixture.**
- [x] **Step 6: Commit `feat: add provider-neutral CI attestation verification`.**

### Task 4: Reconcile bilingual design-fact records

**Files:**
- Modify: `docs/TODO.md`
- Modify: `docs/adr/0017-local-git-hook-change-attestation.md`
- Create: `docs/adr/0021-parallel-governance-workstreams.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Test: `scripts/design-fact-manifest.test.ts`

- [x] **Step 1: Update the new ADR with English canonical decisions, complete Chinese overlays, explicit non-goals, and the exact verification commands from Tasks 1–3.**
- [x] **Step 2: Change the manifest and TODO only where the records disagree with verified delivery; retain CodeHub adapters, enterprise IdP, external APPLY, live connectors, and scale certification as deferred.**
- [x] **Step 3: Run `pnpm vitest run scripts/design-fact-manifest.test.ts` and `git diff --check`; expect the manifest to reference the ADR and the deferred boundaries to remain explicit.**
- [x] **Step 4: Run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the exact-Scope federation check; record the results in the ADR.**
- [x] **Step 5: Commit `docs: reconcile parallel governance design facts`.**

### Task 5: Close the design-change session

**Files:**
- Modify: `docs/adr/0021-parallel-governance-workstreams.md`
- Modify: `docs/TODO.md`

- [x] **Step 1: Run the focused verification commands from Tasks 1–4 as one final evidence batch.**
- [x] **Step 2: Close `design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb` with `pnpm design-context:close -- --session design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb --status CONVERGED --evidence "core-tests=PASS,mcp-tests=PASS,go-tests=PASS,manifest-check=PASS,design-facts-readback=PASS,scope-reconciliation=PASS"`.**
- [x] **Step 3: Verify the MCP receipt is `CONVERGED`, the exact Scope matches, and no blocking issue remains.**
- [x] **Step 4: Commit the final evidence update and report only the capabilities supported by the receipt.**

## Self-Review

- The spec's three workstreams map to Tasks 1–4.
- The provider-neutral boundary is separated from CodeHub and IdP adapters.
- Every code task has named files, interfaces, focused tests, commands, and expected results.
- Production capabilities that require external systems remain explicitly deferred.
- The preflight session, MCP synchronization, read-back, and close requirements are represented in Task 5.
