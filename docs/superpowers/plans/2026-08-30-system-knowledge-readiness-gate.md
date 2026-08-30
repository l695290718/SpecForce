# System Knowledge Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed, exact-Scope MCP read boundary that proves whether SpecForge is sufficient for a selected system-knowledge Profile and returns current facts only with an immutable, waterline-bound readiness receipt.

**Architecture:** Add a pure readiness-policy/evaluation module to `@specforge/core`, then persist exact-Scope policy overlays and immutable decisions in PostgreSQL. The MCP server composes the built-in enterprise minimum with the Scope overlay, loads one authoritative evidence snapshot, evaluates and reuses a receipt, and performs the first bounded asset/relationship read in the same PostgreSQL `REPEATABLE READ` transaction. Existing low-level reads remain payload-compatible during an observable migration window, while ordinary Agent guidance moves to the gated operation and diagnostic bypass requires an explicit permission.

**Tech Stack:** TypeScript 5.7, Zod 3.24, Prisma 6.1, PostgreSQL, MCP SDK 1.29, Vitest 2.1, `@specforge/scoped-read`, pnpm 9.15.

## Global Constraints

- Owning application service is exactly `com.huawei.celon.desiner` and owning Scope is exactly `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Continue the open Design Change Session `design-change-session:214866ac-190d-4182-a7ac-6b0d869b40f9`; do not open a replacement session.
- PostgreSQL is authoritative for policies, receipts, observations, Baselines, waterlines, reconciliation, and audit; graph stores remain rebuildable projections.
- A caller cannot remove a server-required dimension or source, and a Scope overlay can only tighten the built-in enterprise minimum.
- Authorization runs before diagnostic evidence is loaded; denial exposes only `KNOWLEDGE_SCOPE_ACCESS_DENIED` and no target existence or asset body.
- `SELF_CONTAINED` is bound to caller grant, exact Scope, Profile, selectors, policy version, source waterlines, `asOf`, and `validUntil`.
- `FULL_SNAPSHOT` or a policy-approved equivalent is required to prove completeness or absence; DELTA-only evidence cannot do so.
- Waterline changes invalidate receipts immediately, while TTL expiry invalidates them even when internal waterlines are unchanged.
- Evaluation and the first bounded read execute in one PostgreSQL `REPEATABLE READ` transaction.
- Trust completeness and response pagination completeness remain independent.
- English fields are canonical; Chinese localization is complete for human-facing ADR, Proposal, Context Pack, rule, API, and data-model content.
- `RUNTIME_DIAGNOSIS` returns `SOURCE_CHECK_REQUIRED` until policy-approved runtime sources genuinely exist; no fake runtime evidence is seeded.
- The first increment does not add scanners, connectors, scheduling, external `APPLY`, cross-Scope aggregation, a Web administration page, external identity integration, or production-scale certification.
- Preserve the untracked `.tmp/` directory and do not stage it.

---

### Task 1: Pure Readiness Contract, Enterprise Minimum, and Evaluator

**Files:**
- Create: `packages/core/src/knowledge-readiness/types.ts`
- Create: `packages/core/src/knowledge-readiness/policy.ts`
- Create: `packages/core/src/knowledge-readiness/evaluate.ts`
- Create: `packages/core/src/knowledge-readiness/index.ts`
- Create: `packages/core/src/knowledge-readiness/evaluate.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ArchitectureScopeRef` from `packages/core/src/types.ts`.
- Produces: `composeKnowledgeReadinessPolicy(overlay)`, `evaluateKnowledgeReadiness(input)`, `enterpriseMinimumPolicy`, and the types `KnowledgeProfileId`, `KnowledgeReadinessPolicy`, `KnowledgeEvidenceSnapshot`, `KnowledgeReadinessDecision`, `KnowledgeReasonCode`, and `KnowledgeRemediationAction`.

- [x] **Step 1: Write failing policy-composition and evaluator tests**

Create table-driven tests that prove strictness ordering, profile requirements, full-snapshot completeness, pending work, reconciliation blocking, receipt expiry inputs, and time-skew handling:

```ts
import { describe, expect, it } from "vitest";
import {
  composeKnowledgeReadinessPolicy,
  enterpriseMinimumPolicy,
  evaluateKnowledgeReadiness,
  type KnowledgeEvidenceSnapshot
} from "./index.js";

const now = new Date("2026-08-30T10:00:00.000Z");
const healthy: KnowledgeEvidenceSnapshot = {
  baseline: { id: "baseline-1", digest: "b".repeat(64), publishedAt: now },
  catalogWaterline: "42",
  relationshipWaterline: "17",
  reconciliation: { id: "rec-1", status: "CONVERGED", digest: "r".repeat(64), createdAt: now },
  sources: [
    { role: "DESIGN_CATALOG", authority: "SPECFORGE", fullSnapshotCompleted: true, snapshotId: "design-1", waterline: "42", observedAt: now, receivedAt: now, pendingCount: 0, openTombstoneCount: 0 },
    { role: "SOURCE_CODE", authority: "EXTERNAL", fullSnapshotCompleted: true, snapshotId: "code-1", waterline: "9", observedAt: now, receivedAt: now, pendingCount: 0, openTombstoneCount: 0 }
  ],
  unresolvedConflictCount: 0,
  pendingCandidateCount: 0
};

