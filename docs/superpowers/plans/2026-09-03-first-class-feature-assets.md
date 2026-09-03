# First-Class Feature Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver scoped, bilingual Service Feature and Functional Feature assets with atomic MCP writes, typed traceability, a read-only Web workspace, and readiness-gated downstream consumption.

**Architecture:** Features remain generic `DesignAsset` records and reuse authored revisions, search projections, relationship events, graph Outbox processing, and the existing durable relationship command receipt ledger. A dedicated Feature application layer validates one bounded Change Set and commits its assets, revisions, relationships, Outbox rows, audit entry, and `APPLY_FEATURE_CHANGE_SET` receipt in one PostgreSQL transaction; Web reads use scoped PostgreSQL projections, while agent understanding continues through the system-knowledge readiness gate.

**Tech Stack:** TypeScript 5.7, pnpm 9, Zod 3, Prisma 6/PostgreSQL 16, MCP SDK 1.29, Next.js 15/React 19, Graphology/Sigma 3 WebGL, Vitest 2.

## Global Constraints

- Owning Scope is exactly `com.huawei.celon.desiner` with scope path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner` for SpecForge's own implementation records.
- Runtime Feature data may belong to any authorized exact application-service Scope; parent, sibling, implicit, and cross-Scope writes or relationships are forbidden.
- English canonical narrative and structurally complete `localizedContent.zh` are required for every human-facing Feature field.
- MCP is the only Feature write boundary; the Web workspace is read-only.
- PostgreSQL is authoritative; search and graph stores are derived projections and cannot participate as authorities in write decisions.
- `FunctionalFeature --CONTRIBUTES_TO--> ServiceFeature` is directional, many-to-many, same-Scope, and impact-propagating in both traversal directions.
- Feature IDs are stable and unique across all asset kinds inside `(applicationServiceId, scopePath)`; changing Feature kind requires a governed replacement.
- `apply_feature_change_set` limits one request to 100 assets, 1,000 relationships, and 4 MiB of canonical JSON.
- Agents that need system understanding must call `evaluate_system_knowledge_readiness` before `read_system_knowledge`; direct Feature reads remain diagnostic compatibility reads.
- Each delivery phase opens and closes its own exact-Scope `DesignChangeSession`, updates ADR `0047`, Proposal `proposal-first-class-feature-assets`, Context Pack `context-pack-first-class-feature-assets`, synchronizes through MCP, and reconciles before claiming completion.

---

## P0: Authoritative Feature Contracts And Atomic MCP Writes

### Task 1: Core Feature Asset Contracts And Localization

**Files:**
- Create: `packages/core/src/features/types.ts`
- Create: `packages/core/src/features/validation.ts`
- Create: `packages/core/src/features/validation.test.ts`
- Create: `packages/core/src/features/index.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/repository.ts`
- Modify: `packages/core/src/localization/assets.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: existing `BaseAsset`, `AssetTypeMap`, localization registry, and scoped repository collection maps.
- Produces: `ServiceFeature`, `FunctionalFeature`, `FeatureAsset`, `FeatureLifecycleStatus`, `assertValidFeatureAsset(assetType, asset)`, and complete `serviceFeature`/`functionalFeature` catalog support.

- [ ] **Step 1: Open the P0 design session before runtime edits**

Run and retain the receipt for P0 closure:

```powershell
$p0Receipt = pnpm design-context:preflight -- --intent "Implement P0 first-class Feature contracts, ontology, atomic MCP Change Set, and scoped reads" --affected "adr-first-class-feature-assets,proposal-first-class-feature-assets,context-pack-first-class-feature-assets" --evidence "plan=docs/superpowers/plans/2026-09-03-first-class-feature-assets.md" | Out-String | ConvertFrom-Json
$p0Receipt.receipt.sessionId | Set-Content .tmp/feature-p0-session.txt
$p0Receipt
```

Expected: exit code `0` and a `DesignChangeSession` receipt whose Scope is `com.huawei.celon.desiner`. Record the returned session ID in ADR `0047` before Task 5 closes P0.

- [ ] **Step 2: Write failing contract and localization tests**

Add tests that construct both asset kinds and assert required English fields, complete Chinese overlays, valid lifecycle values, non-empty acceptance criteria, immutable kind for an existing ID, and collection lookup:

```ts
expect(() => assertValidFeatureAsset("serviceFeature", validServiceFeature)).not.toThrow();
expect(() => assertValidFeatureAsset("functionalFeature", validFunctionalFeature)).not.toThrow();
expect(() => assertValidFeatureAsset("serviceFeature", {
  ...validServiceFeature,
  localizedContent: { zh: { ...validServiceFeature.localizedContent.zh, valueOutcome: "" } }
})).toThrowError(/FEATURE_LOCALIZATION_INVALID/);
expect(assetCollections.serviceFeature).toBe("serviceFeatures");
expect(assetCollections.functionalFeature).toBe("functionalFeatures");
```

- [ ] **Step 3: Verify the tests fail for missing Feature types**

Run:

```powershell
pnpm exec vitest run packages/core/src/features/validation.test.ts
```

Expected: non-zero exit because the Feature module and asset mappings do not exist.

- [ ] **Step 4: Implement the contracts and validation**

Use these exact discriminators and derived-state enums:

