# Governed Full-Asset Repository Scan Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a provider-neutral Skill that scans an explicitly selected repository, produces evidence-backed candidates for every applicable SpecForge asset family, and writes them through MCP into one exact authorized application-service Scope without bypassing governance.

**Architecture:** Store immutable scanner, inference, risk, promotion, extractor-catalog, and semantic-prompt records as system-owned PostgreSQL facts outside application-service Scopes. Resolve those records plus a Scope-owned runtime overlay into a signed, digest-pinned session descriptor; run deterministic framework extractors locally in the Go CLI; then let the calling Agent submit bounded bilingual semantic candidates through existing MCP candidate, review, promotion, reconciliation, and Baseline gates. The repository Skill contains orchestration instructions and report explanation only, so Codex, Claude Code, OpenCode, and other MCP-capable Agents share the same server-enforced behavior.

**Tech Stack:** TypeScript 5.7, Vitest 2, Prisma 6/PostgreSQL, MCP SDK, Go 1.26, `gopkg.in/yaml.v3`, JSON Schema, portable `SKILL.md` instructions, pnpm 9.15.4.

## Global Constraints

- The owning application service is `com.specforge.designcenter` with Scope path `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- A continuous execution opens one exact-Scope design-change session before Task 1 and closes it after Task 13. If the work is split across delivery stages or worktrees, each stage opens and closes its own exact-Scope session with that stage's affected facts and evidence.
- System governance records are not application-service assets and never carry an `applicationServiceId` or `scopePath`.
- Scope runtime configuration may set repository mappings, include/exclude paths, framework hints, sensitive paths, and resource budgets, and may strengthen review; it cannot weaken system evidence, risk, approval, localization, blocker, or promotion policy.
- The Skill requires explicit `repositoryPath`, `applicationServiceId`, and `scopePath`; it never infers Scope from repository metadata, UI state, environment defaults, or prior runs.
- PostgreSQL is authoritative for authored assets, evidence, candidates, decisions, relationship events, and Baselines; graph stores remain derived projections.
- Source code stays local by default. MCP receives normalized observations, content digests, minimum redacted excerpts, and bounded semantic candidates.
- Repository content is untrusted. The scanner never executes builds, package managers, hooks, repository binaries, repository plugins, or repository-authored instructions.
- Human-facing candidate content requires canonical English and a complete Chinese overlay before promotion. Technical identifiers remain unchanged.
- The Skill never writes accepted assets, accepted relationships, or Baselines directly. Promotion remains server-governed by T0-T3 policy and separation of duties.
- A detected required framework/asset capability in `UNSUPPORTED` or failed state blocks completion; a proven `NOT_APPLICABLE` result remains visible but does not block.
- The production profile supports at least 100,000 observations using bounded, ordered, idempotent batches, checkpoint resume, and bounded Agent evidence clusters.
- `.specforge/scans/` and local spool data remain private runtime artifacts and must not be committed.

---

## File Map

### System Governance

- `prisma/schema.prisma`: add non-Scoped immutable governance records and Scope-owned runtime overlays.
- `prisma/migrations/<generated-timestamp>_system_scan_governance/migration.sql`: generated migration for new records and indexes.
- `packages/core/src/scanner/governance.ts`: canonical governance kinds, payload types, digesting, overlay rules, and effective-policy resolution.
- `packages/core/src/scanner/governance.test.ts`: pure contract, immutability, and overlay-strength tests.
- `apps/mcp-server/src/scanner/governance-persistence.ts`: PostgreSQL repository for active immutable system versions and Scope overlays.
- `apps/mcp-server/src/scanner/governance-persistence.integration.test.ts`: persistence and concurrency evidence.
- `apps/mcp-server/src/scanner/governance-bootstrap.ts`: idempotent publication of the first production governance bundle.

### Shared Scan Contract

- `packages/scan-contract/schema/scan-contract-v2.schema.json`: `TechnologyProfile`, capability plan, policy receipt, and finalization extensions.
- `packages/scan-contract/src/generated.ts`: generated TypeScript contract.
- `apps/specforge-cli/internal/scancontract/generated.go`: generated Go contract.
- `scripts/generate-scan-contract.ts`: deterministic dual-language generation and check mode.
- `packages/scan-contract/fixtures/valid-session.json`: valid policy-pinned session fixture.
- `packages/scan-contract/fixtures/valid-batch.json`: valid capability-aware batch fixture.
- `packages/scan-contract/src/contract.test.ts` and `apps/specforge-cli/internal/scancontract/contract_test.go`: cross-runtime normalization and digest tests.

### Scanner And Extractors

- `apps/specforge-cli/internal/technology/profile.go`: evidence-backed stack detection.
- `apps/specforge-cli/internal/technology/profile_test.go`: conflicts, hints, versions, and reproducibility tests.
- `apps/specforge-cli/internal/extractors/catalog.go`: signed catalog descriptor resolution and capability planning.
- `apps/specforge-cli/internal/extractors/catalog_test.go`: trust, compatibility, and coverage matrix tests.
- `apps/specforge-cli/internal/extractors/contracts.go`: OpenAPI, AsyncAPI, GraphQL SDL, Protobuf/gRPC extraction.
- `apps/specforge-cli/internal/extractors/schema.go`: SQL DDL/migration extraction.
- `apps/specforge-cli/internal/extractors/java.go`: Spring, JPA/Hibernate, MyBatis, Kafka, RabbitMQ extraction.
- `apps/specforge-cli/internal/extractors/typescript.go`: NestJS, Express, Fastify, Prisma, TypeORM, Sequelize, Mongoose, KafkaJS extraction.
- `apps/specforge-cli/internal/extractors/python.go`: FastAPI, Django/DRF, Flask, SQLAlchemy, Django ORM, Celery extraction.
- `apps/specforge-cli/internal/extractors/golang.go`: `net/http`, Gin, Echo, GORM, and sqlc extraction.
- `apps/specforge-cli/internal/extractors/supporting.go`: deployment, configuration, test, observability, and authored-document extraction.
- `apps/specforge-cli/internal/extractors/registry.go`: static first-party registry and deterministic deduplication.
- `apps/specforge-cli/internal/extractors/golden_test.go`: framework Golden Repository conformance.
- `fixtures/scanner/`: minimal safe Golden Repositories and expected observation files.

### MCP Session, Semantics, And Review

- `apps/mcp-server/src/scanner/session.ts`: resolve effective governance, freeze policy/catalog digests, and return the descriptor.
- `apps/mcp-server/src/scanner/session.test.ts`: exact-Scope authorization and policy receipt tests.
- `apps/mcp-server/src/scanner/batch-persistence.ts`: persist capability-aware observations and checkpoints.
- `apps/mcp-server/src/scanner/finalization.ts`: validate capability completeness and close the scan session.
- `apps/mcp-server/src/scanner/finalization.test.ts`: blocker and accepted-state tests.
- `packages/core/src/knowledge/semantic-candidates.ts`: full-asset candidate Schema and bilingual/evidence invariants.
- `packages/core/src/knowledge/semantic-candidates.test.ts`: all-asset and multi-evidence tests.
- `apps/mcp-server/src/knowledge/semantic-persistence.ts`: persist bounded candidate batches pinned to prompt/policy versions.
- `apps/mcp-server/src/knowledge/risk-policy.ts`: server-owned T0-T3 classification and separation-of-duties enforcement.
- `apps/mcp-server/src/knowledge/review-bundle.ts`: group candidates by risk, domain, and evidence cluster.
- `apps/mcp-server/src/knowledge/review-bundle.test.ts`: review boundaries and blocker tests.
- `apps/mcp-server/src/tools.ts`: MCP tools for governance resolution, finalization, report reading, and remediation.
- `apps/mcp-server/src/tools.test.ts`: public tool metadata, permissions, and routing.

### Portable Skill And Operations

- `skills/specforge-repository-scan/SKILL.md`: portable provider-neutral `scan` and `explain-report` workflow.
- `skills/specforge-repository-scan/references/asset-coverage.md`: concise asset/evidence/capability reference loaded only when needed.
- `skills/specforge-repository-scan/references/blockers.md`: reason-code remediation matrix.
- `skills/specforge-repository-scan/scripts/verify-input.mjs`: local path and explicit-Scope input validation without network or database access.
- `skills/specforge-repository-scan/scripts/verify-input.test.mjs`: portable validation tests.
- `docs/agent-integration/repository-scan-skill.md`: installation and usage for Codex, Claude Code, and OpenCode.
- `README.md`: link to the Skill and state security/promotion boundaries.
- `docs/evidence/governed-full-asset-repository-scan.md`: exact verification commands and outcomes.
- `docs/design-facts/baseline-manifest.json`: repository record for ADR/Proposal/Context Pack and typed links.

---

### Task 1: Add Immutable System Governance Records

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated-timestamp>_system_scan_governance/migration.sql`
- Create: `packages/core/src/scanner/governance.ts`
- Create: `packages/core/src/scanner/governance.test.ts`
- Modify: `packages/core/src/scanner/index.ts`