describe("system knowledge readiness", () => {
  it("rejects a Scope overlay that weakens the enterprise minimum", () => {
    expect(() => composeKnowledgeReadinessPolicy({
      id: "scope-policy",
      version: 1,
      profileId: "ARCHITECTURE_OVERVIEW",
      maximumFreshnessSeconds: { SOURCE_CODE: 8 * 24 * 60 * 60 }
    })).toThrow("KNOWLEDGE_POLICY_VIOLATION");
  });

  it("allows a current complete architecture overview", () => {
    const policy = composeKnowledgeReadinessPolicy();
    expect(evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy, snapshot: healthy, now }).trustStatus).toBe("SELF_CONTAINED");
  });

  it.each([
    ["delta only", { ...healthy, sources: healthy.sources.map((source) => source.role === "SOURCE_CODE" ? { ...source, fullSnapshotCompleted: false } : source) }, "KNOWLEDGE_FULL_SNAPSHOT_REQUIRED"],
    ["pending promotion", { ...healthy, pendingCandidateCount: 1 }, "KNOWLEDGE_PENDING_PROMOTION"],
    ["unresolved conflict", { ...healthy, unresolvedConflictCount: 1 }, "KNOWLEDGE_CONFLICT_UNRESOLVED"]
  ])("fails closed for %s", (_label, snapshot, reason) => {
    const decision = evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy: enterpriseMinimumPolicy, snapshot, now });
    expect(decision.trustStatus).not.toBe("SELF_CONTAINED");
    expect(decision.reasonCodes).toContain(reason);
  });

  it("does not let future or late timestamps refresh a source", () => {
    const source = healthy.sources[1];
    const snapshot = { ...healthy, sources: [{ ...source, role: "DESIGN_CATALOG" as const }, { ...source, observedAt: new Date("2026-08-30T10:10:00.000Z"), receivedAt: new Date("2026-08-30T08:00:00.000Z") }] };
    expect(evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy: enterpriseMinimumPolicy, snapshot, now }).reasonCodes).toContain("KNOWLEDGE_STALE");
  });

  it("requires real runtime evidence", () => {
    const decision = evaluateKnowledgeReadiness({ profileId: "RUNTIME_DIAGNOSIS", policy: enterpriseMinimumPolicy, snapshot: healthy, now });
    expect(decision.trustStatus).toBe("SOURCE_CHECK_REQUIRED");
    expect(decision.reasonCodes).toContain("KNOWLEDGE_SOURCE_NOT_CONFIGURED");
  });
});
```

- [x] **Step 2: Run the focused test and confirm the contract is absent**

Run: `pnpm exec vitest run packages/core/src/knowledge-readiness/evaluate.test.ts`

Expected: FAIL because `packages/core/src/knowledge-readiness/index.ts` does not exist.

- [x] **Step 3: Add the complete public type contract**

Define the closed unions and immutable inputs in `types.ts`:

```ts
export type KnowledgeDimension = "DESIGN_INTENT" | "IMPLEMENTATION" | "RUNTIME";
export type KnowledgeProfileId = "ARCHITECTURE_OVERVIEW" | "CHANGE_ASSESSMENT" | "RUNTIME_DIAGNOSIS";
export type KnowledgeTrustStatus = "SELF_CONTAINED" | "SOURCE_CHECK_REQUIRED" | "BLOCKED";
export type KnowledgeSourceRole = "DESIGN_CATALOG" | "SOURCE_CODE" | "API_SCHEMA" | "DATA_SCHEMA" | "TEST_EVIDENCE" | "DEPLOYMENT" | "RUNTIME_TELEMETRY";
export type KnowledgeReasonCode =
  | "KNOWLEDGE_SOURCE_NOT_CONFIGURED"
  | "KNOWLEDGE_COVERAGE_INCOMPLETE"
  | "KNOWLEDGE_STALE"
  | "KNOWLEDGE_FULL_SNAPSHOT_REQUIRED"
  | "KNOWLEDGE_PENDING_PROMOTION"
  | "KNOWLEDGE_RECONCILIATION_BLOCKED"
  | "KNOWLEDGE_CONFLICT_UNRESOLVED"
  | "KNOWLEDGE_RECEIPT_STALE"
  | "KNOWLEDGE_POLICY_VIOLATION"
  | "KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED"
  | "KNOWLEDGE_SCOPE_ACCESS_DENIED";
export type KnowledgeRemediationAction = "START_FULL_SCAN" | "RESUME_CONNECTOR" | "REVIEW_CANDIDATES" | "RESOLVE_CONFLICT" | "RUN_RECONCILIATION";

export interface KnowledgeSourceRequirement {
  role: KnowledgeSourceRole;
  dimension: KnowledgeDimension;
  maximumFreshnessSeconds: number;
  maximumClockSkewSeconds: number;
  requireFullSnapshot: boolean;
}

export interface KnowledgeReadinessPolicy {
  id: string;
  version: number;
  profileRequirements: Record<KnowledgeProfileId, readonly KnowledgeSourceRequirement[]>;
  blockOnUnresolvedConflict: boolean;
  blockOnNonConvergedReconciliation: boolean;
  responseBudget: { assets: number; relationships: number; bytes: number; executionMilliseconds: number };
  receiptTtlSeconds: number;
  retentionDays: number;
}

export interface KnowledgeReadinessPolicyOverlay {
  id: string;
  version: number;
  profileId: KnowledgeProfileId;
  additionalSources?: readonly KnowledgeSourceRequirement[];
  maximumFreshnessSeconds?: Partial<Record<KnowledgeSourceRole, number>>;
  maximumClockSkewSeconds?: Partial<Record<KnowledgeSourceRole, number>>;
  responseBudget?: Partial<KnowledgeReadinessPolicy["responseBudget"]>;
  receiptTtlSeconds?: number;
  retentionDays?: number;
}

export interface KnowledgeEvidenceSource {
  role: KnowledgeSourceRole;
  authority: "SPECFORGE" | "EXTERNAL";
  fullSnapshotCompleted: boolean;
  snapshotId: string | null;
  waterline: string;
  observedAt: Date;
  receivedAt: Date;
  pendingCount: number;
  openTombstoneCount: number;
}

export interface KnowledgeEvidenceSnapshot {
  baseline: { id: string; digest: string; publishedAt: Date } | null;
  catalogWaterline: string;
  relationshipWaterline: string;
  reconciliation: { id: string; status: string; digest: string; createdAt: Date } | null;
  sources: readonly KnowledgeEvidenceSource[];
  unresolvedConflictCount: number;
  pendingCandidateCount: number;
}

export interface KnowledgeReadinessDecision {
  trustStatus: KnowledgeTrustStatus;
  dimensionStatuses: ReadonlyArray<{ dimension: KnowledgeDimension; status: KnowledgeTrustStatus; reasonCodes: readonly KnowledgeReasonCode[] }>;
  reasonCodes: readonly KnowledgeReasonCode[];
  remediationActions: readonly KnowledgeRemediationAction[];
  validUntil: Date;
}
```

- [x] **Step 4: Implement policy composition and evaluation as pure functions**

In `policy.ts`, register all three Profiles and reject any overlay freshness, TTL, or response budget that is looser/larger than the enterprise value. In `evaluate.ts`, evaluate authorization-independent evidence using this precedence: unresolved conflict or non-converged reconciliation -> `BLOCKED`; missing source, missing full snapshot, open tombstone, pending work, stale/future/late timestamp -> `SOURCE_CHECK_REQUIRED`; otherwise `SELF_CONTAINED`. Compute `validUntil` as the minimum of receipt TTL and every required source freshness deadline. Keep reason codes sorted and unique so receipt digests are deterministic.

Export the module from `knowledge-readiness/index.ts` and add `export * from "./knowledge-readiness/index.js";` to `packages/core/src/index.ts`.

- [x] **Step 5: Run focused tests and core typecheck**

Run: `pnpm exec vitest run packages/core/src/knowledge-readiness/evaluate.test.ts`

Expected: PASS with all readiness cases green.

Run: `pnpm --filter @specforge/core typecheck`

Expected: exit code 0 with no TypeScript diagnostics.

- [x] **Step 6: Commit the pure domain increment**

```bash
git add packages/core/src/knowledge-readiness packages/core/src/index.ts
git commit -m "feat: add system knowledge readiness evaluator"
```

### Task 2: Additive PostgreSQL Policy and Immutable Receipt Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260830_system_knowledge_readiness_gate/migration.sql`
- Create: `apps/mcp-server/src/knowledge-readiness/repository.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/repository.test.ts`

