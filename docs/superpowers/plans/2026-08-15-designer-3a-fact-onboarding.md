# Designer 3A Fact Onboarding Implementation Plan

> **Execution status (2026-08-15): COMPLETE for the initial slice and controlled membership expansion.** The exact Designer Scope was read through MCP, the initial bilingual batch of 4 units, 7 memberships, and 3 mappings was published as `knowledge-baseline:designer:3a:v1`, then a complete-snapshot coverage batch published `knowledge-baseline:designer:3a:v3` with 4 units, 18 memberships, and 3 mappings. Both paths were reviewed, promoted, reconciled as `CONVERGED`, and projected as `READY` Manifests. Unclassified enterprise semantics remain explicit follow-up work.

Evidence: `docs/evidence/designer-3a-onboarding-evidence.md`, `docs/evidence/designer-3a-candidate-review.md`, and `docs/evidence/designer-3a-coverage-expansion-evidence.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the governed MCP authoring capability to publish an evidence-backed initial BIZ-to-SYS-to-TECH architecture map for `com.huawei.celon.desiner` without inventing semantics or bypassing review.

**Architecture:** Onboarding is a governed data operation, not a database seed and not a source-code fixture. An Agent reads the live exact-Scope catalog and relationships, produces a reviewable evidence matrix and MCP batch, then follows approval, promotion, reconciliation, Baseline, projection, and read-back stages. Ambiguous coverage remains explicit backlog data.

**Tech Stack:** SpecForge MCP tools, PostgreSQL, existing 3A query/projector services, pnpm governance scripts, Vitest fixtures only for workflow verification, in-app browser acceptance.

## Global Constraints

- This plan depends on successful completion and synchronization of `2026-08-15-governed-3a-architecture-fact-authoring.md`.
- Exact Scope is `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Read current facts before proposing units; do not hard-code invented business capabilities, systems, platforms, memberships, or mappings.
- English canonical fields are required and Chinese overlays must be complete.
- Every unit, membership, and mapping requires stable evidence references from the live Scope.
- MCP is the only write boundary; no direct Prisma, SQL, seed, or projection-table write is allowed.
- Weak or ambiguous classifications remain blocked or rejected and are recorded as coverage gaps.
- The current published Baseline remains available until a new generation reaches `READY`.

---

### Task 1: Open the onboarding session and capture the live evidence inventory