**Interfaces:**
- Produces `SystemScanGovernanceKind`, `SystemScanGovernanceRecord`, `ScopeScanRuntimeOverlay`, `EffectiveScanGovernance`, `governanceRecordDigest(record)`, and `resolveEffectiveScanGovernance(records, overlay)`.
- The database produces immutable `SystemScanGovernanceRecord` rows keyed by `(kind, version)` and exact-Scope `ScopeScanRuntimeProfile` rows keyed by `(applicationServiceId, scopePath, id)`.

- [ ] **Step 1: Open the exact-Scope implementation session**

Run:

```powershell
pnpm design-context:preflight -- --intent "Implement system-owned full-asset repository scan governance" --affected "adr-system-owned-full-asset-repository-discovery,proposal-system-owned-full-asset-repository-discovery,context-pack-system-owned-full-asset-repository-discovery" --evidence "plan=docs/superpowers/plans/2026-09-17-governed-full-asset-repository-scan-skill.md"
```

Expected: one `DesignChangeSession` receipt whose `architectureScope.applicationServiceId` is `com.specforge.designcenter`; save its ID in the implementation notes and reuse it through Task 13.

- [ ] **Step 2: Write failing governance resolution tests**

```ts
import { describe, expect, it } from "vitest";
import { governanceRecordDigest, resolveEffectiveScanGovernance } from "./governance";

describe("system scan governance", () => {
  it("allows a Scope overlay to tighten but not weaken system policy", () => {
    const effective = resolveEffectiveScanGovernance(systemRecords(), {
      id: "strict-designer",
      architectureScope: designerScope,
      includePaths: ["apps/**"],
      excludePaths: [],
      frameworkHints: ["nestjs"],
      sensitivePaths: ["deploy/secrets/**"],
      budgets: { maxObservationsPerSession: 50_000 },
      minimumReviewTier: "T2"
    });
    expect(effective.budgets.maxObservationsPerSession).toBe(50_000);
    expect(effective.minimumReviewTier).toBe("T2");
    expect(effective.systemDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an overlay field that attempts to redefine governance", () => {
    expect(() => resolveEffectiveScanGovernance(systemRecords(), {
      id: "invalid",
      architectureScope: designerScope,
      riskPolicy: { T2: "T0" }
    } as never)).toThrow("SCOPE_SCAN_GOVERNANCE_OVERRIDE_FORBIDDEN");
  });

  it("digests canonical payloads independent of object key order", () => {
    expect(governanceRecordDigest(record({ a: 1, b: 2 }))).toBe(governanceRecordDigest(record({ b: 2, a: 1 })));
  });
});
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `pnpm --filter @specforge/core exec vitest run src/scanner/governance.test.ts`

Expected: FAIL because `scanner/governance.ts` does not exist.

- [ ] **Step 4: Implement the system and overlay contracts**

```ts
export type SystemScanGovernanceKind =
  | "SCANNER_GOVERNANCE_PROFILE"
  | "ASSET_INFERENCE_POLICY"
  | "RISK_CLASSIFICATION_POLICY"
  | "PROMOTION_POLICY"
  | "EXTRACTOR_CATALOG"
  | "SEMANTIC_PROMPT_PACK";

export interface SystemScanGovernanceRecord {
  id: string;
  kind: SystemScanGovernanceKind;
  version: string;
  payload: Record<string, unknown>;
  contentDigest: string;
  signature: string;
  keyId: string;
  status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
  publishedAt: string;
}

export interface ScopeScanRuntimeOverlay {
  id: string;
  architectureScope: ArchitectureScopeRef;
  includePaths: string[];
  excludePaths: string[];
  frameworkHints: string[];
  sensitivePaths: string[];
  budgets: Partial<ScanLimits>;
  minimumReviewTier?: ReviewRiskTier;
}
```

Implement canonical JSON digesting, require exactly one active record per governance kind, clamp every requested budget to the system maximum, and reject unknown overlay keys before computing `overlayDigest` and `effectiveDigest`.

- [ ] **Step 5: Add the Prisma records**

```prisma
model SystemScanGovernanceRecord {
  dbId          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id            String
  kind          String
  version       String
  payload       Json     @db.JsonB
  contentDigest String
  signature     String
  keyId         String
  status        String
  publishedAt   DateTime
  createdAt     DateTime @default(now())

  @@unique([kind, version], map: "SystemScanGovernanceRecord_kind_version_key")
  @@unique([kind, contentDigest], map: "SystemScanGovernanceRecord_kind_digest_key")
  @@index([kind, status, publishedAt], map: "SystemScanGovernanceRecord_active_idx")
}

model ScopeScanRuntimeProfile {
  dbId                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id                   String
  applicationServiceId String
  scopePath             String
  payload               Json     @db.JsonB
  contentDigest         String
  status                String
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([applicationServiceId, scopePath, id], map: "ScopeScanRuntimeProfile_scope_id_key")
  @@index([applicationServiceId, scopePath, status], map: "ScopeScanRuntimeProfile_scope_status_idx")
}
```

- [ ] **Step 6: Generate the migration and rerun tests**

Run:

```powershell
pnpm db:generate
pnpm --filter @specforge/core exec vitest run src/scanner/governance.test.ts
```

Expected: Prisma Client generation succeeds and the focused governance tests PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma packages/core/src/scanner
git commit -m "feat: define system scan governance records"
```

### Task 2: Persist And Bootstrap The Governance Bundle

