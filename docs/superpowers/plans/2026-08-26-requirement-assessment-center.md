# Evidence-Driven Requirement Assessment Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a first-stage, exact-Scope requirement assessment workflow that produces evidence-backed feasibility, impact, planning ranges, AI Work Units, model-specific Token ranges, and independent review results without claiming uncalibrated P50/P90 accuracy.

**Architecture:** Add a durable Requirement Assessment domain beside the existing Proposal Impact domain. PostgreSQL stores scoped operational runs, immutable evidence snapshots, report revisions, profiles, and execution actuals; graph traversal remains a bounded derived read capability. MCP owns requirement submission, assessment lifecycle, formal Proposal/Context Pack draft creation, and typed design links; the Web console is a read-oriented role view over the same report revision.

**Tech Stack:** TypeScript, pnpm workspaces, `@specforge/core`, Prisma 6/PostgreSQL 16, Vitest, Next.js 15 App Router, existing `ImpactAnalysisWorker` lease pattern, existing MCP server, Docker Compose on Web port `3010`.

## Global Constraints

- Every operation targets the exact application-service Scope `com.huawei.celon.desiner` and scope path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL is authoritative for authored assets, assessment records, relationship events, evidence snapshots, and execution actuals; graph data is a rebuildable derived projection.
- Formal ADR, Proposal, Context Pack, and typed-link writes use MCP; no script writes those records directly to PostgreSQL.
- English is canonical for all human-facing assessment fields; complete Chinese localized overlays are mandatory.
- Phase 1 uses `MockAIProvider`; `OpenAIProvider` remains an unconfigured boundary and no real model call is added.
- Phase 1 reports `planningRange`, `riskAdjustedRange`, and `HEURISTIC` calibration status. `P50/P90` labels are emitted only when a calibrated profile passes sample and backtesting gates.
- Repository content, requirement text, source comments, and imported documents are untrusted evidence data and cannot override Governance Profile, Scope, tools, budgets, or exemptions.
- Accepted assessments do not authorize implementation. A separate implementation `DesignChangeSession` is required, and stale assessments are rejected by preflight.
- Do not modify unrelated user changes, `.tmp/`, or existing deployment defaults outside this feature.

---

## File Map

Create the following focused units:

- `packages/core/src/requirement-assessment/types.ts`: domain records, statuses, verdicts, profile and estimate contracts.
- `packages/core/src/requirement-assessment/state.ts`: legal lifecycle transitions and stale invalidation reasons.
- `packages/core/src/requirement-assessment/coverage.ts`: requirement-kind evidence policies and deterministic coverage/confidence caps.
- `packages/core/src/requirement-assessment/estimation.ts`: AI Work Unit, planning-range, risk-range, and calibration-gate calculations.
- `packages/core/src/requirement-assessment/evidence.ts`: bounded evidence resolver and immutable snapshot builder interfaces.
- `packages/core/src/requirement-assessment/freshness.ts`: waterline and snapshot invalidation checks.
- `packages/core/src/requirement-assessment/index.ts`: public exports.
- `apps/requirement-assessment-worker/src/repository.ts`: scoped Prisma persistence and lease operations.
- `apps/requirement-assessment-worker/src/worker.ts`: durable staged orchestration.
- `apps/requirement-assessment-worker/src/main.ts`: production polling loop and health endpoint.
- `apps/requirement-assessment-worker/src/index.ts`: runtime factory and exports.
- `apps/mcp-server/src/assessment/tools.ts`: MCP request, read, cancel, accept, draft, and actual operations.
- `apps/web/lib/requirement-assessment.ts`: request-scoped Web read and route helpers.
- `apps/web/components/requirement-assessment/`: role views, status display, evidence matrix, impact panel, and estimate panel.
- `apps/web/app/requirement-assessment/`: intake, list, and detail routes.

Modify only the corresponding Prisma schema/migration, AI Provider contracts, MCP tool registry, Web i18n, Compose topology, package workspace metadata, deployment guide, design-fact manifest, ADR, Proposal, Context Pack, and focused tests.

---

### Task 1: Register the governed design facts and open the implementation gate

**Files:**
- Create: `docs/adr/0041-evidence-driven-requirement-assessment.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md` with Phase 2/3 calibration and connector backlog facts
- Test: `scripts/design-fact-manifest.test.ts`

**Interfaces:**
- Produces MCP IDs: `adr-requirement-assessment-center`, `proposal-requirement-assessment-center`, `context-pack-requirement-assessment-center`, `api-specforge-requirement-assessment`, `data-specforge-requirement-assessment`, `data-specforge-assessment-evidence-snapshot`, `data-specforge-model-profile`, `data-specforge-agent-execution-profile`, `rule-specforge-assessment-acceptance`, and `quality-specforge-assessment-confidence`.
- Produces an implementation session receipt whose ID is recorded in the ADR, plan evidence, and final closure.