```ts
export type FeatureAssetType = "serviceFeature" | "functionalFeature";
export type FeatureLifecycleStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "RETIRED";
export type FeatureCoverageStatus = "UNMAPPED" | "PARTIAL" | "COMPLETE";
export type FeatureEvidenceStatus = "NO_EVIDENCE" | "IMPLEMENTED" | "VERIFIED";
export type FeatureConsistencyStatus = "UNKNOWN" | "CONSISTENT" | "DRIFTED" | "STALE";

export interface ServiceFeatureLocalizedFields extends BaseAssetLocalizedFields {
  actors: string[];
  scenario: string;
  valueOutcome: string;
  benefitHypothesis: string;
  serviceBoundary: string[];
  acceptanceCriteria: string[];
}

export interface FunctionalFeatureLocalizedFields extends BaseAssetLocalizedFields {
  trigger: string;
  observableBehavior: string;
  preconditions: string[];
  postconditions: string[];
  exceptionBehaviors: string[];
  acceptanceCriteria: string[];
}

export interface ServiceFeature extends BaseAsset<ServiceFeatureLocalizedFields> {
  lifecycleStatus: FeatureLifecycleStatus;
  owner?: string;
  tags: string[];
  actors: string[];
  scenario: string;
  valueOutcome: string;
  benefitHypothesis: string;
  serviceBoundary: string[];
  acceptanceCriteria: string[];
}

export interface FunctionalFeature extends BaseAsset<FunctionalFeatureLocalizedFields> {
  lifecycleStatus: FeatureLifecycleStatus;
  owner?: string;
  tags: string[];
  trigger: string;
  observableBehavior: string;
  preconditions: string[];
  postconditions: string[];
  exceptionBehaviors: string[];
  acceptanceCriteria: string[];
}

export type FeatureAsset = ServiceFeature | FunctionalFeature;
```

Extend `AssetType`, `SpecForgeDataStore`, `AssetTypeMap`, collection labels, localization definitions, repository lookup, and exports. Keep contract/schema inputs and outputs in typed links; do not duplicate API or data schemas in Feature payloads.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
pnpm exec vitest run packages/core/src/features/validation.test.ts packages/core/src/__tests__/asset-localization.test.ts
pnpm --filter @specforge/core typecheck
```

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 6: Commit Task 1**

```powershell
git add packages/core/src/features packages/core/src/types.ts packages/core/src/repository.ts packages/core/src/localization/assets.ts packages/core/src/index.ts
git commit -m "feat(core): add first-class feature contracts"
```

### Task 2: Feature Relationship Ontology And Graph Extraction

**Files:**
- Modify: `packages/core/src/relationships/types.ts`
- Modify: `packages/core/src/relationships/ontology.ts`
- Modify: `packages/core/src/__tests__/relationship-ontology.test.ts`
- Modify: `packages/core/src/relationships/extract.ts`
- Modify: `packages/core/src/__tests__/relationship-extraction.test.ts`

**Interfaces:**
- Consumes: `FeatureAssetType`, existing `AssetNodeType`, relationship validation, and asset graph extraction.
- Produces: ontology version `specforge.relationships.v3`, `CONTRIBUTES_TO`, `EXPOSES`, and legal Feature endpoints for existing semantic relationship codes.

- [ ] **Step 1: Write failing ontology tests**

Cover legal and illegal directions, same-Scope enforcement, duplicate/self-link rejection in higher-level validation, and Feature graph nodes:

```ts
expect(() => validateRelationshipEndpoints("CONTRIBUTES_TO", "functionalFeature", "serviceFeature")).not.toThrow();
expect(() => validateRelationshipEndpoints("CONTRIBUTES_TO", "serviceFeature", "functionalFeature")).toThrowError(/RELATIONSHIP_ENDPOINT_INVALID/);
expect(() => validateRelationshipEndpoints("EXPOSES", "apiOperation", "functionalFeature")).not.toThrow();
expect(() => validateRelationshipEndpoints("EMITS", "functionalFeature", "event")).not.toThrow();
expect(() => validateRelationshipEndpoints("READS", "functionalFeature", "dataField")).not.toThrow();
```

- [ ] **Step 2: Run the tests and observe the missing ontology codes**

Run:

```powershell
pnpm exec vitest run packages/core/src/__tests__/relationship-ontology.test.ts packages/core/src/__tests__/relationship-extraction.test.ts
```

Expected: failure because `CONTRIBUTES_TO`, `EXPOSES`, and Feature node types are unknown.

- [ ] **Step 3: Extend only the justified semantics**

Add `CONTRIBUTES_TO` and `EXPOSES`. Extend existing endpoint matrices so Functional Features may `CONSUMES`/`EMITS` events and `READS`/`WRITES` data assets; Rules may `GOVERNS`, State Machines may `CONTROLS`, Quality may `VERIFIES`, Evidence may `VALIDATES`, Proposals may `IMPACTS`, ADRs may `DECIDES`, and Observability may `OBSERVES` either Feature kind. Do not add `REALIZES` until authored module/component node identities exist.

```ts
export type RelationshipCode = ExistingRelationshipCode | "CONTRIBUTES_TO" | "EXPOSES";

const contributesTo: RelationshipTypeDefinition = {
  code: "CONTRIBUTES_TO",
  allowedSourceTypes: ["functionalFeature"],
  allowedTargetTypes: ["serviceFeature"],
  forwardPropagation: true,
  reversePropagation: true,
  strength: "strong",
  defaultConfidence: 1,
  terminal: false,
  description: "Functional Feature contributes to Service Feature",
  version: RELATIONSHIP_ONTOLOGY_VERSION
};
```

Update graph extraction to emit Feature asset nodes using the exact Scope and to preserve relation direction.

- [ ] **Step 4: Run focused relationship tests**

Run:

```powershell
pnpm exec vitest run packages/core/src/__tests__/relationship-ontology.test.ts packages/core/src/__tests__/relationship-extraction.test.ts
pnpm --filter @specforge/core typecheck
```

Expected: all selected tests pass and ontology reports version `specforge.relationships.v3`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add packages/core/src/relationships
git commit -m "feat(core): add feature relationship semantics"
```

### Task 3: Atomic Feature Change Set Domain Service

**Files:**
- Create: `packages/core/src/features/change-set.ts`
- Create: `packages/core/src/features/change-set.test.ts`
- Modify: `packages/core/src/features/index.ts`