**Files:**
- Create: `apps/mcp-server/src/scanner/governance-persistence.ts`
- Create: `apps/mcp-server/src/scanner/governance-persistence.integration.test.ts`
- Create: `apps/mcp-server/src/scanner/governance-bootstrap.ts`
- Modify: `apps/mcp-server/src/seed.ts`

**Interfaces:**
- Consumes `SystemScanGovernanceRecord` and `ScopeScanRuntimeOverlay` from Task 1.
- Produces `publishSystemScanGovernanceRecord(input)`, `loadActiveSystemScanGovernance()`, `upsertScopeScanRuntimeProfile(input)`, and `resolvePersistedEffectiveScanGovernance(scope, profileId)`.

- [ ] **Step 1: Write failing persistence tests**

```ts
it("publishes an immutable version and rejects payload mutation", async () => {
  const first = await publishSystemScanGovernanceRecord(governanceInput("EXTRACTOR_CATALOG", "1.0.0"));
  const retry = await publishSystemScanGovernanceRecord(governanceInput("EXTRACTOR_CATALOG", "1.0.0"));
  expect(retry.contentDigest).toBe(first.contentDigest);
  await expect(publishSystemScanGovernanceRecord({
    ...governanceInput("EXTRACTOR_CATALOG", "1.0.0"),
    payload: { extractors: [] }
  })).rejects.toThrow("SYSTEM_SCAN_GOVERNANCE_VERSION_CONFLICT");
});

it("keeps runtime overlays in their exact Scope", async () => {
  await upsertScopeScanRuntimeProfile(profileInput(designerScope));
  await expect(resolvePersistedEffectiveScanGovernance(otherScope, "strict-designer"))
    .rejects.toThrow("SCOPE_SCAN_RUNTIME_PROFILE_NOT_FOUND");
});
```

- [ ] **Step 2: Run the integration test and confirm failure**

Run: `pnpm exec vitest run apps/mcp-server/src/scanner/governance-persistence.integration.test.ts`

Expected: FAIL because the persistence module does not exist.

- [ ] **Step 3: Implement transactional immutable publication**

Use `Serializable` transactions and an advisory lock keyed by `system-scan-governance:<kind>`. An identical retry returns the existing row; a changed payload for the same `(kind, version)` throws `SYSTEM_SCAN_GOVERNANCE_VERSION_CONFLICT`; a revoked version is never reactivated.

```ts
export async function publishSystemScanGovernanceRecord(
  input: PublishSystemScanGovernanceInput
): Promise<SystemScanGovernanceRecord> {
  validateGovernanceSignature(input);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `system-scan-governance:${input.kind}`);
    return insertImmutableGovernanceVersion(tx, input);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

- [ ] **Step 4: Bootstrap all six records idempotently**

`governance-bootstrap.ts` must publish exact versioned payloads for:

```ts
const requiredKinds: SystemScanGovernanceKind[] = [
  "SCANNER_GOVERNANCE_PROFILE",
  "ASSET_INFERENCE_POLICY",
  "RISK_CLASSIFICATION_POLICY",
  "PROMOTION_POLICY",
  "EXTRACTOR_CATALOG",
  "SEMANTIC_PROMPT_PACK"
];
```

The production bundle must define all SpecForge asset families, T0-T3 boundaries, bilingual requirements, 100,000-observation session capacity, batch limits, trust roots, and the initial framework matrix from the approved specification.

- [ ] **Step 5: Run persistence and seed tests**

Run:

```powershell
pnpm exec vitest run apps/mcp-server/src/scanner/governance-persistence.integration.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mcp-server/src/scanner prisma
git commit -m "feat: persist system scan governance"
```

### Task 3: Extend The Shared Scan Contract

**Files:**
- Modify: `packages/scan-contract/schema/scan-contract-v2.schema.json`
- Modify: `scripts/generate-scan-contract.ts`
- Modify: `packages/scan-contract/src/generated.ts`
- Modify: `apps/specforge-cli/internal/scancontract/generated.go`
- Modify: `packages/scan-contract/fixtures/valid-session.json`
- Modify: `packages/scan-contract/fixtures/valid-batch.json`
- Modify: `packages/scan-contract/src/contract.test.ts`
- Modify: `apps/specforge-cli/internal/scancontract/contract_test.go`

**Interfaces:**
- Produces `TechnologyProfile`, `TechnologyDetection`, `AssetCapability`, `CapabilityCoverageState`, `AssetCoveragePlan`, `ScanPolicyReceipt`, and extended `ScanSessionDescriptor`/`ScanFinalization` types in TypeScript and Go.
- Coverage states are exactly `FULL`, `PARTIAL`, `DISCOVERY_ONLY`, `SEMANTIC_REVIEW_REQUIRED`, `UNSUPPORTED`, and `NOT_APPLICABLE`.

- [ ] **Step 1: Add failing fixture assertions**

```ts
const session = validateScanSessionDescriptor(validSession);
expect(session.policyReceipt.extractorCatalogDigest).toMatch(/^[a-f0-9]{64}$/);
expect(session.coveragePlan.capabilities).toContainEqual(expect.objectContaining({
  assetFamily: "api",
  state: "FULL"
}));
expect(session.technologyProfile.detections[0]).toMatchObject({
  ecosystem: "typescript",
  framework: "nestjs"
});
```

Add the equivalent Go assertions to `contract_test.go` and assert byte-identical canonical digests from the shared fixture.

- [ ] **Step 2: Run both contract suites and confirm failure**

Run:

```powershell
pnpm --filter @specforge/scan-contract test
Push-Location apps/specforge-cli; go test ./internal/scancontract; Pop-Location
```

Expected: both suites FAIL on missing policy, technology, or capability fields.

- [ ] **Step 3: Add the JSON Schema definitions**

```json
{
  "CapabilityCoverageState": {
    "type": "string",
    "enum": ["FULL", "PARTIAL", "DISCOVERY_ONLY", "SEMANTIC_REVIEW_REQUIRED", "UNSUPPORTED", "NOT_APPLICABLE"]
  },
  "ScanPolicyReceipt": {
    "type": "object",
    "additionalProperties": false,
    "required": ["systemGovernanceDigest", "extractorCatalogDigest", "semanticPromptPackDigest", "scopeRuntimeProfileDigest", "effectivePolicyDigest"],
    "properties": {
      "systemGovernanceDigest": { "$ref": "#/$defs/Sha256" },
      "extractorCatalogDigest": { "$ref": "#/$defs/Sha256" },
      "semanticPromptPackDigest": { "$ref": "#/$defs/Sha256" },
      "scopeRuntimeProfileDigest": { "$ref": "#/$defs/Sha256" },
      "effectivePolicyDigest": { "$ref": "#/$defs/Sha256" }
    }
  }
}
```

Add bounded arrays, explicit `additionalProperties: false`, evidence references for each technology detection, and reason codes for every capability result.

- [ ] **Step 4: Regenerate TypeScript and Go bindings**

Run: `pnpm scanner-contract:generate`

Expected: only the two generated bindings and contract fixture-derived snapshots change.

- [ ] **Step 5: Run contract check and tests**

Run:

```powershell
pnpm scanner-contract:check
pnpm --filter @specforge/scan-contract test
Push-Location apps/specforge-cli; go test ./internal/scancontract; Pop-Location
```

Expected: generation check and both suites PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scan-contract apps/specforge-cli/internal/scancontract scripts/generate-scan-contract.ts
git commit -m "feat: extend full asset scan contract"
```