**Files:**
- Create: `docs/evidence/designer-3a-onboarding-evidence.md`
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`

**Interfaces:**
- Consumes: `prepare_design_change`, current exact-Scope design catalog, typed relationships, latest reconciliation, published Baseline and Projection identities.
- Produces: an implementation session ID and a bilingual evidence matrix with stable source IDs and no proposed semantics yet.

- [ ] **Step 1: Open a new exact-Scope implementation session**

Run and capture the exact session ID:

```powershell
$preflightOutput = pnpm design-context:preflight -- --intent "Onboard evidence-backed governed BIZ SYS TECH architecture facts for the Designer Scope through MCP" --affected "adr-readable-3a-architecture-mapping,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "live-scoped-catalog,typed-relationships,published-baseline"
$designerOnboardingSessionId = [regex]::Match(($preflightOutput -join "`n"), '"sessionId":\s*"([^"]+)"').Groups[1].Value
if (-not $designerOnboardingSessionId) { throw "DESIGN_CHANGE_SESSION_RECEIPT_MISSING" }
```

Expected: an OPEN `DesignChangeSession` in the exact Designer Scope with design and relationship digests and no blocked reconciliation.

- [ ] **Step 2: Read the current live scoped inventory**

Use MCP/query tools to read the published Baseline, APIs, events, data models, rules, state machines, ADRs, quality requirements, integrations, runtime/deployment facts, accepted assertions, and typed relationships. Record exact IDs, active revisions, language coverage, and evidence references. Do not use repository filenames or labels as sufficient semantic proof.

- [ ] **Step 3: Write the evidence matrix**

For every source fact record this structure in `docs/evidence/designer-3a-onboarding-evidence.md`:

```markdown
| Source ID | Type | Canonical meaning | Chinese overlay | Candidate layer | Candidate unit | Evidence strength | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api-id | API | exact live description | exact live zh description | SYS | unresolved | direct | review |
```

Use `accepted`, `review`, or `insufficient` as the decision. The document must state that candidate layer and unit are proposals until review.

- [ ] **Step 4: Verify inventory completeness and Scope isolation**

Compare returned counts with the dashboard/catalog counts for the same Scope and confirm no source ID belongs to a sibling application service. Record the commands or MCP receipts and results in the evidence document.

- [ ] **Step 5: Commit evidence only**

```powershell
git add docs/evidence/designer-3a-onboarding-evidence.md docs/adr/0025-readable-3a-architecture-mapping.md
git commit -m "docs: capture Designer 3A onboarding evidence"
```

### Task 2: Prepare the minimal coherent architecture candidate batch

**Files:**
- Create: `docs/evidence/designer-3a-candidate-review.md`

**Interfaces:**
- Consumes: Task 1 evidence matrix and `ArchitectureFactBatchSubmission` contract.
- Produces: one bounded bilingual candidate batch with at least one evidence-backed BIZ-to-SYS-to-TECH chain and a documented blocker list.

- [ ] **Step 1: Select only direct-evidence candidates**

Choose the smallest set that explains one complete chain. Every unit requires at least one direct source fact; every membership resolves to an accepted assertion or promoted asset; every mapping cites an explicit typed relationship or a reviewed architectural decision that states the mapping.

- [ ] **Step 2: Define stable identities and bilingual content**

Use deterministic IDs derived from reviewed semantic identities with `unit:${layer.toLowerCase()}:${slugify(reviewedSemanticIdentity)}`. Names and descriptions must quote the meaning of live evidence in original words without copying long source passages. Include complete Chinese overlays.

- [ ] **Step 3: Document the proposed batch before writing**

In `docs/evidence/designer-3a-candidate-review.md`, list each proposed unit, membership, mapping, evidence reference, confidence, unresolved question, and rejection rationale. Include the calculated batch counts and verify they remain below 100/1,000/500/4 MiB.

- [ ] **Step 4: Record unclassified coverage**

List every source fact not selected for the initial chain by reason: outside first slice, ambiguous layer, ambiguous membership, missing relationship, missing bilingual content, or stale evidence. Assign owner `SpecForge Architecture`, trigger `after first governed chain is published and coverage is measured`, and rationale `avoid speculative mass classification`.

- [ ] **Step 5: Commit the reviewable candidate design**

```powershell
git add docs/evidence/designer-3a-candidate-review.md
git commit -m "docs: propose Designer 3A architecture candidates"
```

### Task 3: Submit, review, and promote through MCP

**Files:**
- Modify: `docs/evidence/designer-3a-candidate-review.md`

**Interfaces:**
- Consumes: approved Task 2 candidate batch and generic MCP authoring tools.
- Produces: candidate batch receipt, Review Bundle, authorized decision, promotion receipt, and committed ChangeSet.

- [ ] **Step 1: Submit the candidate batch through MCP**

Call `submit_3a_architecture_fact_batch` with the exact Scope, current onboarding session, stable batch ID, idempotency key, provider-neutral provenance, complete evidence, and the reviewed arrays. Repeat the identical call once and assert the second receipt is idempotent with the same digest and revision IDs.

- [ ] **Step 2: Assemble and inspect the Review Bundle**

Create the shared Review Bundle with all architecture revision IDs. Verify coverage is complete, blockers are empty, risk tier follows server policy, and the bundle references the same design session and Scope. If any blocker exists, stop promotion, record it, and correct by creating a new batch revision.

- [ ] **Step 3: Record the authorized review decision**

Call `decide_knowledge_review_bundle` with `APPROVE` only for the exact reviewed revision set. The decision must include evidence and a reason that identifies the human-authorized review. Rejected or omitted candidates remain outside promotion.

- [ ] **Step 4: Promote and commit atomically**

Create or reuse a named Working Stream, call `promote_3a_architecture_facts`, and verify the returned receipt contains the exact architecture revision IDs and ChangeSet. Repeat the call and assert idempotent receipt reuse.

- [ ] **Step 5: Append receipts to the review document**

Record batch ID/digest, Review Bundle ID/digest, decision ID, promotion receipt ID/digest, stream ID, ChangeSet ID/sequence, actor identities, and exact MCP results. Do not record tokens or credentials.

- [ ] **Step 6: Commit governance receipts**

```powershell
git add docs/evidence/designer-3a-candidate-review.md
git commit -m "docs: record Designer 3A promotion receipts"
```

### Task 4: Reconcile, publish, build, and read back the new generation

**Files:**
- Modify: `docs/evidence/designer-3a-candidate-review.md`
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`