- [ ] **Step 1: Write the bilingual ADR and baseline-manifest decision entry**

Record the approved hybrid design, the Phase 1 boundary, exact Scope, all managed asset IDs, the hard constraints, the accepted non-goals, and the distinction between heuristic ranges and calibrated percentiles. Add directional typed links: Proposal `IMPACTS` API/data/rules, Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal, ADR `DECIDES` API/data/rule/quality assets, and Evidence `VALIDATES` the ADR.

- [ ] **Step 2: Validate the manifest before synchronization**

Run:

```powershell
pnpm exec vitest run scripts/design-fact-manifest.test.ts
```

Expected: all manifest tests pass and the new decision has exact Scope, English canonical fields, Chinese overlays, managed assets, and typed relationships.

- [ ] **Step 3: Synchronize the design records through MCP**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS="adr-requirement-assessment-center"
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: the ADR, Proposal, Context Pack, managed assets, typed links, and evidence read back with zero missing, mismatched, out-of-Scope, or blocked facts. If synchronization fails, record `MCP synchronization blocked` with the failure reason and retry trigger; do not continue to code.

- [ ] **Step 4: Open the exact-Scope implementation session**

Run:

```powershell
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Implement Phase 1 evidence-driven requirement assessment center with durable runs, immutable evidence snapshots, heuristic estimates, independent review, and stale-assessment rejection" --affected "adr-requirement-assessment-center,api-specforge-requirement-assessment,data-specforge-requirement-assessment,data-specforge-assessment-evidence-snapshot,data-specforge-model-profile,data-specforge-agent-execution-profile,rule-specforge-assessment-acceptance,quality-specforge-assessment-confidence" --evidence "approved-spec:docs/superpowers/specs/2026-08-26-evidence-driven-requirement-assessment-design.md,approved-plan:docs/superpowers/plans/2026-08-26-requirement-assessment-center.md"
```

Expected: an `OPEN` `DesignChangeSession` with the exact Scope and a design-context digest. Store its session ID as `SPECFORGE_IMPLEMENTATION_SESSION_ID` for every later task.

- [ ] **Step 5: Commit the governance record changes**

```powershell
git add docs/adr/0041-evidence-driven-requirement-assessment.md docs/design-facts/baseline-manifest.json docs/TODO.md scripts/design-fact-manifest.test.ts
git commit -m "docs: govern requirement assessment center"
```

Expected: one focused commit containing only the design records and their manifest test updates.

---

### Task 2: Add core contracts, deterministic coverage, and estimate semantics

**Files:**
- Create: `packages/core/src/requirement-assessment/types.ts`
- Create: `packages/core/src/requirement-assessment/state.ts`
- Create: `packages/core/src/requirement-assessment/coverage.ts`
- Create: `packages/core/src/requirement-assessment/estimation.ts`
- Create: `packages/core/src/requirement-assessment/freshness.ts`
- Create: `packages/core/src/requirement-assessment/index.ts`
- Modify: `packages/core/src/ai/types.ts`
- Modify: `packages/core/src/ai/providers.ts`
- Modify: `packages/core/src/ai/generate.ts`
- Test: `packages/core/src/requirement-assessment/*.test.ts`
- Test: `packages/core/src/__tests__/ai-provider.test.ts`

**Interfaces:**

```ts
export type AssessmentRunStatus =
  | "QUEUED" | "RESOLVING_EVIDENCE" | "WAITING_FOR_EVIDENCE"
  | "WAITING_FOR_PROJECTION" | "ANALYZING" | "ESTIMATING"
  | "REVIEWING" | "COMPLETE" | "FAILED"
  | "CANCELLATION_REQUESTED" | "CANCELLED";

export type AssessmentLifecycle =
  | "DRAFT" | "EVIDENCE_READY" | "ASSESSED"
  | "REVIEWED" | "ACCEPTED" | "STALE" | "SUPERSEDED";

export type FeasibilityVerdict = "FEASIBLE" | "CONDITIONAL" | "BLOCKED" | "INSUFFICIENT_EVIDENCE";

export interface AssessmentScopeRef { applicationServiceId: string; scopePath: string; }
export interface AssessmentRunRef extends AssessmentScopeRef { id: string; enterpriseId: string; }
export interface AssessmentEvidenceSnapshotRef extends AssessmentScopeRef {
  id: string; catalogWaterline: string; relationshipWaterline: string;
  projectionCheckpoint: string | null; rulesetRevision: string;
  coveragePolicyRevision: string; contentDigest: string;
}
export interface AssessmentEstimate {
  sizeClass: "XS" | "S" | "M" | "L" | "XL";
  planningRange: { min: number; max: number; unit: "person-days" | "tokens" };
  riskAdjustedRange: { min: number; max: number; unit: "person-days" | "tokens" };
  calibrationStatus: "HEURISTIC" | "CALIBRATED_P50_P90";
  confidence: number; sensitivity: Array<{ factor: string; impact: "low" | "medium" | "high" }>;
}
export interface ModelProfile {
  id: string; revision: number; provider: string; model: string;
  inputPrice?: number; outputPrice?: number; contextLimit: number;
  approvedDataClasses: string[]; calibration: CalibrationState;
}
export interface AgentExecutionProfile {
  id: string; revision: number; primaryModelProfileId: string; reviewModelProfileId: string;
  maxContextTokens: number; maxOutputTokens: number; maxRepairLoops: number;
  maxToolCalls: number; hardTokenBudget: number; stopOnBudgetExceeded: boolean;
}
export interface CalibrationState {
  status: "HEURISTIC" | "CALIBRATED"; sampleCount: number;
  minimumSampleCount: number; backtestPassed: boolean;
}
```