### Task 4: Pin Governance Into Exact-Scope Scan Sessions

**Files:**
- Modify: `apps/mcp-server/src/scanner/session.ts`
- Modify: `apps/mcp-server/src/scanner/session.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`

**Interfaces:**
- Consumes `resolvePersistedEffectiveScanGovernance(scope, profileId)` from Task 2.
- Produces `resolve_scan_governance`, an extended `open_knowledge_scan_session`, and a session descriptor containing immutable policy/catalog/prompt digests.

- [ ] **Step 1: Add exact-Scope and tamper tests**

```ts
it("pins effective governance to the authorized scan Scope", async () => {
  const receipt = await openKnowledgeScanSession({
    architectureScope: designerScope,
    designChangeSessionId: "design-session-1",
    connectorId: "local-repository",
    scannerReleaseId: "scanner-release-1",
    runtimeProfileId: "strict-designer",
    snapshotIdentity
  });
  expect(receipt.descriptor.architectureScope).toEqual(designerScope);
  expect(receipt.descriptor.policyReceipt.effectivePolicyDigest).toMatch(/^[a-f0-9]{64}$/);
});

it("rejects a sibling Scope runtime profile", async () => {
  await expect(openKnowledgeScanSession({ ...input, architectureScope: siblingScope }))
    .rejects.toThrow("SCOPE_SCAN_RUNTIME_PROFILE_NOT_FOUND");
});
```

- [ ] **Step 2: Run focused MCP tests and confirm failure**

Run: `pnpm exec vitest run apps/mcp-server/src/scanner/session.test.ts apps/mcp-server/src/tools.test.ts`

Expected: FAIL because the tool and descriptor fields are absent.

- [ ] **Step 3: Resolve and freeze the effective policy**

At session creation, resolve authorization first, load all active system records, load the exact-Scope runtime profile, verify release/catalog compatibility, and persist the full policy receipt plus immutable input digests in `repositoryPolicy`, `evidencePolicy`, and `parserPolicy`. Return only bounded policy data needed by the local scanner.

```ts
const effective = await resolvePersistedEffectiveScanGovernance(scope, input.runtimeProfileId);
assertReleaseCatalogCompatibility(release, effective.extractorCatalog);
const descriptor = scanSessionDescriptor({
  session,
  architectureScope: scope,
  policyReceipt: effective.receipt,
  limits: effective.limits
});
```

- [ ] **Step 4: Register MCP metadata and permissions**

`resolve_scan_governance` requires `asset:read`, `knowledge:write`, and `governance:run`; it is a write-intent preflight because it returns a nonce-bound descriptor. Never expose signing private keys or unbounded policy payloads.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm exec vitest run apps/mcp-server/src/scanner/session.test.ts apps/mcp-server/src/tools.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: tests PASS, including exact-Scope denial and tampered policy-digest rejection.

- [ ] **Step 6: Commit**

```bash
git add apps/mcp-server/src/scanner/session.ts apps/mcp-server/src/scanner/session.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts
git commit -m "feat: pin scan governance to sessions"
```

### Task 5: Detect Technology And Plan Asset Coverage

**Files:**
- Create: `apps/specforge-cli/internal/technology/profile.go`
- Create: `apps/specforge-cli/internal/technology/profile_test.go`
- Create: `apps/specforge-cli/internal/extractors/catalog.go`
- Create: `apps/specforge-cli/internal/extractors/catalog_test.go`
- Modify: `apps/specforge-cli/internal/extractors/registry.go`

**Interfaces:**
- Produces `technology.Detect(inventory, readFile, hints) (scancontract.TechnologyProfile, error)`.
- Produces `extractors.LoadCatalog(descriptor)`, `Catalog.Verify(trustStore)`, and `Catalog.Plan(profile) scancontract.AssetCoveragePlan`.
- Consumes only inventory metadata and bounded manifest/config contents; hints can add a conflict but cannot override contradictory evidence.

- [ ] **Step 1: Write failing detection tests**

```go
func TestDetectsNestAndPrismaWithEvidence(t *testing.T) {
	profile, err := Detect(inventory(
		file("package.json", `{"dependencies":{"@nestjs/core":"10.4.0","@prisma/client":"6.1.0"}}`),
		file("prisma/schema.prisma", "model Order { id String @id }") ,
	), readFixture, nil)
	require.NoError(t, err)
	requireDetection(t, profile, "typescript", "nestjs", "10.4.0")
	requireDetection(t, profile, "typescript", "prisma", "6.1.0")
}

func TestConflictingHintIsReportedNotForced(t *testing.T) {
	profile, err := Detect(inventory(file("go.mod", "module example\nrequire github.com/gin-gonic/gin v1.10.0")), readFixture, []string{"echo"})
	require.NoError(t, err)
	require.Contains(t, profile.Conflicts, "FRAMEWORK_HINT_CONTRADICTS_EVIDENCE:echo")
}
```

- [ ] **Step 2: Run focused Go tests and confirm failure**

Run: `Push-Location apps/specforge-cli; go test ./internal/technology ./internal/extractors; Pop-Location`

Expected: FAIL because technology detection and catalog planning do not exist.

- [ ] **Step 3: Implement deterministic detectors**

Detect from exact dependency coordinates, lock files, imports, annotations, configuration keys, and conventional contract directories. Every detection contains `ecosystem`, `framework`, `versionRange`, `confidence`, `evidenceRefs`, and `conflicts`; sort detections and evidence before digesting.

```go
type detectorRule struct {
	Ecosystem string
	Framework string
	ManifestCoordinates []string
	ImportPrefixes []string
	ConfigMarkers []string
}
```

- [ ] **Step 4: Implement catalog verification and coverage planning**

Reject unknown extractor IDs, invalid signatures, incompatible contract versions, duplicate capabilities, expired descriptors, and detected required capabilities with no trusted extractor. The planner must emit one result for every SpecForge asset family, including `NOT_APPLICABLE` with evidence.

- [ ] **Step 5: Run focused tests**

Run: `Push-Location apps/specforge-cli; go test ./internal/technology ./internal/extractors; Pop-Location`

Expected: PASS for detection, conflict reporting, trust verification, and full asset-family coverage.

- [ ] **Step 6: Commit**

```bash
git add apps/specforge-cli/internal/technology apps/specforge-cli/internal/extractors
git commit -m "feat: detect repository technology capabilities"
```

### Task 6: Complete Language-Neutral And Operational Extractors

**Files:**
- Modify: `apps/specforge-cli/internal/extractors/contracts.go`
- Modify: `apps/specforge-cli/internal/extractors/schema.go`
- Modify: `apps/specforge-cli/internal/extractors/supporting.go`
- Modify: `apps/specforge-cli/internal/extractors/golden_test.go`
- Create: `fixtures/scanner/contracts/`
- Create: `fixtures/scanner/operations/`

**Interfaces:**
- Extends deterministic observations for OpenAPI, AsyncAPI, GraphQL SDL, Protobuf/gRPC, SQL DDL/migrations, Docker Compose, Kubernetes, Helm, CI, tests, Prometheus, OpenTelemetry, structured logging, alerts, ADRs, Proposals, and Context Packs.
- Produces technical observations only; authored ADR/Proposal/Context Pack status is imported exactly as written and never inferred as approved.