**Interfaces:**
- Consumes: `KnowledgeReadinessPolicyOverlay`, `KnowledgeReadinessDecision`, and exact `ArchitectureScopeRef`.
- Produces: `getActivePolicyOverlay(tx, scope, profileId)`, `upsertPolicyOverlay(prisma, input)`, `findReusableReceipt(tx, deterministicKey, now)`, and `insertImmutableReceipt(tx, input)`.

- [x] **Step 1: Write failing repository tests against PostgreSQL**

Test that policy versions are exact-Scope, only one active version is selected, identical deterministic keys reuse one receipt, and receipt rows cannot be updated through repository APIs. Gate the suite with `SPECFORGE_CONTINUOUS_INTEGRATION=1`, following the existing PostgreSQL integration-test convention.

```ts
it("reuses one immutable receipt for the same exact-Scope decision", async () => {
  const first = await insertImmutableReceipt(prisma, receiptInput);
  const second = await insertImmutableReceipt(prisma, receiptInput);
  expect(second.id).toBe(first.id);
  expect(await prisma.systemKnowledgeReadinessReceipt.count({ where: scope })).toBe(1);
});

it("never resolves a policy from another Scope", async () => {
  await upsertPolicyOverlay(prisma, { ...policyInput, architectureScope: otherScope });
  expect(await getActivePolicyOverlay(prisma, scope, "ARCHITECTURE_OVERVIEW")).toBeNull();
});
```

- [x] **Step 2: Run the repository test and confirm the Prisma models are absent**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/repository.test.ts`

Expected: FAIL with missing Prisma model properties.

- [x] **Step 3: Add the Prisma models and matching SQL migration**

Append these models to `prisma/schema.prisma`, preserving exact-Scope uniqueness and immutable receipt identity:

```prisma
model KnowledgeReadinessPolicy {
  dbId                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id                    String
  version               Int
  profileId             String
  overlay               Json     @db.JsonB
  status                String
  actorId               String
  applicationServiceId  String
  scopePath             String
  createdAt             DateTime @default(now())

  @@unique([applicationServiceId, scopePath, id, version], map: "KnowledgeReadinessPolicy_scope_id_version_key")
  @@index([applicationServiceId, scopePath, profileId, status, version], map: "KnowledgeReadinessPolicy_scope_profile_status_idx")
}

model SystemKnowledgeReadinessReceipt {
  dbId                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id                    String
  deterministicKey      String
  subjectId             String
  grantDigest           String
  profileId             String
  selectorDigest        String
  purpose               String
  locale                String
  policyId              String
  policyVersion         Int
  trustStatus           String
  dimensionStatuses     Json     @db.JsonB
  baselineBindings      Json     @db.JsonB
  sourceWaterlines      Json     @db.JsonB
  coverageSummary       Json     @db.JsonB
  freshnessSummary      Json     @db.JsonB
  reasonCodes           Json     @db.JsonB
  remediationActions    Json     @db.JsonB
  asOf                  DateTime
  validUntil             DateTime
  receiptDigest         String
  lifecycleStatus       String   @default("ACTIVE")
  applicationServiceId  String
  scopePath             String
  createdAt             DateTime @default(now())

  @@unique([applicationServiceId, scopePath, id], map: "SystemKnowledgeReadinessReceipt_scope_id_key")
  @@unique([applicationServiceId, scopePath, deterministicKey], map: "SystemKnowledgeReadinessReceipt_scope_deterministic_key")
  @@index([applicationServiceId, scopePath, subjectId, profileId, validUntil], map: "SystemKnowledgeReadinessReceipt_scope_subject_profile_expiry_idx")
  @@index([applicationServiceId, scopePath, lifecycleStatus, createdAt], map: "SystemKnowledgeReadinessReceipt_scope_lifecycle_created_idx")
}
```

The SQL migration must create the same columns, constraints, and indexes with quoted Prisma table/column names. Do not add foreign keys to mutable Baseline or connector rows; immutable bindings are stored as IDs and digests inside the receipt.

- [x] **Step 4: Implement repository functions with exact-Scope predicates**

`upsertPolicyOverlay` inserts a new `(scope,id,version)` row and marks older versions for the same Profile `SUPERSEDED` in one transaction. `insertImmutableReceipt` uses `upsert` only on the deterministic key with an empty update object and verifies the returned digest equals the requested digest; a collision with different content throws `KNOWLEDGE_POLICY_VIOLATION`. No update or delete receipt function is exported.

- [x] **Step 5: Generate Prisma Client and apply the additive schema**

Run: `pnpm db:generate`

Expected: `Generated Prisma Client` and exit code 0.

Run: `pnpm db:push`

Expected: database schema synchronized without destructive-change warnings.

- [x] **Step 6: Run repository tests and MCP server typecheck**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/repository.test.ts`

Expected: PASS for Scope isolation and receipt reuse.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit code 0.

- [x] **Step 7: Commit persistence separately**

```bash
git add prisma/schema.prisma prisma/migrations/20260830_system_knowledge_readiness_gate apps/mcp-server/src/knowledge-readiness/repository.ts apps/mcp-server/src/knowledge-readiness/repository.test.ts
git commit -m "feat: persist knowledge readiness policies and receipts"
```

### Task 3: Build One Authoritative Evidence Snapshot

**Files:**
- Create: `apps/mcp-server/src/knowledge-readiness/evidence-snapshot.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/evidence-snapshot.test.ts`

**Interfaces:**
- Consumes: Prisma transaction client, exact `ArchitectureScopeRef`, composed `KnowledgeReadinessPolicy`, and `KnowledgeProfileId`.
- Produces: `loadKnowledgeEvidenceSnapshot(tx, scope, policy, profileId): Promise<KnowledgeEvidenceSnapshot & KnowledgeWaterlineEnvelope>`.

- [x] **Step 1: Write failing evidence-mapping tests**

Cover these persisted states with exact fixtures: no published Baseline; completed FULL_SNAPSHOT with matching cursor; DELTA-only run; unfinished FULL_SNAPSHOT; open tombstone; pending `SourceObservation`; pending `IdentityCandidate`; unresolved conflict; and non-converged `ReconciliationSnapshot`.