- [ ] **Step 1: Write failing tests for statuses, verdicts, Scope validation, and stale transitions**

Cover every legal transition, reject `ACCEPTED` for `BLOCKED` or `INSUFFICIENT_EVIDENCE`, reject a stale assessment in implementation preflight, and reject any Scope mismatch. Include bilingual field validation for `RequirementBrief` and `RequirementAssessment`.

- [ ] **Step 2: Implement the pure state and freshness functions**

Implement exact signatures:

```ts
export function transitionAssessment(input: { lifecycle: AssessmentLifecycle; verdict: FeasibilityVerdict }, next: AssessmentLifecycle): void;
export function invalidationReason(input: { snapshotDigest: string; currentDigest: string; reconciliationStatus: string; briefSuperseded: boolean }): string | null;
export function assertAssessmentUsableForImplementation(input: { lifecycle: AssessmentLifecycle; verdict: FeasibilityVerdict; staleReason?: string | null }): void;
```

Throw stable machine-readable error codes for illegal transitions, stale reports, blocked verdicts, and Scope mismatch.

- [ ] **Step 3: Write failing tests for evidence policy and confidence caps**

Cover API, data-model, event, rule, and generic requirement kinds. Verify missing mandatory evidence lowers coverage and caps confidence, while extra AI text cannot raise the deterministic cap.

- [ ] **Step 4: Implement coverage and estimation**

Implement:

```ts
export function evaluateEvidenceCoverage(input: { requirementKind: string; evidenceKinds: string[]; policyRevision: string }): { coverage: number; confidenceCap: number; missingKinds: string[]; policyRevision: string };
export function estimateAiWork(input: { tasks: Array<{ kind: string; complexity: number; risk: number; uncertainty: number }>; executionProfile: AgentExecutionProfile; modelProfiles: ModelProfile[]; calibration: CalibrationState }): AssessmentEstimate & { aiWorkUnits: number; primaryTokenRange: AssessmentEstimate["planningRange"]; reviewTokenRange: AssessmentEstimate["planningRange"] };
```

Use deterministic weights, record the ruleset revision, and emit heuristic ranges until the calibration gate passes. Do not expose P50/P90 labels for heuristic output.

- [ ] **Step 5: Extend the AI Provider usage contract**

Add `requirementAssessment` and `requirementAssessmentReview` capabilities. Extend `usage` with optional `toolCalls`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, and `retryCount`; preserve existing callers. Make `MockAIProvider` deterministic and make `OpenAIProvider` continue to throw its configured-boundary error.

- [ ] **Step 6: Run focused core tests and commit**

```powershell
pnpm --filter @specforge/core test -- --run packages/core/src/requirement-assessment packages/core/src/__tests__/ai-provider.test.ts
pnpm --filter @specforge/core typecheck
git add packages/core/src/requirement-assessment packages/core/src/ai/types.ts packages/core/src/ai/providers.ts packages/core/src/ai/generate.ts packages/core/src/__tests__/ai-provider.test.ts
git commit -m "feat: add requirement assessment core contracts"
```

Expected: focused tests and core typecheck pass.

---