- [ ] **Step 1: Add Golden Repository cases**

```go
func TestLanguageNeutralGoldenRepositories(t *testing.T) {
	cases := []goldenCase{
		{name: "openapi", expectedTypes: []string{"API_OPERATION", "API_SCHEMA", "API_SECURITY"}},
		{name: "asyncapi", expectedTypes: []string{"EVENT_CHANNEL_OPERATION", "EVENT_SCHEMA"}},
		{name: "graphql", expectedTypes: []string{"GRAPHQL_OPERATION", "DATA_ENTITY"}},
		{name: "protobuf", expectedTypes: []string{"RPC_SERVICE", "RPC_METHOD", "DATA_ENTITY"}},
		{name: "sql", expectedTypes: []string{"DATA_ENTITY", "DATA_FIELD", "DATA_RELATIONSHIP"}},
		{name: "operations", expectedTypes: []string{"DEPLOYMENT_COMPONENT", "OBSERVABILITY_SIGNAL", "QUALITY_EVIDENCE"}},
	}
	runGoldenCases(t, cases)
}
```

- [ ] **Step 2: Run the Golden suite and confirm failure**

Run: `Push-Location apps/specforge-cli; go test ./internal/extractors -run 'TestLanguageNeutralGoldenRepositories'; Pop-Location`

Expected: FAIL with missing observation types.

- [ ] **Step 3: Implement parsers without executing repository code**

Use safe tokenization and `yaml.v3`; parse GraphQL and Protobuf declarations with bounded internal parsers; parse SQL `CREATE TABLE`, keys, constraints, and references from migrations. Every observation includes line-level source, parser ID/version, redaction result, and normalized digest.

- [ ] **Step 4: Extract authored design documents conservatively**

Require recognizable metadata and preserve declared status:

```go
type authoredRecord struct {
	Kind string
	ID string
	Status string
	Title string
	CanonicalEnglish string
	LocalizedChinese string
}
```

Plain prose without an explicit record kind remains evidence for semantic analysis, not an imported ADR or Proposal.

- [ ] **Step 5: Run Golden and security tests**

Run: `Push-Location apps/specforge-cli; go test ./internal/extractors ./internal/scanner; Pop-Location`

Expected: PASS with stable Golden outputs and no source execution.

- [ ] **Step 6: Commit**

```bash
git add apps/specforge-cli/internal/extractors fixtures/scanner/contracts fixtures/scanner/operations
git commit -m "feat: extract neutral and operational design evidence"
```

### Task 7: Complete Framework-Aware JVM And TypeScript Extraction

**Files:**
- Modify: `apps/specforge-cli/internal/extractors/java.go`
- Modify: `apps/specforge-cli/internal/extractors/typescript.go`
- Modify: `apps/specforge-cli/internal/extractors/golden_test.go`
- Create: `fixtures/scanner/java-spring/`
- Create: `fixtures/scanner/typescript-nest/`

**Interfaces:**
- Java/Kotlin supports Spring MVC/WebFlux, JPA/Hibernate, MyBatis, Kafka, and RabbitMQ.
- TypeScript/JavaScript supports NestJS, Express, Fastify, Prisma, TypeORM, Sequelize, Mongoose, and KafkaJS.
- Produces API, data model, event, validation, transaction, auth-hint, dependency, and relationship observations with framework-specific semantic identities.

- [ ] **Step 1: Add framework semantic tests**

```go
func TestSpringAndNestGoldenRepositories(t *testing.T) {
	runGoldenCases(t, []goldenCase{
		{name: "java-spring", expectedPayloads: []payloadExpectation{
			{Type: "API_OPERATION", Fields: map[string]any{"method": "POST", "path": "/orders"}},
			{Type: "DATA_RELATIONSHIP", Fields: map[string]any{"cardinality": "MANY_TO_ONE"}},
			{Type: "EVENT_CONSUMER", Fields: map[string]any{"broker": "kafka"}},
		}},
		{name: "typescript-nest", expectedPayloads: []payloadExpectation{
			{Type: "API_OPERATION", Fields: map[string]any{"framework": "nestjs"}},
			{Type: "DATA_ENTITY", Fields: map[string]any{"framework": "prisma"}},
			{Type: "EVENT_PRODUCER", Fields: map[string]any{"framework": "kafkajs"}},
		}},
	})
}
```

- [ ] **Step 2: Run the framework tests and confirm failure**

Run: `Push-Location apps/specforge-cli; go test ./internal/extractors -run 'TestSpringAndNestGoldenRepositories'; Pop-Location`

Expected: FAIL on missing framework payload semantics.

- [ ] **Step 3: Implement JVM extraction**

Correlate class/method annotations, request mappings, entity annotations, mapper statements, listener/send calls, transaction annotations, validation constraints, and type references. Do not infer business meaning from class names alone.

- [ ] **Step 4: Implement TypeScript extraction**

Correlate decorators and router calls with ORM Schemas, broker calls, middleware/guard hints, DTO validation, and imports. Preserve dynamic routes or unresolved symbols as bounded `PARTIAL` observations with reason codes.

- [ ] **Step 5: Run Golden and regression tests**

Run: `Push-Location apps/specforge-cli; go test ./internal/extractors; Pop-Location`

Expected: PASS and existing extractor snapshots remain deterministic.

- [ ] **Step 6: Commit**

```bash
git add apps/specforge-cli/internal/extractors fixtures/scanner/java-spring fixtures/scanner/typescript-nest
git commit -m "feat: extract JVM and TypeScript frameworks"
```

### Task 8: Add Python And Complete Go Framework Extraction

**Files:**
- Create: `apps/specforge-cli/internal/extractors/python.go`
- Modify: `apps/specforge-cli/internal/extractors/golang.go`
- Modify: `apps/specforge-cli/internal/extractors/registry.go`
- Modify: `apps/specforge-cli/internal/extractors/golden_test.go`
- Create: `fixtures/scanner/python-fastapi/`
- Create: `fixtures/scanner/go-gin/`

**Interfaces:**
- Python supports FastAPI, Django/DRF, Flask, SQLAlchemy, Django ORM, and Celery.
- Go supports `net/http`, Gin, Echo, GORM, and sqlc.
- Both emit the same normalized observation vocabulary used by Tasks 6-7.

- [ ] **Step 1: Add Python and Go Golden tests**

```go
func TestPythonAndGoGoldenRepositories(t *testing.T) {
	runGoldenCases(t, []goldenCase{
		{name: "python-fastapi", expectedTypes: []string{"API_OPERATION", "DATA_ENTITY", "BUSINESS_VALIDATION", "ASYNC_TASK"}},
		{name: "go-gin", expectedTypes: []string{"API_OPERATION", "DATA_ENTITY", "SQL_QUERY", "SERVICE_DEPENDENCY"}},
	})
}
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `Push-Location apps/specforge-cli; go test ./internal/extractors -run 'TestPythonAndGoGoldenRepositories'; Pop-Location`

Expected: FAIL because Python extraction is absent and Go framework coverage is incomplete.

- [ ] **Step 3: Implement bounded Python parsing**

Parse decorators, class declarations, field assignments, validators, ORM declarations, task decorators, and imports with a deterministic lexical parser. Mark dynamic metaprogramming as `SEMANTIC_REVIEW_REQUIRED`; do not import or execute Python modules.

- [ ] **Step 4: Complete Go parsing**

Correlate router registrations, handlers, structs/tags, GORM relations, sqlc query metadata, outbound HTTP clients, and message client calls. Preserve unresolved call targets as partial observations.

- [ ] **Step 5: Run all CLI tests**

Run: `Push-Location apps/specforge-cli; go test ./...; Pop-Location`

Expected: all Go tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/specforge-cli/internal/extractors fixtures/scanner/python-fastapi fixtures/scanner/go-gin
git commit -m "feat: extract Python and Go frameworks"
```