**Interfaces:**
- Consumes: `FeatureAsset`, relationship ontology validation, localization validation, and exact `ArchitectureScopeRef` comparison.
- Produces: `FeatureChangeSetRequest`, `ValidatedFeatureChangeSet`, `FeatureChangeSetError`, `validateFeatureChangeSet(request, catalog)`, and budget constants.

- [ ] **Step 1: Write failing validation tests for the complete batch**

Test a valid mixed batch plus every stable rejection class:

```ts
expect(validateFeatureChangeSet(validBatch, existingCatalog).relationships).toHaveLength(1);
expectError(crossScopeBatch, "FEATURE_SCOPE_MISMATCH");
expectError(missingChineseOverlayBatch, "FEATURE_LOCALIZATION_INVALID");
expectError(existingOtherKindIdBatch, "FEATURE_ID_COLLISION");
expectError(staleVersionBatch, "FEATURE_VERSION_CONFLICT");
expectError(missingEndpointBatch, "FEATURE_ENDPOINT_NOT_FOUND");
expectError(illegalDirectionBatch, "FEATURE_RELATIONSHIP_INVALID");
expectError(duplicateRelationBatch, "FEATURE_DUPLICATE_RELATIONSHIP");
expectError(selfRelationBatch, "FEATURE_SELF_RELATIONSHIP");
expectError(unregisteredRelationBatch, "FEATURE_RELATIONSHIP_INVALID");
expectError(oversizedBatch, "FEATURE_BUDGET_EXCEEDED");
```

- [ ] **Step 2: Verify the domain-service tests fail**

Run:

```powershell
pnpm exec vitest run packages/core/src/features/change-set.test.ts
```

Expected: failure because the Change Set interfaces and validator are absent.

- [ ] **Step 3: Implement canonical request and result contracts**

```ts
export const FEATURE_CHANGE_SET_LIMITS = {
  assets: 100,
  relationships: 1_000,
  canonicalBytes: 4 * 1024 * 1024
} as const;

export interface FeatureAssetMutation {
  assetType: FeatureAssetType;
  asset: FeatureAsset;
  expectedVersion?: string;
}

export interface FeatureRelationshipMutation {
  relationType: RelationshipCode;
  source: { assetType: AssetNodeType; assetId: string };
  target: { assetType: AssetNodeType; assetId: string };
  metadata?: Record<string, string | number | boolean>;
}

export interface FeatureChangeSetRequest {
  architectureScope: ArchitectureScopeRef;
  designChangeSessionId: string;
  correlationId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  assets: FeatureAssetMutation[];
  relationships: FeatureRelationshipMutation[];
}
```