```ts
it("does not interpret a DELTA run as complete inventory", async () => {
  await seedConnectorRun({ mode: "DELTA", status: "COMPLETED", snapshotId: null });
  const snapshot = await prisma.$transaction((tx) => loadKnowledgeEvidenceSnapshot(tx, scope, enterpriseMinimumPolicy, "ARCHITECTURE_OVERVIEW"));
  expect(snapshot.sources.find((source) => source.role === "SOURCE_CODE")?.fullSnapshotCompleted).toBe(false);
});

it("includes pending and reconciliation waterlines in the envelope", async () => {
  const snapshot = await prisma.$transaction((tx) => loadKnowledgeEvidenceSnapshot(tx, scope, enterpriseMinimumPolicy, "CHANGE_ASSESSMENT"));
  expect(snapshot.waterlines).toMatchObject({ catalog: expect.any(String), relationships: expect.any(String), reconciliation: expect.any(String), pending: expect.any(String) });
});
```

- [x] **Step 2: Run the focused test and confirm the loader is absent**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/evidence-snapshot.test.ts`

Expected: FAIL because `loadKnowledgeEvidenceSnapshot` is undefined.

- [x] **Step 3: Implement the bounded snapshot loader**

Query only the exact `(applicationServiceId, scopePath)`. Resolve:

```ts
export interface KnowledgeWaterlineEnvelope {
  waterlines: {
    baseline: string;
    catalog: string;
    relationships: string;
    connectors: string;
    snapshots: string;
    pending: string;
    conflicts: string;
    reconciliation: string;
  };
  waterlineDigest: string;
  coverageSummary: Record<string, number | string>;
  freshnessSummary: Record<string, string | number>;
}
```

Use the active published `KnowledgeBaseline`, current catalog and relationship version rows, required connector registrations, `FederationObservationCursor.lastCompletedSnapshotId`, matching completed `ConnectorRun` rows, pending observations/candidates, conflicted observations/mappings, open tombstones, and latest durable `ReconciliationSnapshot`. Sort every array before hashing canonical JSON. Treat absent required runtime registration as absent evidence rather than manufacturing a source row.

- [x] **Step 4: Run evidence tests and verify no unbounded table scans are introduced**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/evidence-snapshot.test.ts`

Expected: PASS.

Run: `rg -n "findMany\(\{\s*$" apps/mcp-server/src/knowledge-readiness/evidence-snapshot.ts`

Expected: every `findMany` block is followed by an exact-Scope `where` predicate and a bounded `take` or aggregate selection where cardinality can grow.

- [x] **Step 5: Commit the evidence loader**

```bash
git add apps/mcp-server/src/knowledge-readiness/evidence-snapshot.ts apps/mcp-server/src/knowledge-readiness/evidence-snapshot.test.ts
git commit -m "feat: compose scoped knowledge readiness evidence"
```

### Task 4: Govern Policy Writes and Sign Immutable Readiness Receipts

**Files:**
- Create: `apps/mcp-server/src/knowledge-readiness/service.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/service.test.ts`

**Interfaces:**
- Consumes: repository functions from Task 2 and evidence loader from Task 3.
- Produces: `upsertScopedReadinessPolicy(input, caller)`, `evaluateScopedKnowledgeReadiness(tx, input, caller)`, `revalidateReceipt(tx, receiptId, input, caller)`, and stable public DTOs.

- [x] **Step 1: Write failing service tests**

Test deterministic selector normalization, grant-digest binding, policy version invalidation, receipt TTL expiry, waterline invalidation, identical receipt reuse, and no diagnostic fields for denied authorization.

```ts
it("reuses a receipt only when caller, query, policy, and waterlines match", async () => {
  const first = await evaluateScopedKnowledgeReadiness(prisma, request, caller);
  const second = await evaluateScopedKnowledgeReadiness(prisma, { ...request, selectors: [...request.selectors].reverse() }, caller);
  expect(second.receiptId).toBe(first.receiptId);
  await advanceCatalogWaterline(scope);
  const third = await evaluateScopedKnowledgeReadiness(prisma, request, caller);
  expect(third.receiptId).not.toBe(first.receiptId);
});

it("returns no evidence diagnostics before exact-Scope authorization", async () => {
  const denied = await evaluateScopedKnowledgeReadiness(prisma, request, unauthorizedCaller);
  expect(denied).toEqual({ accessDecision: "DENY", trustStatus: "BLOCKED", reasonCodes: ["KNOWLEDGE_SCOPE_ACCESS_DENIED"], remediationActions: [] });
});
```

- [x] **Step 2: Run tests and confirm the service is absent**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/service.test.ts`

Expected: FAIL with missing service exports.

- [x] **Step 3: Implement canonical bindings and deterministic receipt identity**

Normalize selectors by type, ID, and sorted filter keys; derive `selectorDigest`, `grantDigest`, and `waterlineDigest` with SHA-256 over canonical JSON. Compute `deterministicKey` from exact Scope, subject, grant digest, Profile, selector digest, purpose, locale, policy ID/version, and source waterline digest. Deliberately exclude the server-generated `asOf` and `validUntil`: including either timestamp would defeat unchanged-decision reuse. Look up an unexpired matching receipt before creating a new one; only a new receipt captures the transaction clock as `asOf`. Bind persisted receipt content to:

```ts
const receiptBinding = {
  architectureScope,
  subjectId: caller.subject,
  grantDigest,
  profileId: input.knowledgeProfile,
  selectorDigest,
  purpose: input.purpose.trim(),
  locale: input.locale,
  policyId: policy.id,
  policyVersion: policy.version,
  sourceWaterlines: snapshot.waterlines,
  asOf: transactionClock.now()
};
```

`revalidateReceipt` must compare exact Scope, subject, grant digest, Profile, selector digest, policy version, `validUntil`, and every current waterline. Return `KNOWLEDGE_RECEIPT_STALE` on any mismatch and never silently upgrade an old receipt.

- [x] **Step 4: Implement restrictive policy writes**

Validate the proposed overlay by calling `composeKnowledgeReadinessPolicy` before persistence. Require the caller's exact write grant in the tool layer and persist actor ID, incremented version, canonical overlay JSON, and `ACTIVE` status. The enterprise minimum remains compiled in `@specforge/core`; database rows are exact-Scope overlays only.

- [x] **Step 5: Run service tests and typecheck**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/service.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit code 0.

- [x] **Step 6: Commit the governed decision service**

```bash
git add apps/mcp-server/src/knowledge-readiness/service.ts apps/mcp-server/src/knowledge-readiness/service.test.ts
git commit -m "feat: issue scoped knowledge readiness receipts"
```

### Task 5: Atomic Bounded Read and Waterline-Bound Continuation Cursor

**Files:**
- Create: `apps/mcp-server/src/knowledge-readiness/read.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/read.test.ts`
- Modify: `apps/mcp-server/src/scoped-read-projection.ts`

**Interfaces:**
- Consumes: `evaluateScopedKnowledgeReadiness`, `revalidateReceipt`, `AssetSearchProjection`, typed relationship repository, and `encodeReadCursor`/`decodeReadCursor` from `@specforge/scoped-read`.
- Produces: `readSystemKnowledge(prisma, input, caller)` returning a denied envelope or an allowed `trustEnvelope`, `assets`, `relationships`, `responseCompleteness`, and optional signed `nextCursor`.

- [x] **Step 1: Write failing atomic-read and pagination tests**

Cover first-page atomicity, response budgets, cursor caller binding, cursor query binding, cursor waterline invalidation, and `PARTIAL` until exhaustion.

```ts
it("does not combine validation and assets from different waterlines", async () => {
  const result = await readWithMutationBetweenEvidenceAndAssets();
  expect(result).toMatchObject({ accessDecision: "DENY", reasonCodes: ["KNOWLEDGE_RECEIPT_STALE"] });
});