### Task 9: Enforce Capability-Aware Finalization And Resume

**Files:**
- Modify: `apps/specforge-cli/scan_command.go`
- Modify: `apps/specforge-cli/scan_command_test.go`
- Modify: `apps/specforge-cli/internal/spool/store.go`
- Modify: `apps/specforge-cli/internal/spool/store_test.go`
- Create: `apps/mcp-server/src/scanner/finalization.ts`
- Create: `apps/mcp-server/src/scanner/finalization.test.ts`
- Modify: `apps/mcp-server/src/scanner/batch-persistence.ts`

**Interfaces:**
- The CLI computes technology and capability plans before extraction and persists both in the spool finalization.
- MCP produces `finalizeKnowledgeScan(input): KnowledgeScanFinalizationReceipt` with status `READY`, `BLOCKED`, or `STALE` and stable blocker reason codes.
- Resume accepts only the same session, snapshot, effective-policy digest, catalog digest, and batch digest chain.

- [ ] **Step 1: Write failing finalization tests**

```ts
it("blocks a detected required capability without a trusted extractor", async () => {
  const receipt = await finalizeKnowledgeScan(finalization({
    capabilities: [{ framework: "nestjs", assetFamily: "api", state: "UNSUPPORTED", required: true, reasonCodes: ["REQUIRED_EXTRACTOR_MISSING"] }]
  }));
  expect(receipt.status).toBe("BLOCKED");
  expect(receipt.blockingIssues).toEqual(["REQUIRED_EXTRACTOR_MISSING:nestjs:api"]);
});

it("does not block a proven non-applicable family", async () => {
  const receipt = await finalizeKnowledgeScan(finalization({
    capabilities: [{ framework: "repository", assetFamily: "event", state: "NOT_APPLICABLE", required: false, reasonCodes: ["NO_MESSAGING_EVIDENCE"] }]
  }));
  expect(receipt.status).toBe("READY");
});
```

- [ ] **Step 2: Run CLI and MCP tests and confirm failure**

Run:

```powershell
Push-Location apps/specforge-cli; go test ./internal/spool .; Pop-Location
pnpm exec vitest run apps/mcp-server/src/scanner/finalization.test.ts
```

Expected: FAIL because capability-aware finalization is absent.

- [ ] **Step 3: Update the CLI scan lifecycle**

Call technology detection and coverage planning immediately after the stable inventory is created. Write checkpoint metadata before extraction, append ordered batches, verify the dirty snapshot, and write finalization only after every planned extractor reports a terminal state.

- [ ] **Step 4: Enforce server finalization**

Verify batch count, observation count, snapshot/manifest/final-batch digests, policy receipt, complete asset-family matrix, and candidate readiness. A failed check marks the session `BLOCKED` or `STALE`; it never changes accepted assets, active Baseline, formal dashboard counts, or relationship graph.

- [ ] **Step 5: Test interrupted and identical resume**

Add tests that stop after batch 2, resume at batch 3, retry batch 2 idempotently, and reject changed snapshots or policy digests with `SCAN_RESUME_CONTEXT_MISMATCH`.

- [ ] **Step 6: Run focused lifecycle tests**

Run:

```powershell
Push-Location apps/specforge-cli; go test ./internal/spool .; Pop-Location
pnpm exec vitest run apps/mcp-server/src/scanner/finalization.test.ts apps/mcp-server/src/scanner/batch-persistence.test.ts
```

Expected: PASS for ready, blocked, stale, interruption, identical retry, and mismatch rejection.

- [ ] **Step 7: Commit**

```bash
git add apps/specforge-cli apps/mcp-server/src/scanner
git commit -m "feat: finalize governed capability scans"
```

### Task 10: Govern Full-Asset Semantic Candidates

**Files:**
- Create: `packages/core/src/knowledge/semantic-candidates.ts`
- Create: `packages/core/src/knowledge/semantic-candidates.test.ts`
- Modify: `packages/core/src/knowledge/index.ts`
- Modify: `apps/mcp-server/src/knowledge/semantic-persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/candidate-persistence.test.ts`
- Modify: `apps/mcp-server/src/knowledge/risk-policy.ts`
- Modify: `apps/mcp-server/src/knowledge/risk-policy.test.ts`
- Create: `apps/mcp-server/src/knowledge/review-bundle.ts`
- Create: `apps/mcp-server/src/knowledge/review-bundle.test.ts`

**Interfaces:**
- Produces `FullAssetFamily`, `SemanticEvidenceCluster`, `FullAssetSemanticCandidate`, `validateSemanticEvidenceCluster`, and `validateFullAssetSemanticCandidate`.
- Extends `submit_semantic_candidate_batch` to require prompt-pack digest, policy digest, Agent/model identity when available, bounded source observation IDs, counter-evidence, unresolved questions, identity decision, and bilingual content.
- Produces deterministic server-owned risk classification and risk-homogeneous ReviewBundles.

- [ ] **Step 1: Write all-asset invariant tests**

```ts
it.each([
  "domain", "dataModel", "api", "event", "businessRule", "stateMachine",
  "integration", "quality", "observability", "serviceFeature", "functionalFeature",
  "adr", "proposal", "contextPack", "evidence", "typedRelationship"
] as const)("validates %s candidates", (assetFamily) => {
  expect(validateFullAssetSemanticCandidate(validCandidate(assetFamily))).toEqual(validCandidate(assetFamily));
});

it("rejects high-impact semantics supported only by a name", () => {
  expect(() => validateFullAssetSemanticCandidate(validCandidate("businessRule", {
    matchingEvidence: ["class-name:RefundPolicy"],
    evidenceTypes: ["symbol-name"]
  }))).toThrow("SEMANTIC_MULTI_EVIDENCE_REQUIRED");
});

it("rejects human-facing content without English and Chinese", () => {
  expect(() => validateFullAssetSemanticCandidate(validCandidate("serviceFeature", {
    canonicalContent: { summary: "Create an order" },
    localizedContent: {}
  }))).toThrow("CANDIDATE_BILINGUAL_CONTENT_MISSING");
});
```

- [ ] **Step 2: Run core semantic tests and confirm failure**

Run: `pnpm --filter @specforge/core exec vitest run src/knowledge/semantic-candidates.test.ts`

Expected: FAIL because the full-asset semantic contract is absent.

- [ ] **Step 3: Implement evidence clusters and candidate validation**

```ts
export interface SemanticEvidenceCluster {
  id: string;
  architectureScope: ArchitectureScopeRef;
  domainHint?: string;
  observationIds: string[];
  evidenceTypes: string[];
  tokenEstimate: number;
  clusterDigest: string;
}

export interface FullAssetSemanticCandidate extends SemanticCandidateSubmission {
  assetFamily: FullAssetFamily;
  promptPackDigest: string;
  policyDigest: string;
  clusterId: string;
  canonicalContent: Record<string, unknown>;
  localizedContent: { zh: Record<string, unknown> };
}
```