### Task 3: Persist scoped briefs, runs, snapshots, reports, profiles, and actuals

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260826_requirement_assessment_center/migration.sql`
- Create: `apps/requirement-assessment-worker/package.json`
- Create: `apps/requirement-assessment-worker/tsconfig.json`
- Create: `apps/requirement-assessment-worker/src/repository.ts`
- Test: `prisma/requirement-assessment-schema.test.ts`
- Test: `apps/requirement-assessment-worker/src/repository.test.ts`

**Interfaces:**

Add scope-keyed records with the same `applicationServiceId` and `scopePath` filtering used by existing assets. The minimum persisted records are `RequirementBrief`, `RequirementAssessmentRun`, `AssessmentEvidenceSnapshot`, `RequirementAssessment`, `RequirementAssessmentTask`, `ModelProfile`, `AgentExecutionProfile`, and `AssessmentExecutionActual`.

Use these required unique/index rules:

```prisma
@@unique([applicationServiceId, scopePath, id])
@@unique([applicationServiceId, scopePath, requirementId, revision])
@@index([applicationServiceId, scopePath, status, createdAt])
@@index([applicationServiceId, scopePath, leaseExpiresAt])
@@index([applicationServiceId, scopePath, contentDigest])
```

Keep large evidence manifests, report payloads, task details, profile rules, and usage details in `Json @db.JsonB`, but index all lifecycle, Scope, digest, idempotency, and waterline fields needed for polling and invalidation.

The repository contract consumed by the worker is:

```ts
export interface RequirementAssessmentRunRecord extends AssessmentRunRef {
  requirementId: string; status: AssessmentRunStatus; stage: string;
  evidenceSnapshotId?: string | null; assessmentId?: string | null;
  leaseOwner?: string | null; leaseExpiresAt?: Date | null; heartbeatAt?: Date | null;
  retryCount: number; stopReason?: string | null;
}

export type AssessmentRunPatch = Partial<Omit<RequirementAssessmentRunRecord, "id" | "applicationServiceId" | "scopePath" | "enterpriseId">>;