Normalize before digesting, reject unknown fields through the MCP Zod schema, compare exact application-service Scope values, and return bounded error details containing only submitted or authorized identities.

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
pnpm exec vitest run packages/core/src/features/change-set.test.ts packages/core/src/features/validation.test.ts packages/core/src/__tests__/relationship-ontology.test.ts
pnpm --filter @specforge/core typecheck
```

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit Task 3**

```powershell
git add packages/core/src/features
git commit -m "feat(core): validate atomic feature change sets"
```

### Task 4: PostgreSQL Transaction, Versions, And Idempotency

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `apps/mcp-server/src/features/repository.ts`
- Create: `apps/mcp-server/src/features/service.ts`
- Create: `apps/mcp-server/src/features/service.integration.test.ts`
- Create: `apps/mcp-server/src/features/index.ts`
- Modify: `apps/mcp-server/src/persistence.ts`

**Interfaces:**
- Consumes: `validateFeatureChangeSet`, Prisma transaction client, transaction-bound relationship repository/service, `AuthoredAssetRevision.catalogVersion`, and existing search/Outbox writers.
- Produces: `applyFeatureChangeSet(input)`, a stored `APPLY_FEATURE_CHANGE_SET` result in `RelationshipCommandReceipt`, deterministic replay, and optimistic comparison against each asset's latest authored revision version.

- [ ] **Step 1: Add failing integration tests**

Cover atomic success, rollback, dry-run, stale version, exact-Scope denial, stable idempotent replay, and mismatched replay digest:

```ts
const first = await applyFeatureChangeSet(validInput, writer);
const replay = await applyFeatureChangeSet(validInput, writer);
expect(replay).toEqual({ ...first, idempotentReplay: true });
expect(await prisma.authoredAssetRevision.count({ where: scopeWhere(scope) })).toBe(2);
await expect(applyFeatureChangeSet(invalidRelationshipInput, writer)).rejects.toMatchObject({ code: "FEATURE_RELATIONSHIP_INVALID" });
expect(await prisma.designAsset.count({ where: { ...scopeWhere(scope), id: "ff-rolled-back" } })).toBe(0);
```

- [ ] **Step 2: Verify integration tests fail before persistence exists**

Run:

```powershell
pnpm exec vitest run apps/mcp-server/src/features/service.integration.test.ts
```

Expected: failure because `applyFeatureChangeSet` and its receipt persistence are absent.

- [x] **Step 3: Reuse the durable command receipt ledger**

Use the existing receipt model with a Feature command discriminator; do not add Feature asset or duplicate receipt tables:

```ts
await repository.createReceipt(relationshipScope, {
  idempotencyKey: input.idempotencyKey,
  commandHash: requestDigest,
  commandType: "APPLY_FEATURE_CHANGE_SET"
});
```

- [ ] **Step 4: Implement one authoritative transaction**

Refactor the existing authored-asset write into a transaction-aware helper and call it for each mutation. Resolve `expectedVersion` from the latest `AuthoredAssetRevision.catalogVersion`, lock existing Feature rows before comparing, then apply relationship commands with the same Prisma transaction.

```ts
return prisma.$transaction(async (tx) => {
  const replay = await receipts.find(scope, input.idempotencyKey, tx);
  if (replay) return assertReplayDigest(replay, requestDigest);
  const catalog = await repository.loadValidationCatalog(scope, input, tx, { lock: true });
  const validated = validateFeatureChangeSet(input, catalog);
  if (input.dryRun) return dryRunReceipt(validated, requestDigest);
  const assetResults = await repository.upsertAssets(validated.assets, tx);
  const relationshipResults = await repository.applyRelationships(validated.relationships, tx, {
    childIdempotencyKey: (ordinal) => `${input.idempotencyKey}:relationship:${ordinal}`
  });
  await repository.appendAudit(validated, assetResults, relationshipResults, tx);
  return receipts.create(validated, assetResults, relationshipResults, requestDigest, tx);
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

Convert unique/serialization conflicts to stable `FEATURE_VERSION_CONFLICT` or `FEATURE_CHANGE_SET_REPLAY_MISMATCH`; other transaction failures return `FEATURE_TRANSACTION_FAILED` without leaking inaccessible identities.

- [ ] **Step 5: Generate Prisma client and run persistence evidence**

Run:

```powershell
pnpm db:generate
pnpm exec vitest run apps/mcp-server/src/features/service.integration.test.ts apps/mcp-server/src/relationships/repository.integration.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: Prisma generation succeeds, atomicity/idempotency tests pass, and MCP server typecheck exits `0`.

- [ ] **Step 6: Commit Task 4**

```powershell
git add apps/mcp-server/src/features apps/mcp-server/src/persistence.ts
git commit -m "feat(mcp): persist atomic feature change sets"
```

### Task 5: MCP Feature Tools And Bounded Scoped Reads

**Files:**
- Create: `apps/mcp-server/src/features/schemas.ts`
- Create: `apps/mcp-server/src/features/read-service.ts`
- Create: `apps/mcp-server/src/features/read-service.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/smoke.ts`

**Interfaces:**
- Consumes: `applyFeatureChangeSet`, `AssetSearchProjection`, current relationship rows, principal exact-Scope grants, and knowledge-read enforcement.
- Produces: MCP tools `apply_feature_change_set`, `list_features`, `get_feature`, `query_feature_graph`, and `validate_feature_coverage` with cursor-bounded responses.

- [ ] **Step 1: Write failing tool/read tests**

Assert exact-Scope authorization, cursor stability, no sibling counts, bounded graph depth/size, dry-run passthrough, and diagnostic-read enforcement:

```ts
expect((await listFeatures({ architectureScope: scope, limit: 25 }, reader)).items).toHaveLength(2);
await expect(listFeatures({ architectureScope: siblingScope, limit: 25 }, reader)).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" });
expect((await queryFeatureGraph({ architectureScope: scope, root: { type: "serviceFeature", id: "sf-a" }, depth: 2, limit: 200 }, reader)).nodes.length).toBeLessThanOrEqual(200);
```

- [ ] **Step 2: Verify tests fail before registration**

Run:

```powershell
pnpm exec vitest run apps/mcp-server/src/features/read-service.test.ts apps/mcp-server/src/tools.test.ts
```

Expected: failure because Feature schemas, reads, and tools are absent.

- [ ] **Step 3: Register strict schemas and services**

Use `.strict()` request objects, `limit` maximum `100` for lists, graph `depth` range `1..3`, graph node maximum `500`, and opaque cursor values signed/validated by the existing cursor helper. Require `asset:write` for apply and `asset:read` for reads; call `assertLegacyKnowledgeReadAllowed` so direct MCP Feature reads also require `knowledge:diagnostic` when knowledge enforcement is `enforce`.

```ts
registerJsonTool(server, "apply_feature_change_set", {
  description: "Atomically validate or apply scoped Service and Functional Feature assets and relationships.",
  inputSchema: applyFeatureChangeSetSchema.shape
}, async (input, context) => applyFeatureChangeSet(input, context.principal));
```

- [ ] **Step 4: Run P0 verification**

Run:

```powershell
pnpm exec vitest run packages/core/src/features/validation.test.ts packages/core/src/features/change-set.test.ts packages/core/src/__tests__/relationship-ontology.test.ts apps/mcp-server/src/features/read-service.test.ts apps/mcp-server/src/features/service.integration.test.ts apps/mcp-server/src/tools.test.ts
pnpm typecheck
pnpm --filter @specforge/mcp-server smoke
```

Expected: all focused tests pass, all workspaces typecheck, and smoke reports Feature tool registration without Scope leakage.

- [ ] **Step 5: Update and synchronize P0 design facts, then close the session**

Update ADR `0047`, Proposal, and Context Pack with implemented/local-only/deferred distinctions and exact command results. Synchronize and reconcile:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
$p0SessionId = Get-Content .tmp/feature-p0-session.txt
pnpm design-context:close -- --session $p0SessionId --status CONVERGED --evidence "vitest=passed,typecheck=passed,mcp-smoke=passed,design-facts-check=passed"
```

Expected: sync succeeds, reconciliation has empty missing/mismatched/out-of-Scope/blocked sets, and the recorded P0 session closes `CONVERGED`.

- [ ] **Step 6: Commit Task 5 and P0 records**

```powershell
git add apps/mcp-server/src/features apps/mcp-server/src/tools.ts apps/mcp-server/src/smoke.ts docs/adr/0047-first-class-feature-assets.md docs/design-facts/baseline-manifest.json
git commit -m "feat(mcp): expose scoped feature change sets"
```

## P1: Searchable Read-Only Feature Workspace

### Task 6: Feature Search Projection And Derived Coverage Read Model

**Files:**
- Create: `packages/core/src/features/coverage.ts`
- Create: `packages/core/src/features/coverage.test.ts`
- Modify: `packages/core/src/features/index.ts`
- Modify: `apps/mcp-server/src/scoped-read-projection.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `scripts/rebuild-asset-search-projection.ts`
- Create: `apps/mcp-server/src/features/projection.test.ts`

**Interfaces:**
- Consumes: Feature asset revisions and current same-Scope relationships.
- Produces: `deriveFeatureGovernanceState(input)`, searchable bilingual Feature projections, and rebuild support.

- [ ] **Step 1: Open the P1 session and write failing coverage tests**

Run and retain the P1 receipt, then write deterministic state tests:

```powershell
$p1Receipt = pnpm design-context:preflight -- --intent "Implement P1 Feature search projection and read-only Web workspace" --affected "adr-first-class-feature-assets,proposal-first-class-feature-assets,context-pack-first-class-feature-assets" --evidence "p0=converged" | Out-String | ConvertFrom-Json
$p1Receipt.receipt.sessionId | Set-Content .tmp/feature-p1-session.txt
$p1Receipt
```

```ts
expect(deriveFeatureGovernanceState(serviceFeatureWithContributor)).toMatchObject({ coverageStatus: "COMPLETE" });
expect(deriveFeatureGovernanceState(functionalFeatureWithoutTraceability)).toMatchObject({ coverageStatus: "UNMAPPED" });
expect(deriveFeatureGovernanceState(functionalFeatureWithCurrentImplementationEvidence)).toMatchObject({ evidenceStatus: "IMPLEMENTED" });
```

- [ ] **Step 2: Run tests and confirm missing projections**

```powershell
pnpm exec vitest run packages/core/src/features/coverage.test.ts apps/mcp-server/src/features/projection.test.ts
```

Expected: failure because Feature coverage and projection mapping are absent.

- [ ] **Step 3: Implement kind-aware derived states and projection rebuild**

Service Feature completeness requires at least one active `CONTRIBUTES_TO` incoming relation and acceptance criteria. Functional Feature completeness requires acceptance criteria plus at least one active traceability link among API/event/rule/state/data/quality/3A mapping; it does not require every class. Evidence is current only when metadata binds `validatedAssetVersion` or `validatedContentDigest` to the current revision.

```ts
export interface FeatureGovernanceState {
  coverageStatus: FeatureCoverageStatus;
  evidenceStatus: FeatureEvidenceStatus;
  consistencyStatus: FeatureConsistencyStatus;
  reasons: FeatureStateReason[];
}
```

Include canonical and Chinese names/summaries in `AssetSearchProjection`; rebuild Feature rows from authored assets without creating authoritative Feature records.

- [ ] **Step 4: Verify projection and coverage**

```powershell
pnpm exec vitest run packages/core/src/features/coverage.test.ts apps/mcp-server/src/features/projection.test.ts apps/mcp-server/src/scoped-read-projection.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: all tests pass and projection rebuild includes both Feature asset types.

- [ ] **Step 5: Commit Task 6**

```powershell
git add packages/core/src/features apps/mcp-server/src/scoped-read-projection.ts apps/mcp-server/src/persistence.ts apps/mcp-server/src/features/projection.test.ts scripts/rebuild-asset-search-projection.ts
git commit -m "feat: project searchable feature governance state"
```

### Task 7: Scoped Web Feature Query Layer And Routes

**Files:**
- Create: `apps/web/lib/features.ts`
- Create: `apps/web/lib/features.test.ts`
- Create: `apps/web/app/api/features/route.ts`
- Create: `apps/web/app/api/features/[id]/route.ts`
- Create: `apps/web/app/api/features/graph/route.ts`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: exact-Scope principal resolution, `DesignAsset`, `AssetSearchProjection`, relationship current view, and `deriveFeatureGovernanceState`.
- Produces: `listScopedFeatures`, `getScopedFeatureDetail`, `getScopedFeatureGraph`, and `/api/features` read-only endpoints.

- [ ] **Step 1: Write failing query tests**

```ts
const page = await listScopedFeatures(scope, { kind: "serviceFeature", locale: "zh", limit: 20 }, principal);
expect(page.items.every((item) => item.architectureScope.applicationServiceId === scope.applicationServiceId)).toBe(true);
expect(page.items[0]?.name).toBe("中文服务特性");
await expect(getScopedFeatureDetail(siblingScope, "sf-private", principal)).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" });
```

- [ ] **Step 2: Verify the Web query tests fail**

```powershell
pnpm exec vitest run apps/web/lib/features.test.ts
```

Expected: failure because the scoped Feature query layer does not exist.

- [ ] **Step 3: Implement read-only routes and navigation**

Keep all authorization and Scope resolution server-side. Lists accept `kind`, `query`, `locale`, `limit <= 100`, and cursor; graph accepts root, type filters, `depth <= 3`, and `limit <= 500`. Return `503 FEATURE_PROJECTION_UNAVAILABLE` only when a required projection is unavailable; do not translate an empty authorized Scope into an error.

```ts
export async function GET(request: NextRequest) {
  const principal = await resolveRequestPrincipal(request);
  const query = parseFeatureListQuery(request.nextUrl.searchParams);
  return NextResponse.json(await listScopedFeatures(query.architectureScope, query, principal));
}
```

Add one sidebar item labeled `Features` / `特性` with a Lucide icon and preserve `scope` in its URL. Graph reads join current relationship rows with current asset-to-3A mappings using exact Scope and the same response waterline; a missing 3A mapping is reported as unmapped coverage, not a fabricated edge.

- [ ] **Step 4: Verify Web query behavior**

```powershell
pnpm exec vitest run apps/web/lib/features.test.ts apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/scope-links.test.ts
pnpm --filter @specforge/web typecheck
```

Expected: scoped/locale/pagination tests pass and Web typecheck exits `0`.

- [ ] **Step 5: Commit Task 7**

```powershell
git add apps/web/lib/features.ts apps/web/lib/features.test.ts apps/web/app/api/features apps/web/components/app-shell.tsx apps/web/lib/i18n.ts
git commit -m "feat(web): add scoped feature read routes"
```

### Task 8: Read-Only Feature List And Detail Workspace

**Files:**
- Create: `apps/web/app/features/page.tsx`
- Create: `apps/web/components/features/feature-workspace.tsx`
- Create: `apps/web/components/features/feature-list.tsx`
- Create: `apps/web/components/features/feature-detail.tsx`
- Create: `apps/web/components/features/feature-status.tsx`
- Create: `apps/web/components/features/feature-workspace.test.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `/api/features`, existing locale/scope URL helpers, loading feedback, and governance-state reason codes.
- Produces: `/features?scope=...&locale=...&view=service|functional|graph&selection=...` with no editing controls.

- [ ] **Step 1: Write failing workspace tests**

Test tab/query preservation, bilingual display, empty/error/loading states, status reasons, and absence of write controls:

```tsx
const html = renderToStaticMarkup(<FeatureWorkspace initialView="service" scope={scope} locale="zh" initialData={featurePage} />);
expect(html).toContain("服务特性");
expect(html).not.toMatch(/新建|编辑|保存/);
expect(html).toContain(`scope=${scope.applicationServiceId}`);
```

- [ ] **Step 2: Verify the workspace tests fail**

```powershell
pnpm exec vitest run apps/web/components/features/feature-workspace.test.tsx
```

Expected: failure because Feature UI components are absent.

- [ ] **Step 3: Build the responsive list/detail workspace**

Use three compact tabs, a filter toolbar, paginated list, detail panel, typed relationship groups, and four independent status indicators. Keep sections unframed; use cards only for repeated Feature rows. Use the existing loading overlay for route fetches and an inline progress indicator for list/detail refreshes.

```tsx
<FeatureStatus
  lifecycle={feature.lifecycleStatus}
  coverage={feature.governance.coverageStatus}
  evidence={feature.governance.evidenceStatus}
  consistency={feature.governance.consistencyStatus}
  reasons={feature.governance.reasons}
/>
```

- [ ] **Step 4: Run component checks and production build**

```powershell
pnpm exec vitest run apps/web/components/features/feature-workspace.test.tsx apps/web/lib/features.test.ts
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/web build
```

Expected: tests and typecheck pass; Next.js production build exits `0`.

- [ ] **Step 5: Commit Task 8**

```powershell
git add apps/web/app/features apps/web/components/features apps/web/app/globals.css
git commit -m "feat(web): add bilingual feature workspace"
```

### Task 9: Bounded Sigma WebGL Feature Graph

**Files:**
- Create: `apps/web/components/features/feature-graph.tsx`
- Create: `apps/web/components/features/feature-graph-model.ts`
- Create: `apps/web/components/features/feature-graph-model.test.ts`
- Modify: `apps/web/components/features/feature-workspace.tsx`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: bounded `/api/features/graph`, Graphology, Sigma, existing graph interaction conventions, and localized relation labels.
- Produces: draggable, zoomable, pannable, filterable Feature graph with expandable neighborhoods and highlighted impact paths.

- [ ] **Step 1: Write failing graph-model tests**

```ts
const model = buildFeatureGraphModel(graphResponse, { locale: "zh", visibleTypes: new Set(["serviceFeature", "functionalFeature"]) });
expect(model.graph.order).toBeLessThanOrEqual(500);
expect(model.graph.getNodeAttribute("sf-a", "label")).toBe("服务特性 A");
expect(model.graph.getEdgeAttribute("ff-a->sf-a", "relationType")).toBe("CONTRIBUTES_TO");
expect(highlightImpactPath(model.graph, "sf-a", "api-a").length).toBeGreaterThan(0);
```

- [ ] **Step 2: Verify graph tests fail**

```powershell
pnpm exec vitest run apps/web/components/features/feature-graph-model.test.ts
```

Expected: failure because the Feature graph model is absent.

- [ ] **Step 3: Implement the graph model and Sigma view**

Default expansion is Service Feature to Functional Feature to first-level related assets. Double-click or explicit expand loads one additional bounded neighborhood; filters never fetch inaccessible types. Persist camera only in component state, not as an authored fact.

```tsx
<SigmaContainer settings={{ allowInvalidContainer: false, renderEdgeLabels: true }}>
  <FeatureGraphController
    graph={model.graph}
    draggable
    onExpand={loadBoundedNeighborhood}
    highlightedPath={highlightedPath}
  />
</SigmaContainer>
```

Provide icon tooltips for zoom in/out, fit, reset, expand, and path highlight. Ensure long labels truncate visually while full localized labels remain in hover/detail content.

- [ ] **Step 4: Verify graph behavior and browser acceptance**

Run:

```powershell
pnpm exec vitest run apps/web/components/features/feature-graph-model.test.ts apps/web/components/features/feature-workspace.test.tsx
pnpm --filter @specforge/web build
```

Expected: tests pass and production build exits `0`. Then open `/features?scope=com.huawei.celon.desiner&view=graph` at desktop and mobile widths and verify nonblank canvas pixels, drag, zoom, pan, expand, filters, bilingual labels, no overlap, and no node/count leakage from a sibling Scope.

- [ ] **Step 5: Synchronize P1 records and close the P1 session**

Update ADR/Proposal/Context Pack with browser evidence, then run:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
$p1SessionId = Get-Content .tmp/feature-p1-session.txt
pnpm design-context:close -- --session $p1SessionId --status CONVERGED --evidence "feature-web-tests=passed,web-build=passed,browser-desktop-mobile=passed,design-facts-check=passed"
```

Expected: reconciliation has no missing, mismatched, out-of-Scope, or blocked facts and P1 closes `CONVERGED`.

- [ ] **Step 6: Commit Task 9 and P1 records**

```powershell
git add apps/web/components/features apps/web/lib/i18n.ts docs/adr/0047-first-class-feature-assets.md docs/design-facts/baseline-manifest.json
git commit -m "feat(web): visualize bounded feature relationships"
```

## P2: Knowledge, Assessment, Evidence, And Drift

### Task 10: Readiness-Gated System Knowledge Inclusion

**Files:**
- Modify: `packages/core/src/knowledge/types.ts`
- Modify: `packages/core/src/knowledge/identity.ts`
- Modify: `packages/core/src/knowledge/profiles.ts`
- Modify: `apps/mcp-server/src/knowledge-readiness/read.ts`
- Modify: `apps/mcp-server/src/knowledge-readiness/read.test.ts`
- Modify: `apps/mcp-server/src/knowledge-readiness/service.test.ts`
- Modify: `apps/mcp-server/src/knowledge/bootstrap.ts`

**Interfaces:**
- Consumes: current Feature search projections, relationship waterline, selectors, readiness receipts, and knowledge budgets.
- Produces: Feature-aware bounded `read_system_knowledge` output after readiness approval.

- [ ] **Step 1: Open the P2 session and write failing readiness tests**

```powershell
$p2Receipt = pnpm design-context:preflight -- --intent "Implement P2 Feature knowledge, Context Pack, assessment, evidence, and drift integration" --affected "adr-first-class-feature-assets,proposal-first-class-feature-assets,context-pack-first-class-feature-assets" --evidence "p1=converged" | Out-String | ConvertFrom-Json
$p2Receipt.receipt.sessionId | Set-Content .tmp/feature-p2-session.txt
$p2Receipt
```

```ts
const result = await readSystemKnowledge(featureRequest, readyReceipt, principal);
expect(result.assets.map((asset) => asset.assetType)).toEqual(expect.arrayContaining(["serviceFeature", "functionalFeature"]));
await expect(readSystemKnowledge(featureRequest, expiredReceipt, principal)).rejects.toMatchObject({ code: "KNOWLEDGE_READINESS_REQUIRED" });
```

- [ ] **Step 2: Verify readiness tests fail**

```powershell
pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/read.test.ts apps/mcp-server/src/knowledge-readiness/service.test.ts
```

Expected: Feature selectors/profile outputs are not yet recognized.

- [ ] **Step 3: Add Feature knowledge categories without bypassing readiness**

Add both Feature kinds to generic system analysis as behavior/contract traceability, identity matching source targets, bootstrap mapping hints (`serviceFeature` to BIZ and `functionalFeature` to SYS), and bounded result summaries. Preserve the receipt digest, exact Scope, catalog version, relationship waterline, and evidence provenance.

- [ ] **Step 4: Verify knowledge inclusion**

```powershell
pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/read.test.ts apps/mcp-server/src/knowledge-readiness/service.test.ts packages/core/src/knowledge
pnpm --filter @specforge/mcp-server typecheck
```

Expected: all selected tests pass; direct reads still fail under enforcement without `knowledge:diagnostic`.

- [ ] **Step 5: Commit Task 10**

```powershell
git add packages/core/src/knowledge apps/mcp-server/src/knowledge-readiness apps/mcp-server/src/knowledge/bootstrap.ts
git commit -m "feat(knowledge): include readiness-gated features"
```

### Task 11: Context Pack And Requirement Assessment Consumption

**Files:**
- Modify: `packages/core/src/context-pack/generate.ts`
- Create: `packages/core/src/context-pack/generate.test.ts`
- Modify: `packages/core/src/impact/analyze.ts`
- Modify: `packages/core/src/impact/evaluate.ts`
- Modify: `packages/core/src/__tests__/impact-analysis.test.ts`
- Modify: `packages/core/src/requirement-assessment/evidence.ts`
- Modify: `packages/core/src/requirement-assessment/coverage.ts`
- Modify: `packages/core/src/requirement-assessment/engine.ts`
- Modify: `packages/core/src/requirement-assessment/engine.test.ts`

**Interfaces:**
- Consumes: readiness-bounded Feature assets, typed Feature paths, current governance state, and existing assessment evidence snapshots.
- Produces: explicit Service/Functional Feature Context Pack sections, Feature-aware transitive impact, and Feature-informed feasibility, effort, risk, token, and missing-knowledge explanations.

- [ ] **Step 1: Write failing downstream tests**

```ts
expect(pack.generatedMarkdown).toContain("## 1. Service Features");
expect(pack.localizedContent.zh.generatedMarkdown).toContain("## 1. 服务特性");
expect(assessment.traceability.featurePaths[0]).toMatchObject({ serviceFeatureId: "sf-a", functionalFeatureId: "ff-a" });
expect(assessment.uncertainties).toContainEqual(expect.objectContaining({ code: "FEATURE_COVERAGE_PARTIAL" }));
expect(impact.impactedAssets).toContainEqual({ type: "functionalFeature", id: "ff-a" });
```

- [ ] **Step 2: Verify tests fail before downstream support**

```powershell
pnpm exec vitest run packages/core/src/context-pack/generate.test.ts packages/core/src/requirement-assessment/engine.test.ts packages/core/src/__tests__/impact-analysis.test.ts
```

Expected: generated output lacks explicit Feature sections and assessment traceability.

- [ ] **Step 3: Implement versioned Feature consumption**

Render Service Features before Functional Features and retain exact IDs, versions/content digests, Scope, and relation paths. Extend transitive impact traversal through `CONTRIBUTES_TO` and all legal Feature traceability edges while preserving graph budgets and directional explanations. Increase uncertainty/risk rather than inventing zero effort when coverage is partial, evidence stale, or projection unavailable. Token estimates remain ranges with model/profile assumptions and must not be presented as guaranteed consumption.

- [ ] **Step 4: Verify downstream output**

```powershell
pnpm exec vitest run packages/core/src/context-pack/generate.test.ts packages/core/src/requirement-assessment/engine.test.ts packages/core/src/requirement-assessment/coverage.test.ts packages/core/src/__tests__/impact-analysis.test.ts
pnpm --filter @specforge/core typecheck
```

Expected: bilingual packs include Feature paths and assessments explain Feature-driven scope, uncertainty, effort, and token ranges.

- [ ] **Step 5: Commit Task 11**

```powershell
git add packages/core/src/context-pack packages/core/src/requirement-assessment packages/core/src/impact packages/core/src/__tests__/impact-analysis.test.ts
git commit -m "feat: use features in context and assessments"
```

### Task 12: Version-Bound Evidence, Retirement, And Drift Reconciliation

**Files:**
- Create: `packages/core/src/features/reconciliation.ts`
- Create: `packages/core/src/features/reconciliation.test.ts`
- Modify: `packages/core/src/features/coverage.ts`
- Modify: `apps/mcp-server/src/features/service.ts`
- Modify: `apps/mcp-server/src/features/read-service.ts`
- Create: `apps/mcp-server/src/features/reconciliation.integration.test.ts`

**Interfaces:**
- Consumes: Feature revision version/content digest, Evidence `VALIDATES` metadata, relationship lifecycle events, implementation observations, and projection availability.
- Produces: explainable `evidenceStatus`/`consistencyStatus`, stale-evidence detection, drift reasons, and relationship invalidation on retirement.

- [ ] **Step 1: Write failing lifecycle and reconciliation tests**

```ts
expect(reconcileFeature(currentFeature, oldEvidence, implementation)).toMatchObject({ evidenceStatus: "NO_EVIDENCE", consistencyStatus: "STALE" });
expect(reconcileFeature(currentFeature, currentEvidence, matchingImplementation)).toMatchObject({ evidenceStatus: "VERIFIED", consistencyStatus: "CONSISTENT" });
expect(reconcileFeature(currentFeature, currentEvidence, changedImplementation)).toMatchObject({ consistencyStatus: "DRIFTED" });
expect(await activeRelationships(retiredFeature)).toHaveLength(0);
```

- [ ] **Step 2: Verify reconciliation tests fail**

```powershell
pnpm exec vitest run packages/core/src/features/reconciliation.test.ts apps/mcp-server/src/features/reconciliation.integration.test.ts
```

Expected: stale/current evidence and retirement invalidation are not yet implemented.

- [ ] **Step 3: Implement evidence binding and retirement events**

Require Evidence metadata fields `validatedAssetType`, `validatedAssetId`, one of `validatedAssetVersion`/`validatedContentDigest`, `repositoryCommit`, `verificationCommand`, `verificationResult`, and `verifiedAt`. On transition to `RETIRED`, append relationship invalidation events and Outbox rows in the same Feature Change Set transaction; retain authored assets and historical revisions.

```ts
export interface FeatureReconciliationResult {
  evidenceStatus: FeatureEvidenceStatus;
  consistencyStatus: FeatureConsistencyStatus;
  reasons: Array<{ code: string; evidenceRef?: string; observedDigest?: string }>;
}
```

Projection failures yield `UNKNOWN` plus `FEATURE_PROJECTION_UNAVAILABLE`; they never imply authored-data loss or `CONSISTENT`.

- [ ] **Step 4: Run P2 and full focused verification**

```powershell
pnpm exec vitest run packages/core/src/features packages/core/src/context-pack/generate.test.ts packages/core/src/requirement-assessment apps/mcp-server/src/features apps/mcp-server/src/knowledge-readiness
pnpm typecheck
pnpm build
```

Expected: all Feature, downstream, and readiness tests pass; repository typecheck and build exit `0`.

- [ ] **Step 5: Verify one-command deployment compatibility**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1
```

Expected: bundled PostgreSQL schema bootstrap is idempotent, Web health is available on configured port `3010`, and no additional authoritative Feature store is started.

- [ ] **Step 6: Synchronize final design facts and close P2**

Update ADR `0047`, Proposal, and Context Pack with exact evidence and distinguish implemented local behavior from deferred cross-Scope templates and authored module/component realization. Run:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
$p2SessionId = Get-Content .tmp/feature-p2-session.txt
pnpm design-context:close -- --session $p2SessionId --status CONVERGED --evidence "feature-tests=passed,typecheck=passed,build=passed,compose=passed,design-facts-check=passed"
```

Expected: MCP synchronization succeeds, reconciliation reports no missing/mismatched/out-of-Scope/blocked facts, and P2 closes `CONVERGED`.

- [ ] **Step 7: Commit Task 12 and final records**

```powershell
git add packages/core/src/features apps/mcp-server/src/features docs/adr/0047-first-class-feature-assets.md docs/design-facts/baseline-manifest.json
git commit -m "feat: reconcile feature evidence and drift"
```

## Deferred Boundaries

The following remain explicit backlog facts and are not prerequisites for this plan: cross-Scope live Feature relationships, enterprise Feature templates/references, and `REALIZES` edges from modules/components before those node kinds receive authored scope-safe identities. Each backlog fact must retain owner `SpecForge Product Architecture and Design Governance`, rationale, and a retry trigger tied to approval of its independent contract.

## Final Acceptance

- A valid mixed Feature Change Set commits atomically; any invalid item rolls back all authored and relationship effects.
- Replay with the same key and digest returns the original receipt; the same key with a different digest is rejected.
- Every read and count is exact-Scope and authorization-safe.
- The Web workspace is bilingual, read-only, responsive, paginated, and has explicit loading/error/empty states.
- The graph is bounded and usable through drag, zoom, pan, filtering, expansion, and impact-path highlighting.
- Readiness-gated system knowledge, Context Packs, and requirement assessments include versioned Feature facts and provenance.
- Current evidence can produce `VERIFIED`; stale evidence and drift remain explicit and explainable.
- Repository records and MCP operational records reconcile with the same IDs and exact evidence.