it("separates trust status from page completeness", async () => {
  const first = await readSystemKnowledge(prisma, { ...request, pageSize: 1 }, caller);
  expect(first).toMatchObject({ accessDecision: "ALLOW", trustEnvelope: { trustStatus: "SELF_CONTAINED" }, responseCompleteness: "PARTIAL" });
  expect(first.nextCursor).toEqual(expect.any(String));
  const final = await readSystemKnowledge(prisma, { ...request, cursor: first.nextCursor }, caller);
  expect(final.responseCompleteness).toBe("COMPLETE");
});
```

- [x] **Step 2: Run focused tests and confirm the read boundary is absent**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/read.test.ts`

Expected: FAIL with missing `readSystemKnowledge`.

- [x] **Step 3: Implement the first page in one REPEATABLE READ transaction**

Use this transaction boundary:

```ts
return prisma.$transaction(
  async (tx) => {
    const readiness = input.receiptId
      ? await revalidateReceipt(tx, input.receiptId, input, caller)
      : await evaluateScopedKnowledgeReadiness(tx, input, caller);
    if (readiness.trustStatus !== "SELF_CONTAINED") return deniedRead(readiness);
    return readBoundedPage(tx, input, caller, readiness);
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
);
```

Read from `AssetSearchProjection` and the typed relationship tables using exact Scope, stable order `(assetType, assetId)` and `(relationshipType, sourceAssetType, sourceAssetId, targetAssetType, targetAssetId)`, and `pageSize + 1`. Enforce policy limits for asset count, relationship count, encoded JSON bytes, and elapsed execution time. A budget failure returns no partial asset body and reason `KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED`.

- [x] **Step 4: Bind and sign continuation cursors**

Reuse `@specforge/scoped-read` with a dedicated keyring loaded from `SPECFORGE_KNOWLEDGE_CURSOR_KEY` and `SPECFORGE_KNOWLEDGE_CURSOR_KEY_ID`. The binding must include:

```ts
const cursorBinding = {
  subject: caller.subject,
  grantDigest: readiness.grantDigest,
  architectureScope: input.architectureScope,
  receiptId: readiness.receiptId,
  profileId: input.knowledgeProfile,
  selectorDigest: readiness.selectorDigest,
  queryDigest,
  policyVersion: readiness.policyVersion,
  waterlineDigest: readiness.waterlineDigest,
  sort: "assetType,assetId"
} as const;
```

On continuation, re-evaluate TTL and waterlines before decoding/reading. Map signature or binding failures to `KNOWLEDGE_RECEIPT_STALE` without exposing cursor internals.

- [x] **Step 5: Run atomicity, cursor, and type tests**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/read.test.ts`

Expected: PASS including the concurrent mutation case.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit code 0.

- [x] **Step 6: Commit the authoritative read operation**

```bash
git add apps/mcp-server/src/knowledge-readiness/read.ts apps/mcp-server/src/knowledge-readiness/read.test.ts apps/mcp-server/src/scoped-read-projection.ts
git commit -m "feat: add atomic gated system knowledge reads"
```

### Task 6: Register MCP Tools with Exact-Scope Authorization and Durable Audit

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/architecture/principal.ts`
- Modify: `apps/mcp-server/src/federation/tools.ts`
- Modify: `apps/mcp-server/src/federation/tools.test.ts`
- Modify: `apps/mcp-server/src/index.ts`

**Interfaces:**
- Consumes: Task 4 service and Task 5 read operation.
- Produces MCP tools `upsert_knowledge_readiness_policy`, `evaluate_system_knowledge_readiness`, and `read_system_knowledge`; new permissions `knowledge:consume` and `knowledge:diagnostic`.

- [x] **Step 1: Write failing MCP registration, permission, and no-leak tests**

Extend the federation tool harness to invoke each new tool with exact and parent-only grants. Assert tool annotations, required permission claims, durable success/failure audit, and the precise unauthorized body.

```ts
it("registers the readiness boundary with least-privilege permissions", () => {
  expect(tool("evaluate_system_knowledge_readiness").requiredPermissions).toEqual(["knowledge:consume"]);
  expect(tool("read_system_knowledge").requiredPermissions).toEqual(["knowledge:consume"]);
  expect(tool("upsert_knowledge_readiness_policy").requiredPermissions).toEqual(["knowledge:write", "governance:run"]);
});

it("does not reveal readiness diagnostics across Scope", async () => {
  const result = await invoke("read_system_knowledge", request, parentOnlyCaller);
  expect(json(result)).toEqual({ accessDecision: "DENY", trustStatus: "BLOCKED", reasonCodes: ["KNOWLEDGE_SCOPE_ACCESS_DENIED"], remediationActions: [] });
});
```

- [x] **Step 2: Run the tool tests and confirm registrations are absent**

Run: `pnpm exec vitest run apps/mcp-server/src/federation/tools.test.ts`

Expected: FAIL because the three tool names and permissions are absent.

- [x] **Step 3: Add permissions to the closed Permission union and principal validator**

Add `"knowledge:consume"` and `"knowledge:diagnostic"` to `Permission` and the recognized permission Set. Do not grant either permission merely because the actor has `asset:read`; authenticated claims and exact Scope grants remain independently required.

- [x] **Step 4: Register the three tools through `registerFederationJsonTool`**

Use `architectureScopeSchema` and bounded schemas:

```ts
const knowledgeSelectorSchema = z.object({
  assetTypes: z.array(z.string().min(1)).max(32).optional(),
  assetIds: z.array(z.string().min(1)).max(500).optional(),
  relationshipTypes: z.array(z.string().min(1)).max(64).optional()
});

const knowledgeReadInputSchema = {
  architectureScope: architectureScopeSchema,
  knowledgeProfile: z.enum(["ARCHITECTURE_OVERVIEW", "CHANGE_ASSESSMENT", "RUNTIME_DIAGNOSIS"]),
  selectors: z.array(knowledgeSelectorSchema).min(1).max(32),
  purpose: z.string().min(1).max(500),
  locale: z.enum(["en", "zh"]).default("en"),
  receiptId: z.string().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).optional()
};
```