export interface AssessmentRepository {
  findRun(ref: AssessmentRunRef): Promise<RequirementAssessmentRunRecord>;
  claimRun(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null>;
  updateRunning(ref: AssessmentRunRef, leaseOwner: string, patch: AssessmentRunPatch): Promise<RequirementAssessmentRunRecord | null>;
  heartbeat(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null>;
  saveSnapshot(snapshot: AssessmentEvidenceSnapshot): Promise<void>;
  saveRevision(assessment: RequirementAssessment): Promise<void>;
  requestCancellation(ref: AssessmentRunRef): Promise<void>;
}
```

- [ ] **Step 1: Write schema tests for exact-Scope identity and indexes**

Verify two application services can use the same logical requirement ID without collision, and that a query containing only the application-service ID cannot return a row whose `scopePath` is different.

- [ ] **Step 2: Add Prisma models and migration**

Use UUID database IDs, stable logical IDs, explicit revision numbers, immutable snapshot digests, `createdAt`/`updatedAt`, and no cross-Scope foreign key that could bypass the application authorization boundary. Run the migration against the test database and generate Prisma client.

- [ ] **Step 3: Implement the scoped repository**

Implement exact methods:

```ts
createBrief(input: CreateRequirementBriefInput): Promise<RequirementBriefRecord>;
createRun(input: CreateAssessmentRunInput): Promise<RequirementAssessmentRunRecord>;
claimRun(ref: AssessmentRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<RequirementAssessmentRunRecord | null>;
updateRunning(ref: AssessmentRunRef, leaseOwner: string, patch: AssessmentRunPatch): Promise<RequirementAssessmentRunRecord | null>;
saveSnapshot(input: AssessmentEvidenceSnapshotInput): Promise<AssessmentEvidenceSnapshotRecord>;
saveAssessmentRevision(input: SaveAssessmentRevisionInput): Promise<RequirementAssessmentRecord>;
markStale(ref: AssessmentRef, reason: string): Promise<RequirementAssessmentRecord | null>;
```

Every method constructs a `scopeWhere` containing both exact Scope fields and rejects empty or mismatched values before Prisma is called.

- [ ] **Step 4: Run schema, repository, and Prisma checks and commit**

```powershell
pnpm db:generate
pnpm exec prisma validate
pnpm exec vitest run prisma/requirement-assessment-schema.test.ts apps/requirement-assessment-worker/src/repository.test.ts
git add prisma/schema.prisma prisma/migrations/20260826_requirement_assessment_center apps/requirement-assessment-worker/package.json apps/requirement-assessment-worker/tsconfig.json apps/requirement-assessment-worker/src/repository.ts prisma/requirement-assessment-schema.test.ts
git commit -m "feat: persist scoped requirement assessments"
```

Expected: Prisma validation, migration, and focused persistence tests pass.

---

### Task 4: Build the evidence snapshot and assessment engine

**Files:**
- Create: `packages/core/src/requirement-assessment/evidence.ts`
- Create: `packages/core/src/requirement-assessment/evidence.test.ts`
- Create: `packages/core/src/requirement-assessment/engine.ts`
- Create: `packages/core/src/requirement-assessment/engine.test.ts`
- Modify: `packages/core/src/requirement-assessment/index.ts`

**Interfaces:**

```ts
export interface AssessmentEvidenceReader {
  readCatalog(scope: AssessmentScopeRef): Promise<ScopedCatalogWaterline>;
  readRelationships(scope: AssessmentScopeRef, roots: AssetIdentity[]): Promise<RelationshipEvidence>;
  readGovernance(scope: AssessmentScopeRef): Promise<GovernanceEvidence>;
  readProjection(scope: AssessmentScopeRef): Promise<ProjectionEvidence>;
}

export async function buildEvidenceSnapshot(input: {
  scope: AssessmentScopeRef;
  brief: RequirementBrief;
  reader: AssessmentEvidenceReader;
  policyRevision: string;
  promptTemplateDigest: string;
  modelProfileRevision: string;
  executionProfileRevision: string;
}): Promise<AssessmentEvidenceSnapshot>;

export async function evaluateRequirement(input: {
  brief: RequirementBrief;
  snapshot: AssessmentEvidenceSnapshot;
  provider: AIProvider;
  rulesetRevision: string;
}): Promise<AssessmentEvaluation>;
```

- [ ] **Step 1: Write failing tests for snapshot ordering and digest stability**

Use the same assets in different input order and expect the same ordered manifest and digest. Change one asset revision, relationship waterline, policy revision, or prompt digest and expect a different snapshot digest.

- [ ] **Step 2: Implement bounded exact-Scope evidence resolution**

Reuse existing scoped catalog, relationship ontology, governance, and graph-store contracts. A graph projection fallback may use PostgreSQL relationship reads; preserve confidence when the authoritative read satisfies the evidence policy, and lower coverage only for truncation, missing projection-only semantics, or an unmet checkpoint.

- [ ] **Step 3: Write failing engine tests**

Cover `FEASIBLE`, `CONDITIONAL`, `BLOCKED`, and `INSUFFICIENT_EVIDENCE`; missing mandatory evidence; unauthorized Scope; stale reconciliation; deterministic impact roots; heuristic estimates; and MockAIProvider failure.

- [ ] **Step 4: Implement the hybrid evaluation engine**

Run deterministic authorization, Scope, ADR, rule, state, compatibility, quality, coverage, and reconciliation checks first. Call the provider only with labeled, bounded evidence data. Store assumptions, unknowns, evidence references, option alternatives, impact roots, tasks, and estimates as structured output. Never let model text overwrite a deterministic block.

- [ ] **Step 5: Run focused core tests and commit**

```powershell
pnpm --filter @specforge/core test -- --run packages/core/src/requirement-assessment
pnpm --filter @specforge/core typecheck
git add packages/core/src/requirement-assessment
git commit -m "feat: evaluate requirements from scoped evidence"
```

Expected: all snapshot and engine tests pass.

---

### Task 5: Implement the durable assessment worker

**Files:**
- Create: `apps/requirement-assessment-worker/src/worker.ts`
- Create: `apps/requirement-assessment-worker/src/main.ts`
- Create: `apps/requirement-assessment-worker/src/index.ts`
- Create: `apps/requirement-assessment-worker/src/worker.test.ts`
- Modify: `apps/requirement-assessment-worker/package.json`
- Verify: `pnpm-workspace.yaml` already includes `apps/*`; no workspace edit is required

**Interfaces:**

```ts
export interface AssessmentWorkerDependencies {
  repository: AssessmentRepository;
  evidenceReader: AssessmentEvidenceReader;
  providers: AIProviderRegistry;
  clock?: () => Date;
  workerId?: string;
}

export class RequirementAssessmentWorker {
  claim(ref: AssessmentRunRef): Promise<RequirementAssessmentRunRecord | null>;
  run(ref: AssessmentRunRef): Promise<AssessmentWorkerResult>;
  resume(ref: AssessmentRunRef): Promise<AssessmentWorkerResult>;
  retry(ref: AssessmentRunRef): Promise<AssessmentWorkerResult>;
  cancel(ref: AssessmentRunRef): Promise<AssessmentWorkerResult>;
}
```

- [ ] **Step 1: Write failing worker tests**

Cover lease claim fencing, heartbeat loss, cancellation winning over finalization, retry from the last stage, projection wait, AI failure, review failure, duplicate idempotency key, and no duplicate terminal assessment revision.

- [ ] **Step 2: Implement the staged worker**

Follow `apps/impact-worker/src/worker.ts` for lease and heartbeat semantics. Persist a stage checkpoint after each of: evidence snapshot, deterministic analysis, AI option generation, estimation, independent review, and final report publication. Use the same exact Scope in every repository and evidence-reader call.

- [ ] **Step 3: Add the worker runtime factory and polling main**

Read `DATABASE_URL`, exact Scope defaults, lease durations, provider selector, and bounded polling configuration from environment. `src/main.ts` polls queued runs, exposes `/healthz`, handles graceful shutdown, and never logs prompts, credentials, or full evidence payloads. Development may use PostgreSQL graph reads; no implicit graph-store selection is allowed in production.

- [ ] **Step 4: Run worker tests and commit**

```powershell
pnpm --filter @specforge/requirement-assessment-worker test
pnpm --filter @specforge/requirement-assessment-worker typecheck
git add apps/requirement-assessment-worker
git commit -m "feat: add durable requirement assessment worker"
```

Expected: worker tests pass with no direct formal-asset writes.

---

### Task 6: Expose exact-Scope MCP operations and Web API routes

**Files:**
- Create: `apps/mcp-server/src/assessment/tools.ts`
- Create: `apps/mcp-server/src/assessment/tools.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/server.ts` only where tool registration is required
- Create: `apps/web/lib/requirement-assessment.ts`
- Create: `apps/web/lib/__tests__/requirement-assessment.test.ts`
- Create: `apps/web/app/api/requirement-assessments/route.ts`
- Create: `apps/web/app/api/requirement-assessments/[id]/route.ts`
- Create: `apps/web/app/api/requirement-assessments/[id]/cancel/route.ts`
- Create: `apps/web/app/api/requirement-assessments/[id]/accept/route.ts`
- Create: `apps/web/app/api/requirement-assessments/[id]/drafts/route.ts`
- Create: route tests beside each API route

**Interfaces:**

MCP tools:

```text
create_requirement_brief
get_requirement_assessment
list_requirement_assessments
cancel_requirement_assessment
accept_requirement_assessment
create_assessment_proposal_draft
create_assessment_context_pack_draft
record_assessment_execution_actual
```

Every tool requires `applicationServiceId`, `scopePath`, principal authorization, and an idempotency key for writes. `accept_requirement_assessment` only accepts `REVIEWED` plus a non-stale report. Draft creation calls the existing MCP Proposal/Context Pack persistence boundary and creates typed links; it never writes those tables directly from the Web route.

- [ ] **Step 1: Write failing MCP authorization and idempotency tests**

Verify missing Scope, mismatched Scope, unauthorized principal, stale report, non-reviewed report, duplicate idempotency key, and cross-Scope target all fail closed. Verify bilingual payload validation and redacted unresolved dependencies.

- [ ] **Step 2: Implement MCP assessment tools and registration**

Reuse `resolveWritableScope`, existing audit helpers, localization validators, and typed-link persistence. Return explicit `READY`, `PARTIAL`, `BLOCKED`, `UNAUTHORIZED`, `STALE`, and `UNAVAILABLE` states.

- [ ] **Step 3: Write route contract tests**

Verify POST creates one scoped run, GET preserves Scope, cancel/accept return the correct lifecycle, draft creation delegates to MCP, and all errors use stable status and error codes.

- [ ] **Step 4: Implement Web API adapters**

Use `resolveRequestPrincipal`, `getApiRequestLocale`, and the shared Scope route helpers. API routes remain thin: validate input, call the scoped service/MCP client, and serialize the report or run state.

- [ ] **Step 5: Run MCP/Web tests and commit**

```powershell
pnpm --filter @specforge/mcp-server exec vitest run src/assessment/tools.test.ts src/auth.test.ts
pnpm --filter @specforge/web exec vitest run lib/__tests__/requirement-assessment.test.ts app/api/requirement-assessments
pnpm --filter @specforge/mcp-server typecheck
pnpm --filter @specforge/web typecheck
git add apps/mcp-server/src/assessment apps/mcp-server/src/tools.ts apps/mcp-server/src/server.ts apps/web/lib/requirement-assessment.ts apps/web/lib/__tests__/requirement-assessment.test.ts apps/web/app/api/requirement-assessments
git commit -m "feat: expose scoped requirement assessment APIs"
```

Expected: MCP and Web route suites pass with exact Scope isolation.

---

### Task 7: Build the Web intake, report, and role views

**Files:**
- Create: `apps/web/app/requirement-assessment/page.tsx`
- Create: `apps/web/app/requirement-assessment/[id]/page.tsx`
- Create: `apps/web/components/requirement-assessment/intake-form.tsx`
- Create: `apps/web/components/requirement-assessment/assessment-report.tsx`
- Create: `apps/web/components/requirement-assessment/role-view.tsx`
- Create: `apps/web/components/requirement-assessment/evidence-matrix.tsx`
- Create: `apps/web/components/requirement-assessment/impact-panel.tsx`
- Create: `apps/web/components/requirement-assessment/estimate-panel.tsx`
- Create: `apps/web/components/requirement-assessment/review-panel.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Test: `apps/web/components/requirement-assessment/*.test.tsx`

**Interfaces:**

```ts
type AssessmentRole = "product" | "architecture" | "agent";

export function AssessmentReport(props: {
  assessment: RequirementAssessment;
  role: AssessmentRole;
  locale: AssetLocale;
  scope: ArchitectureScopeRef;
}): JSX.Element;
```

- [ ] **Step 1: Write component tests for the three role views**

Verify one assessment revision and verdict are used by all views, heuristic ranges never render as P50/P90, stale and blocked states are visually explicit, evidence links preserve Scope, and Agent view shows constraints and verification commands.

- [ ] **Step 2: Implement the intake form**

Collect English canonical intent, Chinese human overlay, exact Scope, acceptance criteria, quality targets, constraints, exclusions, and source references. Model assumptions must render separately from confirmed facts. Submit through the scoped API and show the durable run ID and stage status.

- [ ] **Step 3: Implement the report shell and loading/error states**

Show feasibility verdict, coverage, blockers, impact, options, task breakdown, planning/risk ranges, calibration status, Token budget, reviewer state, evidence matrix, and stale/failure diagnostics. Use the existing global loading boundary and persistent navigation progress behavior.

- [ ] **Step 4: Add navigation and bilingual copy**

Add one scoped navigation entry and complete English/Chinese keys for intake, status, evidence, estimates, review, acceptance, cancellation, and error codes. Do not add a marketing landing page or an unscoped asset view.

- [ ] **Step 5: Run Web tests and commit**

```powershell
pnpm --filter @specforge/web exec vitest run components/requirement-assessment
pnpm --filter @specforge/web typecheck
git add apps/web/app/requirement-assessment apps/web/components/requirement-assessment apps/web/components/app-shell.tsx apps/web/lib/i18n.ts
git commit -m "feat: add requirement assessment console"
```

Expected: role-view, localization, loading, Scope-link, and stale-state tests pass.

---

### Task 8: Add actuals, invalidation, profile governance, and design handoff

**Files:**
- Modify: `apps/requirement-assessment-worker/src/repository.ts`
- Modify: `apps/mcp-server/src/assessment/tools.ts`
- Modify: `packages/core/src/requirement-assessment/freshness.ts`
- Create: `apps/requirement-assessment-worker/src/invalidation.ts`
- Test: `apps/requirement-assessment-worker/src/invalidation.test.ts`
- Modify: `docs/adr/0041-evidence-driven-requirement-assessment.md`
- Modify: `docs/design-facts/baseline-manifest.json`

**Interfaces:**

```ts
export function assessFreshness(input: {
  stored: AssessmentEvidenceSnapshotRef;
  current: AssessmentEvidenceSnapshotRef;
  reconciliationStatus: string;
  briefSuperseded: boolean;
}): { stale: boolean; reason?: string };

export function recordExecutionActual(input: {
  assessmentId: string;
  scope: AssessmentScopeRef;
  actual: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; toolCalls?: number; retryCount?: number; elapsedMs?: number; humanPersonDays?: number };
}): Promise<void>;
```

- [ ] **Step 1: Write invalidation tests**

Verify asset/relationship/policy digest changes, blocked reconciliation, brief supersession, and expired waterline each mark an accepted report `STALE`; unchanged evidence remains usable. Verify a stale report cannot be accepted or create a draft.

- [ ] **Step 2: Implement freshness checks and actual recording**

Record provider-observable usage only; unavailable provider metrics remain null. Keep Model Profile, Agent Execution Profile, and execution actuals immutable after recording. Do not calculate calibrated P50/P90 until the configured sample and backtest thresholds are implemented in a later phase.

- [ ] **Step 3: Add governed profile handling**

Persist a bilingual reference Model Profile and Agent Execution Profile through the approved MCP/bootstrap manifest. Profile changes require a new revision and never rewrite historical assessments.

- [ ] **Step 4: Update design evidence and run the reconciliation checks**

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS="adr-requirement-assessment-center"
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: the new status, profile, snapshot, actual, and typed-link facts read back in the exact Scope with no blocked or out-of-Scope records.

- [ ] **Step 5: Run focused invalidation tests and commit**

```powershell
pnpm exec vitest run packages/core/src/requirement-assessment apps/requirement-assessment-worker/src/invalidation.test.ts
git add apps/requirement-assessment-worker/src apps/mcp-server/src/assessment packages/core/src/requirement-assessment docs/adr/0041-evidence-driven-requirement-assessment.md docs/design-facts/baseline-manifest.json
git commit -m "feat: govern assessment freshness and execution actuals"
```

Expected: freshness, actual-recording, localization, and design-fact checks pass.

---

### Task 9: Add the worker to Docker, verify the complete workflow, and close the session

**Files:**
- Create: `deploy/requirement-assessment-worker.Dockerfile`
- Modify: `deploy/compose.yaml`
- Modify: `deploy/.env.example`
- Modify: `deploy/README.md`
- Modify: `deploy/scripts/start.ps1` to include the new worker health check and wait condition
- Test: `deploy/requirement-assessment-compose.test.ps1` or the existing deployment verification suite
- Modify: `docs/adr/0041-evidence-driven-requirement-assessment.md`

**Interfaces:**

The Compose service uses the existing PostgreSQL network and environment conventions, exposes no public port, depends on healthy `postgres`, `bootstrap`, and `three-a-bootstrap` where required, and reports `/healthz` for worker liveness. Web continues to use port `3010`.

- [ ] **Step 1: Add the worker image and Compose service**

Build the workspace package with the same Node/Prisma runtime family as the existing workers. Configure exact Scope, worker lease, poll interval, provider selector, and bounded retry environment variables. Keep `MockAIProvider` as the default Phase 1 provider.

- [ ] **Step 2: Add deployment checks**

Run:

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml config
docker compose --env-file deploy/.env -f deploy/compose.yaml build web requirement-assessment-worker
```

Expected: Compose config is valid and both images build without changing the PostgreSQL authority or graph topology.

- [ ] **Step 3: Run the complete focused verification**

```powershell
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/requirement-assessment-worker typecheck
pnpm exec vitest run packages/core/src/requirement-assessment apps/requirement-assessment-worker/src apps/mcp-server/src/assessment apps/web/components/requirement-assessment
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
Invoke-WebRequest http://127.0.0.1:3010/healthz
```

Expected: all typechecks and focused tests pass, the Web health endpoint returns HTTP 200, the worker is healthy, and no new Web/MCP/worker errors appear.

- [ ] **Step 4: Perform one exact-Scope browser/API acceptance flow**

Create a requirement brief, observe `QUEUED` through `COMPLETE`, inspect product/architecture/Agent views, verify heuristic range labels, inspect evidence IDs and relationships, force or simulate a stale snapshot, verify acceptance is rejected, and create Proposal/Context Pack drafts only through MCP. Repeat the read with a second application service grant and verify no Designer facts are returned without explicit authorization.

- [ ] **Step 5: Close the same implementation session with exact evidence**

```powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session $env:SPECFORGE_IMPLEMENTATION_SESSION_ID --status CONVERGED --evidence "core-typecheck=PASS,mcp-typecheck=PASS,web-typecheck=PASS,worker-typecheck=PASS,focused-tests=PASS,prisma-validate=PASS,docker-compose-config=PASS,docker-3010-health=200,assessment-workflow=COMPLETE,scope-isolation=PASS,stale-rejection=PASS,mcp-drafts=PASS,design-facts-sync=PASS,design-facts-check=PASS,git-diff-check=PASS"
```

Expected: the same session closes as `CONVERGED` only after MCP read-back and all evidence checks pass. If any MCP, database, worker, or browser check fails, close `BLOCKED` with the exact failure and retry trigger instead of claiming completion.

- [ ] **Step 6: Commit deployment and evidence updates**

```powershell
git add deploy docs/adr/0041-evidence-driven-requirement-assessment.md docs/design-facts/baseline-manifest.json
git commit -m "feat: deploy requirement assessment workflow"
```

Expected: the final implementation commit contains only this feature's deployment and evidence changes.

---

## Deferred Phase 2 And Phase 3 Work

The following remain separate governed increments and are not silently included in Phase 1:

- Phase 2: repository/code ownership mappings, OpenAPI and Schema observations, test coverage, deployment topology, and selected runtime evidence.
- Phase 3: ExecutionActual calibration, representative sample thresholds, backtesting, drift monitoring, and calibrated `P50/P90` quality reports.
- Explicitly authorized multi-Scope portfolio assessment composition.
- External requirement-platform connectors.
- Real model-provider execution and enterprise provider approval integration.

Each increment requires its own ADR/Proposal/Context Pack, exact-Scope preflight, focused evidence, MCP synchronization/read-back, and session closure.

## Plan Self-Review

- **Spec coverage:** Goal, hybrid architecture, roles, exact Scope, evidence snapshot, run state machine, deterministic coverage, heuristic estimates, profiles, independent review, failure behavior, security, stale invalidation, actuals, MCP handoff, Docker deployment, and Phase 2/3 boundaries all map to Tasks 1-9.
- **No placeholders:** The plan contains concrete file paths, stable IDs, commands, expected results, interfaces, statuses, and commit boundaries. It does not rely on an unspecified provider, graph database, or cross-Scope default.
- **Type consistency:** `AssessmentScopeRef`, `AssessmentEvidenceSnapshotRef`, `AssessmentEstimate`, `AssessmentRunRef`, `AssessmentRepository`, `AssessmentEvidenceReader`, and the two Worker methods are defined before later tasks consume them.
- **Operational consistency:** The plan uses PostgreSQL for authority, the existing graph/impact contracts for bounded reads, the existing Worker lease pattern, MCP for formal asset writes, and the exact 3010 deployment topology.
- **Evidence consistency:** The implementation session is opened after design-fact synchronization and closed only with exact command/result evidence and MCP read-back.