Enforce bounded cluster size, source membership, exact Scope, immutable digests, English canonical content, Chinese overlay, confidence in `[0,1]`, and multi-evidence rules for business rules, state transitions, public contracts, access, retention, and security semantics.

- [ ] **Step 4: Implement server-owned risk and ReviewBundle assembly**

Classify security/privacy/compliance and ambiguous identity as T3; business rules, state transitions, public contracts, retention, access, and breaking changes as at least T2; low-risk semantics as T1; only deterministic eligible technical candidates with server authorization as T0. Split bundles by exact Scope, risk tier, domain cluster, and configured batch ceiling.

- [ ] **Step 5: Run core and MCP tests**

Run:

```powershell
pnpm --filter @specforge/core exec vitest run src/knowledge/semantic-candidates.test.ts
pnpm exec vitest run apps/mcp-server/src/knowledge/candidate-persistence.test.ts apps/mcp-server/src/knowledge/risk-policy.test.ts apps/mcp-server/src/knowledge/review-bundle.test.ts
```

Expected: PASS for all asset families, evidence rules, bilingual rules, T0-T3 classification, identity blockers, and separation of duties.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/knowledge apps/mcp-server/src/knowledge
git commit -m "feat: govern full asset semantic candidates"
```

### Task 11: Expose MCP Report And Remediation Tools

**Files:**
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Create: `apps/mcp-server/src/scanner/report.ts`
- Create: `apps/mcp-server/src/scanner/report.test.ts`

**Interfaces:**
- Produces `submit_semantic_candidate_batch`, `assemble_knowledge_review_bundle`, `finalize_knowledge_scan`, `get_knowledge_scan_report`, and `explain_knowledge_scan_blockers` MCP tools.
- All reads and writes require the exact report/session Scope; report responses are bounded and redact sensitive paths/excerpts.

- [ ] **Step 1: Add public tool contract tests**

```ts
expect(tool("get_knowledge_scan_report")._meta).toEqual({
  permissions: ["asset:read", "knowledge:consume"],
  write: false
});
expect(tool("finalize_knowledge_scan")._meta).toEqual({
  permissions: ["knowledge:write", "governance:run"],
  write: true
});
```

Add routing tests for sibling-Scope denial, missing report, bounded pagination, and redacted blocker output.

- [ ] **Step 2: Run tool tests and confirm failure**

Run: `pnpm exec vitest run apps/mcp-server/src/scanner/report.test.ts apps/mcp-server/src/tools.test.ts`

Expected: FAIL because the report tools are absent.

- [ ] **Step 3: Implement bounded report assembly**

```ts
export interface KnowledgeScanReportView {
  sessionId: string;
  architectureScope: ArchitectureScopeRef;
  status: "READY" | "BLOCKED" | "STALE";
  technologyProfile: TechnologyProfile;
  coverage: AssetCoveragePlan;
  candidateCounts: Record<FullAssetFamily, number>;
  reviewBundleIds: string[];
  blockingIssues: Array<{ code: string; assetFamily?: FullAssetFamily; framework?: string }>;
  checkpoint?: { acceptedSequence: number; acceptedBatchDigest: string };
}
```

Do not return raw secrets, unrestricted source, signing keys, or cross-Scope identities.

- [ ] **Step 4: Implement stable remediation mapping**

Map every blocker from the approved specification to one actionable English/Chinese response. Preserve machine reason codes and never recommend retrying in another Scope.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/mcp-server/src/scanner/report.test.ts apps/mcp-server/src/tools.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: PASS with bounded exact-Scope reports and complete remediation mapping.

- [ ] **Step 6: Commit**

```bash
git add apps/mcp-server/src/scanner/report.ts apps/mcp-server/src/scanner/report.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts
git commit -m "feat: expose governed scan reports"
```

### Task 12: Package The Provider-Neutral Repository Scan Skill

**Files:**
- Create: `skills/specforge-repository-scan/SKILL.md`
- Create: `skills/specforge-repository-scan/references/asset-coverage.md`
- Create: `skills/specforge-repository-scan/references/blockers.md`
- Create: `skills/specforge-repository-scan/scripts/verify-input.mjs`
- Create: `skills/specforge-repository-scan/scripts/verify-input.test.mjs`
- Create: `docs/agent-integration/repository-scan-skill.md`
- Modify: `README.md`

**Interfaces:**
- Skill commands: `scan` and `explain-report`.
- Required `scan` inputs: `repositoryPath`, `applicationServiceId`, `scopePath`.
- Optional inputs: include/exclude paths, framework hints, sensitive paths, and resource budgets.
- The Skill consumes MCP tools from Tasks 4, 10, and 11 and invokes the verified Go scanner release; it contains no authoritative policy constants.

- [ ] **Step 1: Write failing portable input tests**

```js
import assert from "node:assert/strict";
import { verifyInput } from "./verify-input.mjs";

assert.throws(() => verifyInput({ repositoryPath: "." }), /SCAN_SCOPE_REQUIRED/);
assert.throws(() => verifyInput({
  repositoryPath: ".",
  applicationServiceId: "com.specforge.designcenter",
  scopePath: ""
}), /SCAN_SCOPE_PATH_REQUIRED/);
assert.equal(verifyInput({
  repositoryPath: process.cwd(),
  applicationServiceId: "com.specforge.designcenter",
  scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
}).applicationServiceId, "com.specforge.designcenter");
```

- [ ] **Step 2: Run the validation test and confirm failure**

Run: `node --test skills/specforge-repository-scan/scripts/verify-input.test.mjs`

Expected: FAIL because the Skill helper does not exist.

- [ ] **Step 3: Implement local input validation**

Use `fs.realpathSync`, require an existing directory, reject an empty or inferred Scope, normalize include/exclude paths, and reject traversal outside the repository. The helper performs no network, MCP, database, or source execution.

- [ ] **Step 4: Write the portable Skill workflow**

The `SKILL.md` sequence must be explicit:

1. Validate explicit inputs locally.
2. Call `evaluate_system_knowledge_readiness` and consume only `read_system_knowledge` for the target Scope.
3. Call `prepare_design_change` for the scan/import intent.
4. Call `resolve_scan_governance` and `open_knowledge_scan_session`.
5. Download or locate only the signed approved scanner release and verify it against the returned trust roots.
6. Run the deterministic local scanner and upload ordered batches through MCP.
7. Call `finalize_knowledge_scan` for deterministic coverage.
8. Build bounded evidence clusters and submit structured semantic candidates through MCP.
9. Assemble ReviewBundles; do not self-approve T1-T3 bundles.
10. Read and explain the final report and blocker remediation.
11. Close the design-change session as `CONVERGED` only when the report and required MCP facts are complete; otherwise close it `BLOCKED` with retry trigger.

`explain-report` must only read an authorized existing report and must not rescan, mutate candidates, approve, promote, or publish a Baseline.

- [ ] **Step 5: Document installation for three Agents**

Provide concrete folder/link configuration for Codex, Claude Code, and OpenCode; document MCP server configuration, token grants to one or more application services, explicit per-run Scope selection, scanner binary trust, and blocker remediation. Keep provider-specific UI instructions outside `SKILL.md`.

- [ ] **Step 6: Run Skill validation and repository links check**

Run:

```powershell
node --test skills/specforge-repository-scan/scripts/verify-input.test.mjs
rg -n "repository-scan-skill|specforge-repository-scan" README.md docs/agent-integration/repository-scan-skill.md skills/specforge-repository-scan/SKILL.md
```

Expected: input tests PASS and every expected documentation surface links to the Skill.

- [ ] **Step 7: Commit**

```bash
git add skills/specforge-repository-scan docs/agent-integration/repository-scan-skill.md README.md
git commit -m "feat: package repository scan skill"
```

### Task 13: Prove Security, Scale, Cross-Agent Behavior, And Governance Closure

**Files:**
- Create: `apps/mcp-server/src/scanner/full-asset-scan.e2e.test.ts`
- Create: `apps/mcp-server/src/scanner/full-asset-scan.scale.test.ts`
- Create: `fixtures/scanner/security/`
- Create: `fixtures/scanner/cross-agent/`
- Create: `docs/evidence/governed-full-asset-repository-scan.md`
- Modify: `docs/adr/0049-system-owned-full-asset-repository-discovery.md`
- Modify: `docs/design-facts/baseline-manifest.json`

**Interfaces:**
- Exercises the same MCP contract with Codex-, Claude Code-, and OpenCode-shaped callers.
- Verifies candidate-only behavior until explicit promotion, exact-Scope isolation, policy pinning, recovery, 100,000-observation throughput, and repository/MCP design-fact convergence.

- [ ] **Step 1: Add end-to-end failure and isolation tests**

```ts
it("keeps blocked scans out of accepted assets and formal dashboards", async () => {
  const before = await officialCounts(designerScope);
  const report = await runFixtureScan("security/malicious-repository", designerScope);
  expect(report.status).toBe("BLOCKED");
  expect(await officialCounts(designerScope)).toEqual(before);
  expect(await reportExists(siblingScope, report.sessionId)).toBe(false);
});