Call `assertReadableExactScope` before the service and map any Scope failure to the stable no-leak response. Policy writes call `assertWritableExactScope`; evaluation and reads call `assertReadableExactScope`. Keep durable federation audit summaries to subject, Scope, Profile, selector digest, decision, reasons, and receipt ID; never include asset bodies.

- [x] **Step 5: Set safe default development claims without weakening exact-Scope grants**

Add `knowledge:consume` to the MCP server's local default claim list in `apps/mcp-server/src/index.ts`. Do not add `knowledge:diagnostic` to defaults. Production tokens still supply explicit claims and exact application-service grants.

- [x] **Step 6: Run MCP tests and typechecks**

Run: `pnpm exec vitest run apps/mcp-server/src/federation/tools.test.ts`

Expected: PASS, including no-leak and audit assertions.

Run: `pnpm --filter @specforge/core typecheck && pnpm --filter @specforge/mcp-server typecheck`

Expected: both commands exit 0.

- [x] **Step 7: Commit the MCP boundary**

```bash
git add packages/core/src/types.ts packages/core/src/architecture/principal.ts apps/mcp-server/src/federation/tools.ts apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/index.ts
git commit -m "feat: expose gated knowledge reads through mcp"
```

### Task 7: Stage Low-Level Read Migration and Update Agent Guidance

**Files:**
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/prompts.ts`
- Modify: `packages/core/src/governance/briefing.ts`
- Modify: `AGENTS.md`
- Create: `apps/mcp-server/src/knowledge-readiness/compatibility.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/compatibility.test.ts`

**Interfaces:**
- Consumes: `knowledge:consume`, `knowledge:diagnostic`, and the new MCP tool names.
- Produces: `resolveKnowledgeReadMode(environment, caller)` with `OBSERVE`, `ENFORCE`, and `DIAGNOSTIC_ONLY` outcomes; deprecation audit metadata for low-level reads.

- [ ] **Step 1: Write failing compatibility-mode tests**

```ts
it("keeps payload compatibility while auditing ordinary low-level reads in observe mode", () => {
  expect(resolveKnowledgeReadMode({ enforcement: "observe" }, ordinaryCaller)).toEqual({ allow: true, mode: "OBSERVE", emitDeprecationAudit: true });
});

it("denies low-level ordinary reads after enforcement", () => {
  expect(resolveKnowledgeReadMode({ enforcement: "enforce" }, ordinaryCaller)).toEqual({ allow: false, mode: "ENFORCE", emitDeprecationAudit: true });
});

it("marks explicitly authorized governance reads as diagnostic only", () => {
  expect(resolveKnowledgeReadMode({ enforcement: "enforce" }, diagnosticCaller)).toEqual({ allow: true, mode: "DIAGNOSTIC_ONLY", emitDeprecationAudit: false });
});
```

- [ ] **Step 2: Run the compatibility test and confirm the resolver is absent**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/compatibility.test.ts`

Expected: FAIL with missing resolver.

- [ ] **Step 3: Implement the explicit compatibility switch**

Read `SPECFORGE_KNOWLEDGE_READ_ENFORCEMENT`, accepting only `observe` or `enforce` and defaulting to `observe`. In observe mode, preserve existing low-level response payloads and emit an audit event that names `read_system_knowledge` as the replacement. In enforce mode, ordinary Agents receive a stable migration denial; callers with `knowledge:diagnostic` and governance role receive the existing payload wrapped only at tool metadata/audit level as `DIAGNOSTIC_ONLY`, avoiding a silent payload-shape change.

- [ ] **Step 4: Route agent-facing prompts and briefings through the gate**

Change `design_feature`, proposal review, coding context, and architecture/system-understanding guidance to call `read_system_knowledge` first with the appropriate registered Profile. The prompt must state: retain `Profile` and `asOf` in conclusions; follow all continuation pages before claiming a complete inventory; stop deterministic answering on `DENY`; use low-level tools only for explicitly authorized diagnostics.

Add the same pre-code read rule to `AGENTS.md`, directly after the Implementation Preflight Gate, without changing the existing design-change session requirement.

- [ ] **Step 5: Run compatibility and prompt tests**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/compatibility.test.ts apps/mcp-server/src/tools.test.ts`

Expected: PASS; existing low-level payload assertions remain unchanged in observe mode.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit migration behavior and guidance**

```bash
git add apps/mcp-server/src/knowledge-readiness/compatibility.ts apps/mcp-server/src/knowledge-readiness/compatibility.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/prompts.ts packages/core/src/governance/briefing.ts AGENTS.md
git commit -m "feat: migrate agents to readiness-gated knowledge reads"
```

### Task 8: End-to-End Trust Transition, Metrics, and Operational Evidence

**Files:**
- Create: `apps/mcp-server/src/knowledge-readiness/readiness.e2e.test.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/metrics.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/metrics.test.ts`
- Modify: `apps/mcp-server/src/federation/tools.ts`

**Interfaces:**
- Consumes: connector observation, candidate promotion, reconciliation, Baseline publication, readiness evaluation, and gated read operations.
- Produces: bounded per-Scope readiness metrics and one executable acceptance path proving allow -> deny -> reconverge -> allow.

- [ ] **Step 1: Write the end-to-end trust-transition test**

The test must perform this sequence using the public persistence/tool boundaries rather than inserting a ready receipt directly:

```ts
it("allows only a current reconciled generation and fails closed on drift", async () => {
  await registerRequiredSources(scope);
  await submitCompletedFullSnapshot(scope);
  await reviewAndPromoteCandidates(scope);
  await reconcileAndPublishBaseline(scope);

  const current = await readSystemKnowledge(prisma, request, caller);
  expect(current.accessDecision).toBe("ALLOW");

  await submitPendingSourceDrift(scope);
  const drifted = await readSystemKnowledge(prisma, request, caller);
  expect(drifted).toMatchObject({ accessDecision: "DENY", trustStatus: "SOURCE_CHECK_REQUIRED" });

  await completePromotionReconciliationAndPublication(scope);
  const restored = await readSystemKnowledge(prisma, request, caller);
  expect(restored.accessDecision).toBe("ALLOW");
  expect(restored.trustEnvelope.receiptId).not.toBe(current.trustEnvelope.receiptId);
});
```

Add separate assertions for freshness expiry without waterline movement, unauthorized no-leak, incomplete snapshot, open tombstone, runtime-source absence, and mixed-page cursor rejection.

- [ ] **Step 2: Write failing bounded-metrics tests**

Assert counters by Profile/reason, receipt reuse, evaluation latency histogram, stale/incomplete/pending ages, diagnostic denials, cursor invalidations, and budget failures. Labels may include exact Scope only after authorization; asset IDs and bodies must never appear.

- [ ] **Step 3: Run the E2E and metrics tests before implementation**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/readiness.e2e.test.ts apps/mcp-server/src/knowledge-readiness/metrics.test.ts`