**Interfaces:**
- Consumes: Task 3 promotion receipt and ChangeSet.
- Produces: converged reconciliation, immutable Baseline, READY projection, MCP query read-back, and Web-visible architecture chain.

- [ ] **Step 1: Reconcile promoted architecture facts**

Call `reconcile_knowledge_baseline` for the promotion receipt. Assert `CONVERGED`, exact Scope, exact ChangeSet, exact architecture revision IDs, and matching digests. A mismatch blocks publication.

- [ ] **Step 2: Publish a new immutable Baseline**

Call `publish_knowledge_baseline` with the Working Stream, ChangeSet, current asset/relationship revision IDs, architecture revision IDs, relationship version, and reconciliation receipt. Verify the previous Baseline is preserved or superseded according to current policy and the new manifest contains the exact architecture revision IDs.

- [ ] **Step 3: Build and await the projection**

Call `request_3a_projection_build` with profile `generic-system`, its current version, and schema `3a.v2`. Poll the bounded status tool until `READY` or terminal failure. Record generation and Projection Manifest IDs. Do not retry a terminal semantic validation error under a new identity without correcting the source facts.

- [ ] **Step 4: Read back through MCP and PostgreSQL projection APIs**

Call `query_3a_architecture_map` and `query_3a_architecture_unit_neighborhood`. Assert at least one BIZ, SYS, and TECH unit, two cross-layer mappings forming a complete chain, expected memberships, exact Baseline/generation/manifest identity, bilingual names, and no unexpected Scope.

- [ ] **Step 5: Perform one browser acceptance pass**

Open `/architecture/3a?scope=com.huawei.celon.desiner&mode=graph&graphRepresentation=map`. Verify visible BIZ/SYS/TECH labels, one readable complete chain without hover or zoom, unit drill-down, bilingual Inspector content, evidence/completeness metadata, Network compatibility, no horizontal mobile overflow, and no new console errors.

- [ ] **Step 6: Record publication evidence**

Append exact MCP calls/results, Baseline ID, generation ID, Projection Manifest ID, returned unit/mapping counts, browser route, and acceptance result to the evidence document and ADR.

### Task 5: Synchronize design facts and close the onboarding session

**Files:**
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`

**Interfaces:**
- Consumes: all Task 1-4 receipts and verification evidence.
- Produces: synchronized ADR/Proposal/Context Pack and links, explicit remaining coverage backlog, and a closed exact-Scope onboarding session.

- [ ] **Step 1: Update implementation status and remaining coverage**

Mark the first governed chain as implemented only if MCP and browser read-back succeeded. Update the backlog with remaining unclassified coverage, owner, trigger, and rationale. Do not mark full Designer classification complete unless the measured unclassified count is zero.

- [ ] **Step 2: Run design-fact synchronization and reconciliation**

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: synchronization is `complete`; `missing`, `mismatched`, `outOfScope`, and `blocked` are empty; ADR, Proposal, Context Pack, Evidence, and typed links read back from the exact Scope.

- [ ] **Step 3: Close the same onboarding session**

```powershell
pnpm design-context:close -- --session $designerOnboardingSessionId --status CONVERGED --evidence "live-inventory=verified; architecture-batch=idempotent; review=approved; promotion=committed; reconciliation=converged; baseline=published; projection=ready; mcp-map-readback=complete-chain; browser=accepted; design-facts-check=clean"
```

Expected: the exact Designer Scope session returns `CONVERGED`. If publication or synchronization fails, close as `BLOCKED` with the reason and retry trigger and record `MCP synchronization blocked`.

- [ ] **Step 4: Commit final onboarding evidence**

```powershell
git add docs/evidence/designer-3a-onboarding-evidence.md docs/evidence/designer-3a-candidate-review.md docs/adr/0025-readable-3a-architecture-mapping.md docs/design-facts/baseline-manifest.json docs/TODO.md
git commit -m "docs: publish Designer governed 3A architecture facts"
```

## Coverage Review

- Live evidence inventory and isolation: Task 1.
- Evidence-backed bilingual candidate selection and explicit gaps: Task 2.
- MCP-only submission, review, approval, promotion, and idempotency: Task 3.
- Reconciliation, Baseline, deterministic projection, MCP read-back, and browser acceptance: Task 4.
- ADR/Proposal/Context Pack synchronization, backlog, and session closure: Task 5.

## Execution Handoff

This plan must run only after the generic authoring plan is complete and the user explicitly approves code and data implementation. Exact unit names and memberships are intentionally absent from this plan because they must be derived from the live scoped evidence during Task 1.