it.each(["codex", "claude-code", "opencode"])("uses the same governed contract for %s", async (driver) => {
  const report = await runAgentDriver(driver, "cross-agent/reference-service", designerScope);
  expect(report.coverage.complete).toBe(true);
  expect(report.architectureScope).toEqual(designerScope);
});
```

- [ ] **Step 2: Add the scale fixture**

Generate 100,000 deterministic in-memory observations in the test process, submit them within configured batch limits, interrupt after a known sequence, resume, and assert bounded persisted batch size, no duplicate observations, and stable final digest.

- [ ] **Step 3: Run the stage verification suite once**

Run:

```powershell
pnpm scanner-contract:check
pnpm --filter @specforge/core test
pnpm --filter @specforge/scan-contract test
Push-Location apps/specforge-cli; go test ./...; Pop-Location
pnpm exec vitest run apps/mcp-server/src/scanner apps/mcp-server/src/knowledge
pnpm typecheck
pnpm build
```

Expected: all commands exit `0`; the evidence document records exact test counts, durations, and any deliberately skipped environment-dependent tests.

- [ ] **Step 4: Run the PostgreSQL integration and scale proof**

Run:

```powershell
$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'
pnpm exec vitest run apps/mcp-server/src/scanner/full-asset-scan.e2e.test.ts apps/mcp-server/src/scanner/full-asset-scan.scale.test.ts apps/mcp-server/src/scanner/governance-persistence.integration.test.ts
```

Expected: exact-Scope persistence, immutable policy versions, cross-Agent equivalence, interruption recovery, and 100,000-observation tests PASS.

- [ ] **Step 5: Perform a real target-Scope scan without automatic promotion**

Use the packaged Skill against this repository with:

```text
repositoryPath = C:\Users\69529\OneDrive\文档\SpecForge
applicationServiceId = com.specforge.designcenter
scopePath = pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter
```

Expected: the report is persisted only in the target Scope, all asset families have a terminal capability state, candidates and ReviewBundles are visible, active Baseline and formal dashboard counts remain unchanged, and no candidate is accepted without its policy-required review.

- [ ] **Step 6: Synchronize repository design facts through MCP**

Run:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: ADR `adr-system-owned-full-asset-repository-discovery`, Proposal `proposal-system-owned-full-asset-repository-discovery`, Context Pack `context-pack-system-owned-full-asset-repository-discovery`, and their directional typed links are present in `com.specforge.designcenter`; reconciliation reports no missing, mismatched, out-of-Scope, or blocked records.

- [ ] **Step 7: Close the original implementation session**

Run:

```powershell
pnpm design-context:close -- --session $env:SPECFORGE_DESIGN_CHANGE_SESSION --status CONVERGED --evidence "scanner-contract:check=pass,core-tests=pass,go-tests=pass,mcp-tests=pass,typecheck=pass,build=pass,cross-agent=pass,scale-100000=pass,design-facts:check=converged"
```

Expected: the exact session opened in Task 1 closes as `CONVERGED`. If any required command, MCP write, or reconciliation fails, close as `BLOCKED` with the exact reason and retry trigger and do not claim completion.

- [ ] **Step 8: Commit final evidence**

```bash
git add apps/mcp-server/src/scanner fixtures/scanner docs/adr/0049-system-owned-full-asset-repository-discovery.md docs/evidence/governed-full-asset-repository-scan.md docs/design-facts/baseline-manifest.json
git commit -m "test: prove governed full asset scanning"
```

## Stage Gates

1. **Governance foundation complete:** Tasks 1-4 pass; all six system records are immutable, signed, active, and pinned into an exact-Scope session.
2. **Deterministic discovery complete:** Tasks 5-9 pass; every supported framework has Golden evidence, every asset family has a terminal coverage state, and resume/finalization is safe.
3. **Semantic governance complete:** Tasks 10-11 pass; all semantic candidates are bounded, bilingual, evidence-backed, identity-checked, risk-classified, and grouped into governed ReviewBundles.
4. **Reusable Skill complete:** Task 12 passes; Codex, Claude Code, and OpenCode can follow one portable workflow without embedding policy.
5. **Production proof complete:** Task 13 passes; exact-Scope isolation, security, 100,000-observation scale, candidate-only safety, MCP synchronization, and design-session closure are evidenced.

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover system-owned governance, Scope overlays, signed version pinning, and the shared contract. Tasks 5-9 cover technology detection, the approved framework matrix, full deterministic coverage, security, batching, and resume. Tasks 10-11 cover all SpecForge asset families, Agent semantics, bilingual content, identity, T0-T3 review, reports, and remediation. Task 12 packages the provider-neutral Skill. Task 13 covers cross-Agent behavior, security, scale, promotion boundaries, Baseline safety, evidence, and MCP convergence.
- Deferred boundaries remain deferred: continuous scanning, live database/runtime/CMDB/API-gateway connectors, hosted repository providers, outbound `APPLY`, and cross-Scope semantic merging are not implemented by this plan.
- Type consistency: policy receipts, technology profiles, capability states, evidence clusters, candidates, reports, and review tiers are defined once and consumed by later tasks using the same names.
- Placeholder scan: runtime-generated migration timestamps and design-session IDs are explicitly generated artifacts, not unspecified design work; implementation steps contain concrete behavior, commands, and expected outcomes.