Expected: metrics test FAIL before instrumentation; E2E exposes any missing lifecycle wiring.

- [ ] **Step 4: Add bounded in-process metrics instrumentation**

Implement counters and fixed buckets without a new dependency. Expose `recordReadinessEvaluation`, `recordReceiptReuse`, `recordCursorInvalidation`, `recordDiagnosticDenial`, `recordBudgetFailure`, and `snapshotReadinessMetrics(scope)`; cap Profile/reason label cardinality with the closed unions from Task 1. Call the recorders only after exact-Scope authorization.

- [ ] **Step 5: Run the full readiness suite once for the phase**

Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run packages/core/src/knowledge-readiness apps/mcp-server/src/knowledge-readiness apps/mcp-server/src/federation/tools.test.ts`

Expected: PASS for unit, PostgreSQL integration, authorization, atomicity, pagination, and E2E cases.

Run: `pnpm typecheck`

Expected: all workspace typechecks exit 0.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit acceptance evidence code**

```bash
git add apps/mcp-server/src/knowledge-readiness/readiness.e2e.test.ts apps/mcp-server/src/knowledge-readiness/metrics.ts apps/mcp-server/src/knowledge-readiness/metrics.test.ts apps/mcp-server/src/federation/tools.ts
git commit -m "test: verify system knowledge readiness lifecycle"
```

### Task 9: Close Repository and MCP Design-Fact Records Together

**Files:**
- Create: `docs/adr/0045-system-knowledge-readiness-gate.md`
- Create: `docs/design-facts/system-knowledge-readiness-manifest.json`
- Modify: `docs/TODO.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-30-system-knowledge-readiness-gate-design.md`

**Interfaces:**
- Consumes: verified command results from Tasks 1-8 and Design Change Session `design-change-session:214866ac-190d-4182-a7ac-6b0d869b40f9`.
- Produces matching repository and MCP records with stable IDs: `adr-system-knowledge-readiness-gate`, `proposal-system-knowledge-readiness-gate`, `context-pack-system-knowledge-readiness-gate`, `api-specforge-system-knowledge-readiness`, `data-specforge-system-knowledge-readiness-receipt`, and `rule-specforge-system-knowledge-readiness`.

- [ ] **Step 1: Write the bilingual ADR with exact evidence**

Document decision, context, rejected alternatives, authority boundary, policy composition, immutable receipt identity, REPEATABLE READ, staged compatibility, security/no-leak behavior, consequences, and rollback. Add exact command/result evidence from the completed phase. Mark runtime connectors, cross-Scope aggregation, Web administration, external identity, auto-remediation, and production capacity certification as deferred rather than implemented.

- [ ] **Step 2: Add the managed design-fact manifest with typed links**

The manifest must use the repository's existing `DesignFactManifest` shape, the exact owning Scope, and English canonical plus Chinese localized content. Define one decision entry with these stable identities and managed relationships:

```json
{
  "decisions": [
    {
      "id": "system-knowledge-readiness-gate",
      "repositoryAdr": "docs/adr/0045-system-knowledge-readiness-gate.md",
      "mcpAdrId": "adr-system-knowledge-readiness-gate",
      "scope": {
        "applicationServiceId": "com.huawei.celon.desiner",
        "scopePath": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
      },
      "proposalId": "proposal-system-knowledge-readiness-gate",
      "contextPackId": "context-pack-system-knowledge-readiness-gate",
      "relatedAssetIds": [
        "api-specforge-system-knowledge-readiness",
        "data-specforge-system-knowledge-readiness-receipt",
        "rule-specforge-system-knowledge-readiness"
      ],
      "managedAssets": [
        {
          "assetType": "api",
          "asset": {
            "id": "api-specforge-system-knowledge-readiness",
            "name": "System Knowledge Readiness MCP Contract",
            "description": "Fail-closed exact-Scope evaluation and atomic bounded knowledge-read contract for Agents.",
            "method": "POST",
            "path": "mcp://tools/read_system_knowledge",
            "domainId": "domain-specforge-platform",
            "providerSystem": "SpecForge MCP Server",
            "consumers": ["Authorized coding Agent", "SpecForge governance operations"],
            "requestSchema": { "architectureScope": "ArchitectureScopeRef", "knowledgeProfile": "KnowledgeProfileId", "selectors": "KnowledgeSelector[]", "purpose": "string", "locale": "en|zh" },
            "responseSchema": { "decision": "SystemKnowledgeReadDecision", "receipt": "SystemKnowledgeReadinessReceipt" },
            "errorCodes": ["KNOWLEDGE_SCOPE_ACCESS_DENIED", "KNOWLEDGE_RECEIPT_STALE", "KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED"],
            "authType": "Exact application-service knowledge:consume grant",
            "idempotency": "Identical caller, query, policy, and waterlines reuse one immutable receipt.",
            "rateLimit": "Bounded by Profile policy and per-response asset, relationship, byte, and time budgets.",
            "timeout": "Policy executionMilliseconds budget",
            "compatibilityPolicy": "Gated v1 is additive; low-level reads migrate through explicit observe and enforce modes.",
            "openapiSpec": "MCP schemas: evaluate_system_knowledge_readiness and read_system_knowledge",
            "exposure": "internal",
            "localizedContent": {
              "en": { "name": "System Knowledge Readiness MCP Contract", "description": "Fail-closed exact-Scope evaluation and atomic bounded knowledge-read contract for Agents." },
              "zh": { "name": "系统知识可信读取 MCP 契约", "description": "面向 Agent 的失败关闭、精确 Scope 评估与原子有界知识读取契约。" }
            }
          }
        },
        {
          "assetType": "dataModel",
          "asset": {
            "id": "data-specforge-system-knowledge-readiness-receipt",
            "name": "System Knowledge Readiness Receipt",
            "description": "Immutable caller-, policy-, selector-, and waterline-bound trust decision retained in PostgreSQL.",
            "code": "SystemKnowledgeReadinessReceipt",
            "modelType": "logical",
            "domainId": "domain-specforge-platform",
            "tables": ["KnowledgeReadinessPolicy", "SystemKnowledgeReadinessReceipt"],
            "entities": ["Readiness Policy Overlay", "Readiness Receipt", "Source Waterline Envelope"],
            "fields": [],
            "relationships": ["One receipt binds one exact Scope, caller grant, Profile, selector digest, policy version, and source generation."],
            "constraints": ["Receipts are immutable and idempotently reused only while unexpired and waterline-current.", "Scope overlays can tighten but never weaken the enterprise minimum."],
            "dataClassification": "internal governance metadata",
            "lifecycle": "Created after evaluation, ACTIVE until expiry or waterline invalidation, then retained according to policy.",
            "lineage": "Published Baseline, connector snapshots, catalog and relationship waterlines, reconciliation, and caller grant.",
            "localizedContent": {
              "en": { "name": "System Knowledge Readiness Receipt", "description": "Immutable caller-, policy-, selector-, and waterline-bound trust decision retained in PostgreSQL.", "fields": {} },
              "zh": { "name": "系统知识可信读取回执", "description": "持久化在 PostgreSQL 中并绑定调用者、策略、选择条件和水位的不可变可信判定。", "fields": {} }
            }
          }
        },
        {
          "assetType": "businessRule",
          "asset": {
            "id": "rule-specforge-system-knowledge-readiness",
            "name": "Fail-Closed System Knowledge Consumption Rule",
            "description": "Permits sole-source Agent use only when the exact Profile is current, complete, authorized, conflict-free, and reconciled.",
            "code": "SPECFORGE_SYSTEM_KNOWLEDGE_READINESS",
            "domainId": "domain-specforge-platform",
            "ruleType": "permission",
            "condition": "An Agent requests deterministic system knowledge for an exact application-service Scope.",
            "action": "Evaluate the registered Profile and return assets only for a current SELF_CONTAINED receipt.",
            "exception": "Governance diagnostics require knowledge:diagnostic and are always marked DIAGNOSTIC_ONLY.",
            "examples": ["Pending source drift returns SOURCE_CHECK_REQUIRED with no asset body.", "An unresolved conflict returns BLOCKED with no asset body."],
            "relatedAssets": [{ "type": "api", "id": "api-specforge-system-knowledge-readiness", "label": "System Knowledge Readiness MCP Contract" }],
            "severity": "high",
            "localizedContent": {
              "en": { "name": "Fail-Closed System Knowledge Consumption Rule", "description": "Permits sole-source Agent use only when the exact Profile is current, complete, authorized, conflict-free, and reconciled." },
              "zh": { "name": "系统知识失败关闭读取规则", "description": "仅在精确 Profile 足够新、完整、已授权、无冲突且对账收敛时，允许 Agent 将 SpecForge 作为唯一来源。" }
            }
          }
        }
      ],
      "managedRelationships": [
        { "sourceType": "api", "sourceId": "api-specforge-system-knowledge-readiness", "targetType": "dataModel", "targetId": "data-specforge-system-knowledge-readiness-receipt", "relationType": "READS" },
        { "sourceType": "businessRule", "sourceId": "rule-specforge-system-knowledge-readiness", "targetType": "api", "targetId": "api-specforge-system-knowledge-readiness", "relationType": "GOVERNS" },
        { "sourceType": "proposal", "sourceId": "proposal-system-knowledge-readiness-gate", "targetType": "api", "targetId": "api-specforge-system-knowledge-readiness", "relationType": "IMPACTS" },
        { "sourceType": "proposal", "sourceId": "proposal-system-knowledge-readiness-gate", "targetType": "dataModel", "targetId": "data-specforge-system-knowledge-readiness-receipt", "relationType": "IMPACTS" },
        { "sourceType": "proposal", "sourceId": "proposal-system-knowledge-readiness-gate", "targetType": "businessRule", "targetId": "rule-specforge-system-knowledge-readiness", "relationType": "IMPACTS" }
      ],
      "proposalStatus": "implemented",
      "owner": "SpecForge platform governance",
      "status": "Implemented, locally verified, MCP synchronized, and reconciled in the exact Designer Scope",
      "reason": "Agents need an auditable fail-closed proof before treating SpecForge as the sole source for current system knowledge.",
      "retryTrigger": "Open a new exact-Scope design session when Profile requirements, policy semantics, permissions, or read contracts change.",
      "evidence": []
    }
  ]
}
```

Before synchronization, replace the empty `evidence` array with the exact successful commands and results captured in Tasks 1-8 and add complete localized overlays for every human-facing API, data-model, and rule field required by `scripts/sync-design-facts.ts`. The sync helper automatically adds Proposal `IMPLEMENTS_DECISION` ADR, Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal, ADR `DECIDES` each related asset, and Evidence `VALIDATES` ADR; the five managed links above add API/data access, rule governance, and Proposal impact without inventing relation codes.

- [ ] **Step 3: Record deferred production work as owned backlog facts**

Update `docs/TODO.md` with separate entries for live enterprise source operations, cross-Scope readiness, Web policy administration, automatic remediation, external production identity, final low-level-read enforcement cutover, and production capacity certification. Each entry names owner `SpecForge platform governance`, trigger, rationale, and current state. Do not describe these as delivered.

- [ ] **Step 4: Update operator and Agent documentation**

Document the three Profiles, exact-Scope token requirements, `evaluate_system_knowledge_readiness`, authoritative `read_system_knowledge`, `SOURCE_CHECK_REQUIRED` meaning, pagination obligations, observe/enforce migration setting, and the fact that `RUNTIME_DIAGNOSIS` remains unready without real runtime evidence.

- [ ] **Step 5: Synchronize design facts only through MCP and reconcile**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_MANIFEST='docs/design-facts/system-knowledge-readiness-manifest.json'
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: all six assets and four typed relationships are persisted in the exact owning Scope, localization checks pass, and reconciliation reports no missing or divergent fact.

- [ ] **Step 6: Run final focused verification once**

Run:

```powershell
$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'
pnpm exec vitest run packages/core/src/knowledge-readiness apps/mcp-server/src/knowledge-readiness apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/tools.test.ts
pnpm typecheck
pnpm design-facts:check
git diff --check
```

Expected: all tests pass, all typechecks pass, design facts reconcile, and no whitespace errors are reported.

- [ ] **Step 7: Close the existing Design Change Session with exact evidence**

Run:

```powershell
pnpm design-context:close -- --session design-change-session:214866ac-190d-4182-a7ac-6b0d869b40f9 --status CONVERGED --evidence "vitest readiness suite=pass,pnpm typecheck=pass,pnpm design-facts:check=pass,git diff --check=pass"
```

Expected: the same session returns `CONVERGED`. If MCP persistence or reconciliation fails, close as `BLOCKED` with the actual failure and retry trigger, add `MCP synchronization blocked` to the ADR/backlog record, and do not claim completion.

- [ ] **Step 8: Commit the synchronized repository records**

```bash
git add docs/adr/0045-system-knowledge-readiness-gate.md docs/design-facts/system-knowledge-readiness-manifest.json docs/TODO.md README.md docs/superpowers/specs/2026-08-30-system-knowledge-readiness-gate-design.md
git commit -m "docs: record system knowledge readiness delivery"
```

- [ ] **Step 9: Inspect final repository state**

Run: `git status --short`

Expected: only the pre-existing untracked `.tmp/` remains; no implementation or design-record file is unstaged.
