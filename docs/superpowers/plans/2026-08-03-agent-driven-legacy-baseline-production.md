# Agent-Driven Legacy Baseline Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 1 as a production-credible, exact-Scope path from an existing repository to a reviewed, transactionally promoted, immutable SpecForge Baseline v1.

**Architecture:** A server-signed release manifest and persisted Scan Session authorize a standalone Go scanner. The scanner performs deterministic static extraction locally, writes resumable hash-chained batches to a private spool, and lets an already-authorized Agent transport evidence and semantic candidates through MCP. PostgreSQL remains authoritative for sessions, observations, review, canonical assets, typed links, ChangeSets, and Baselines; no scanner or Agent receives database credentials.

**Tech Stack:** Go 1.26, TypeScript 5.7, Node 22, pnpm 9, Prisma 6, PostgreSQL, Zod 3, Vitest 2, JSON Schema 2020-12, Ed25519, RFC 8785 canonical JSON, SHA-256, Tree-sitter Go bindings and statically linked Java/TypeScript grammars.

## Global Constraints

- This plan implements only Phase 1: repository discovery through Baseline v1 publication. Phase 2 3A projections, Phase 3 PostgreSQL-to-graph production projection, Phase 4 enterprise governance, and Phase 5 deployment/capacity hardening remain separate plans.
- Do not execute Task 0 or make implementation changes until the user explicitly confirms implementation after reviewing this plan.
- The only owning Scope is `applicationServiceId=com.huawei.celon.desiner` and `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner` for SpecForge's own design facts.
- Every runtime write derives exact Scope from the persisted Scan Session; client-supplied Scope is checked for equality but never treated as authority.
- English canonical fields are mandatory. Human-facing Chinese localized overlays must be complete before promotion.
- PostgreSQL is authoritative. Graph storage is not on the authoring or Baseline publication path in this phase.
- The scanner never executes project code, build scripts, package managers, generated binaries, or dynamically discovered plugins.
- Scanner release trust uses a configured Ed25519 trust root; trust-on-first-use and unsigned fallback are forbidden.
- Batch limits are 500 observations, 4 MiB canonical JSON, 8 KiB excerpt per observation, 10 MiB maximum source file, and 100,000 observations per Scan Session.
- Full repository regression runs once after each delivery slice. Individual tasks run focused RED/GREEN tests only.
- Every task ends with a reviewable commit. Each delivery slice updates repository design records and synchronizes matching MCP facts before being described as complete.

---

## Phase Boundary

This is the first of five independent production phases:

1. **This plan:** signed scanner, resumable evidence ingestion, Agent semantic review, canonical promotion, and Baseline v1.
2. **Separate plan:** BIZ/SYS/TECH projections, alignment views, and Context Pack generation from a published Baseline.
3. **Separate plan:** PostgreSQL relationship outbox to production graph projection and operational replay.
4. **Separate plan:** CodeHub gate, production identity/token administration, multi-service comparison, and durable MCP synchronization operations.
5. **Separate plan:** distributable build pipeline, enterprise deployment profiles, capacity tests, backup/restore, and failure drills.

Phase 1 produces working software without requiring any of Phases 2-5. Graph projection may remain PostgreSQL-backed, and CodeHub integration remains a tracked governance fact.

## File Map

- Create `packages/scan-contract/`: canonical JSON Schema, checked-in generated TypeScript types, fixtures, contract validation, and drift checks.
- Create `apps/specforge-cli/internal/scancontract/`: checked-in generated Go types from the same schema.
- Create `apps/specforge-cli/internal/release/`: trust-root verification, manifest compatibility, revocation, and rollback protection.
- Create `apps/specforge-cli/internal/session/`: Scan Session descriptor and budget validation.
- Create `apps/specforge-cli/internal/spool/`: private local batch files, checkpoint state, digest chain, and resume.
- Create `apps/specforge-cli/internal/scanner/`: safe workspace traversal, snapshot identity, extraction orchestration, redaction, and coverage.
- Create `apps/specforge-cli/internal/extractors/`: static extractor registry plus repository, contract, schema, source, test, configuration, deployment, and documentation extractors.
- Modify `apps/specforge-cli/main.go`: add `scan` and `scan status` commands while preserving governance hook commands.
- Modify `packages/core/src/scanner/`: expose Scan Contract v2 types, limits, risk policy inputs, and validation.
- Modify `packages/core/src/knowledge/`: add candidate-level risk classification and review separation policy.
- Modify `prisma/schema.prisma` and create one additive migration for scanner releases, sessions, batches, candidate risk metadata, promotion receipts, and indexes.
- Create `apps/mcp-server/src/scanner/release.ts`, `session.ts`, `batch-persistence.ts`, and focused tests.
- Create `apps/mcp-server/src/knowledge/risk-policy.ts`, `candidate-persistence.ts`, `promotion.ts`, and focused tests.
- Modify `apps/mcp-server/src/tools.ts`: register the v2 Scan Session, batch, semantic candidate, promotion, and reconciliation tools.
- Create `fixtures/legacy-scan/`: deterministic Java/Spring, TypeScript/Node, Go, OpenAPI, AsyncAPI, Prisma/SQL, test, config, deployment, documentation, and hostile-workspace fixtures.
- Create `docs/operations/legacy-baseline-discovery.md`: release, scan, resume, review, promotion, recovery, and rollback runbook.
- Modify `docs/adr/0015-agent-driven-legacy-baseline-discovery.md`, `docs/adr/0018-unified-3a-knowledge-initialization.md`, `docs/TODO.md`, and `docs/design-facts/baseline-manifest.json` during design-fact closure.

### Task 0: Exact-Scope Design Context Preflight

**Files:**
- Read: `docs/adr/0015-agent-driven-legacy-baseline-discovery.md`
- Read: `docs/adr/0018-unified-3a-knowledge-initialization.md`
- Read: `docs/design-facts/baseline-manifest.json`
- Create at runtime: `.specforge/design-context/<session-id>.json`

**Interfaces:**
- Consumes: the approved Phase 1 specification and implementation plan.
- Produces: one open exact-Scope Design Change Session ID reused through Task 8.

- [ ] **Step 1: Read the current design facts through the preflight gate**

Run:

```powershell
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Deliver signed legacy scan through Baseline v1" --affected "adr-agent-driven-legacy-baseline-discovery,adr-unified-3a-knowledge-initialization,api-specforge-mcp-tools,data-specforge-assets,data-specforge-asset-graph" --evidence "approved Phase 1 production design,approved Phase 1 implementation plan"
```

Expected: the command reads the exact-Scope design assets, opens one Design Change Session, and writes its receipt under `.specforge/design-context/`.

- [ ] **Step 2: Capture and inspect the returned session**

Run:

```powershell
$receiptPath = Get-ChildItem -LiteralPath '.specforge/design-context' -Filter '*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
$receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding utf8 | ConvertFrom-Json
$sessionId = $receipt.receipt.sessionId
if (-not $sessionId) { throw 'DESIGN_CHANGE_SESSION_REQUIRED' }
$sessionId
```

Expected: one non-empty `design-change-session:<uuid>` value. Keep this session open until Task 8.

No commit is created for the runtime receipt.

### Task 1: Canonical Scan Contract and Cross-Language Drift Gate

**Files:**
- Create: `packages/scan-contract/package.json`
- Create: `packages/scan-contract/schema/scan-contract-v2.schema.json`
- Create: `packages/scan-contract/src/index.ts`
- Create: `packages/scan-contract/src/generated.ts`
- Create: `packages/scan-contract/src/validate.ts`
- Create: `packages/scan-contract/fixtures/valid-session.json`
- Create: `packages/scan-contract/fixtures/valid-batch.json`
- Create: `packages/scan-contract/fixtures/signed-release.json`
- Create: `packages/scan-contract/fixtures/signed-release.canonical.json`
- Create: `packages/scan-contract/fixtures/invalid-cross-scope-batch.json`
- Create: `packages/scan-contract/src/contract.test.ts`
- Create: `apps/specforge-cli/internal/scancontract/generated.go`
- Create: `apps/specforge-cli/internal/scancontract/contract_test.go`
- Create: `scripts/generate-scan-contract.ts`
- Modify: `package.json`
- Modify: `apps/mcp-server/package.json`
- Modify: `packages/core/package.json`

**Interfaces:**
- Produces: `ScanSessionDescriptor`, `ScannerReleaseManifest`, `SourceObservationV2`, `KnowledgeScanBatch`, `ScanCheckpoint`, `ScanFinalization`, and `SCAN_LIMITS` in TypeScript and Go.
- Produces: `validateScanSession(value: unknown): ScanSessionDescriptor`, `validateScanBatch(value: unknown): KnowledgeScanBatch`, and `canonicalUnsignedRelease(value: ScannerReleaseManifest): Uint8Array`.
- Canonical digest input: RFC 8785 JSON bytes excluding a top-level `signature` field.

- [ ] **Step 1: Add failing TypeScript contract fixtures and tests**

```ts
import { describe, expect, it } from "vitest";
import validSession from "../fixtures/valid-session.json";
import validBatch from "../fixtures/valid-batch.json";
import invalidBatch from "../fixtures/invalid-cross-scope-batch.json";
import { SCAN_LIMITS, validateScanBatch, validateScanSession } from "./index";

describe("scan contract v2", () => {
  it("accepts the shared session and batch fixtures", () => {
    expect(validateScanSession(validSession).contractVersion).toBe("2.0");
    expect(validateScanBatch(validBatch).sequence).toBe(0);
  });

  it("rejects a client batch carrying a different Scope", () => {
    expect(() => validateScanBatch(invalidBatch)).toThrow("SCOPE_MISMATCH");
  });

  it("freezes the production budgets", () => {
    expect(SCAN_LIMITS).toEqual({ maxObservationsPerBatch: 500, maxBatchBytes: 4_194_304, maxExcerptBytes: 8_192, maxSourceFileBytes: 10_485_760, maxObservationsPerSession: 100_000 });
  });

  it("keeps RFC 8785 release bytes stable across runtimes", () => {
    expect(canonicalUnsignedRelease(signedRelease)).toEqual(readFixtureBytes("signed-release.canonical.json"));
    expect(verifyReleaseFixture(signedRelease, trustedReleaseKey)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the TypeScript test and verify RED**

Run: `pnpm --filter @specforge/scan-contract test`

Expected: FAIL because `@specforge/scan-contract` and its validators do not exist.

- [ ] **Step 3: Add the JSON Schema and generated TypeScript boundary**

The schema must declare `additionalProperties: false` for signed/session/batch envelopes and define this exact batch shape:

```ts
export interface KnowledgeScanBatch {
  contractVersion: "2.0";
  sessionId: string;
  sequence: number;
  previousBatchDigest: string | null;
  sessionNonceDigest: string;
  architectureScope: { applicationServiceId: string; scopePath: string };
  observations: SourceObservationV2[];
  coverageDelta: ScanCoverageDelta;
  batchDigest: string;
}

export const SCAN_LIMITS = Object.freeze({
  maxObservationsPerBatch: 500,
  maxBatchBytes: 4 * 1024 * 1024,
  maxExcerptBytes: 8 * 1024,
  maxSourceFileBytes: 10 * 1024 * 1024,
  maxObservationsPerSession: 100_000
});
```

Use one `scripts/generate-scan-contract.ts` command to regenerate both checked-in targets and fail when `git diff --exit-code -- packages/scan-contract/src/generated.ts apps/specforge-cli/internal/scancontract/generated.go` is non-zero.

- [ ] **Step 4: Add the Go fixture test**

```go
func TestSharedBatchFixture(t *testing.T) {
    contents, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "scan-contract", "fixtures", "valid-batch.json"))
    if err != nil { t.Fatal(err) }
    var batch KnowledgeScanBatch
    if err := json.Unmarshal(contents, &batch); err != nil { t.Fatal(err) }
    if batch.ContractVersion != "2.0" || batch.Sequence != 0 { t.Fatalf("batch=%+v", batch) }
    if len(batch.Observations) > MaxObservationsPerBatch { t.Fatal("fixture exceeds production limit") }
}
```

- [ ] **Step 5: Generate, validate, and commit the contract**

Run: `pnpm scanner-contract:generate`

Expected: generated TypeScript and Go files are stable on a second run.

Run: `pnpm --filter @specforge/scan-contract test`

Expected: all contract tests pass.

Run: `go test ./internal/scancontract` from `apps/specforge-cli`.

Expected: all Go contract tests pass.

Commit: `feat: add canonical scan contract v2`

### Task 2: Signed Scanner Release, Exact-Scope Session, and Resumable Batch Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260803_knowledge_scan_production/migration.sql`
- Create: `apps/mcp-server/src/scanner/release.ts`
- Create: `apps/mcp-server/src/scanner/release.test.ts`
- Create: `apps/mcp-server/src/scanner/session.ts`
- Create: `apps/mcp-server/src/scanner/session.test.ts`
- Create: `apps/mcp-server/src/scanner/batch-persistence.ts`
- Create: `apps/mcp-server/src/scanner/batch-persistence.test.ts`
- Create: `apps/mcp-server/src/scanner/batch-persistence.integration.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/persistence.ts`

**Interfaces:**
- Consumes: Task 1 contract validators.
- Produces: `getScannerRelease(input)`, `startKnowledgeScan(input)`, `getScanCheckpoint(input)`, `submitScanBatch(input)`, and `finalizeKnowledgeScan(input)`.
- Produces MCP tools: `get_scanner_release`, `start_knowledge_scan`, `get_scan_checkpoint`, `submit_scan_batch`, and `finalize_knowledge_scan`.

- [ ] **Step 1: Write failing service tests for authority and idempotency**

```ts
it("derives Scope from the persisted session and rejects a sibling Scope", async () => {
  const session = await startKnowledgeScan(sessionInput(designerScope));
  await expect(submitScanBatch(batchInput(session, policyHubScope))).rejects.toThrow("SCOPE_MISMATCH");
});

it("accepts an identical retry and rejects a conflicting sequence", async () => {
  const session = await startKnowledgeScan(sessionInput(designerScope));
  const batch = batchInput(session, designerScope);
  await expect(submitScanBatch(batch)).resolves.toMatchObject({ acceptedSequence: 0 });
  await expect(submitScanBatch(batch)).resolves.toMatchObject({ idempotent: true });
  await expect(submitScanBatch({ ...batch, batchDigest: "f".repeat(64) })).rejects.toThrow("SCAN_BATCH_SEQUENCE_CONFLICT");
});
```

- [ ] **Step 2: Run focused MCP tests and verify RED**

Run: `pnpm exec vitest run apps/mcp-server/src/scanner/release.test.ts apps/mcp-server/src/scanner/session.test.ts apps/mcp-server/src/scanner/batch-persistence.test.ts`

Expected: FAIL because the v2 services do not exist.

- [ ] **Step 3: Add additive persistence models and indexes**

Add these authoritative records with compound exact-Scope uniqueness:

```prisma
model ScannerRelease {
  id String @id
  version String @unique
  contractVersion String
  artifactDigests Json @db.JsonB
  manifest Json @db.JsonB
  signature String
  keyId String
  status String
  publishedAt DateTime
  revokedAt DateTime?
  revocationReason String?
}

model KnowledgeScanSession {
  dbId String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id String
  applicationServiceId String
  scopePath String
  actorId String
  connectorId String
  designChangeSessionId String
  scannerReleaseId String
  contractVersion String
  nonceDigest String
  snapshotIdentity Json @db.JsonB
  budgets Json @db.JsonB
  status String
  acceptedSequence Int @default(-1)
  acceptedBatchDigest String?
  observationCount Int @default(0)
  expiresAt DateTime
  finalizedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([applicationServiceId, scopePath, id], map: "KnowledgeScanSession_scope_id_key")
  @@index([applicationServiceId, scopePath, status, expiresAt], map: "KnowledgeScanSession_scope_status_expiry_idx")
}

model KnowledgeScanBatch {
  dbId String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionId String
  applicationServiceId String
  scopePath String
  sequence Int
  previousBatchDigest String?
  batchDigest String
  payloadDigest String
  observationCount Int
  canonicalBytes Int
  acceptedAt DateTime @default(now())
  @@unique([applicationServiceId, scopePath, sessionId, sequence], map: "KnowledgeScanBatch_scope_session_sequence_key")
  @@unique([applicationServiceId, scopePath, sessionId, batchDigest], map: "KnowledgeScanBatch_scope_session_digest_key")
}
```

The migration also adds `riskTier`, `domainCluster`, and `generatedByActorId` to `KnowledgeAssertion`, plus a unique promotion receipt table used in Task 6.

- [ ] **Step 4: Implement release verification, session creation, and one-transaction batch acceptance**

`submitScanBatch` must follow this order inside one Prisma transaction:

```ts
const session = await tx.knowledgeScanSession.findUniqueOrThrow({ where: scopeSessionKey(input) });
assertWritableSession(session, actor, now);
assertScopeEquals(scopeOf(session), input.architectureScope);
validateBatch(input.batch);
verifyNonceDigest(session.nonceDigest, input.batch.sessionNonceDigest);
verifySequenceAndDigestChain(session, input.batch);
enforceBudgets(session, input.batch);
const duplicate = await findSequence(tx, session, input.batch.sequence);
if (duplicate) return requireIdenticalRetry(duplicate, input.batch);
await persistObservations(tx, session, input.batch.observations);
await persistBatchAndAdvanceCheckpoint(tx, session, input.batch);
return { acceptedSequence: input.batch.sequence, acceptedBatchDigest: input.batch.batchDigest, idempotent: false };
```

Store only `nonceDigest`; return the raw nonce once from `startKnowledgeScan`. Reject expired sessions, revoked releases, digest-chain gaps, oversized canonical payloads, and cumulative observation counts above 100,000.

- [ ] **Step 5: Register typed MCP tools and test permission enforcement**

The write tools require `knowledge:write`; session creation also requires `asset:read`; release lookup is read-only. Tool tests must assert registration, exact input names, and that caller Scope is forwarded only as an equality assertion.

- [ ] **Step 6: Generate the Prisma client, apply the migration, and run focused verification**

Run: `pnpm db:generate`

Expected: Prisma client generation succeeds.

Run: `pnpm exec prisma migrate deploy`

Expected: `20260803_knowledge_scan_production` applies once and is idempotently reported as already applied on the next run.

Run: `pnpm exec vitest run apps/mcp-server/src/scanner`

Expected: release, session, batch, token-refresh, expiry, sibling-Scope, and PostgreSQL integration cases pass.

Commit: `feat: add governed scan sessions and resumable ingestion`

### Task 3: Trusted Go Scanner Runtime and Private Resume Spool

**Files:**
- Create: `apps/specforge-cli/internal/release/manifest.go`
- Create: `apps/specforge-cli/internal/release/manifest_test.go`
- Create: `apps/specforge-cli/internal/session/session.go`
- Create: `apps/specforge-cli/internal/session/session_test.go`
- Create: `apps/specforge-cli/internal/spool/store.go`
- Create: `apps/specforge-cli/internal/spool/store_test.go`
- Create: `apps/specforge-cli/internal/scanner/workspace.go`
- Create: `apps/specforge-cli/internal/scanner/workspace_test.go`
- Create: `apps/specforge-cli/internal/scanner/redact.go`
- Create: `apps/specforge-cli/internal/scanner/redact_test.go`
- Modify: `apps/specforge-cli/main.go`
- Modify: `apps/specforge-cli/main_test.go`
- Modify: `apps/specforge-cli/go.mod`

**Interfaces:**
- Consumes: Task 1 generated Go types and Task 2 Scan Session descriptor.
- Produces: `release.Verify(manifest, trustStore, now) error`, `spool.Open(root, sessionID)`, `scanner.Scan(ctx, Config) (Summary, error)`, and CLI commands `specforge scan` and `specforge scan status`.
- The scanner creates batches but performs no network calls; the Agent transports spool batches to MCP.

- [ ] **Step 1: Write failing trust-root and rollback tests**

```go
func TestVerifyRejectsUnknownKeyAndRollback(t *testing.T) {
    trusted := TrustStore{Keys: map[string]ed25519.PublicKey{"release-2026-a": trustedKey}, MinimumVersion: "1.4.0"}
    if err := Verify(signedManifest("unknown-key", "1.5.0"), trusted, fixedNow); !errors.Is(err, ErrUntrustedKey) { t.Fatalf("err=%v", err) }
    if err := Verify(signedManifest("release-2026-a", "1.3.9"), trusted, fixedNow); !errors.Is(err, ErrReleaseRollback) { t.Fatalf("err=%v", err) }
}
```

- [ ] **Step 2: Write failing spool recovery and workspace-safety tests**

Test that the spool uses mode `0700` directories and `0600` files, resumes after sequence 37, refuses a batch whose previous digest differs, excludes its own `.specforge/scan-spool`, does not follow symlinks escaping the repository root, and marks a changing dirty workspace as `SNAPSHOT_CHANGED`.

```go
func TestSpoolResumesExactCheckpoint(t *testing.T) {
    store := openTestStore(t)
    for sequence := 0; sequence <= 37; sequence++ { writeTestBatch(t, store, sequence) }
    checkpoint, err := store.Checkpoint()
    if err != nil { t.Fatal(err) }
    if checkpoint.AcceptedSequence != 37 { t.Fatalf("checkpoint=%+v", checkpoint) }
    if err := store.Append(conflictingBatch(38)); !errors.Is(err, ErrDigestChainMismatch) { t.Fatalf("err=%v", err) }
}

func TestWorkspaceRejectsEscapingSymlink(t *testing.T) {
    root, outside := hostileWorkspace(t)
    result := scanWorkspace(t, root)
    if slices.Contains(result.ReadPaths, outside) { t.Fatalf("escaped root: %v", result.ReadPaths) }
    requireCoverageReason(t, result.Coverage, "SYMLINK_ESCAPES_ROOT")
}
```

- [ ] **Step 3: Run Go tests and verify RED**

Run: `go test ./...` from `apps/specforge-cli`.

Expected: FAIL because the runtime packages and `scan` command do not exist.

- [ ] **Step 4: Implement release verification without TOFU**

```go
func Verify(manifest scancontract.ScannerReleaseManifest, trust TrustStore, now time.Time) error {
    key, ok := trust.Keys[manifest.KeyID]
    if !ok { return ErrUntrustedKey }
    if trust.RevokedKeyIDs[manifest.KeyID] || manifest.Status == "REVOKED" { return ErrRevokedRelease }
    if semver.Compare("v"+manifest.Version, "v"+trust.MinimumVersion) < 0 { return ErrReleaseRollback }
    if now.Before(manifest.NotBefore) || !now.Before(manifest.ExpiresAt) { return ErrReleaseExpired }
    canonical, err := canonicaljson.MarshalWithoutSignature(manifest)
    if err != nil { return err }
    signature, err := base64.StdEncoding.DecodeString(manifest.Signature)
    if err != nil || !ed25519.Verify(key, canonical, signature) { return ErrInvalidSignature }
    return nil
}
```

The trust store comes from an enterprise-managed config file or `SPECFORGE_SCANNER_TRUST_ROOT`; a key returned by the same server response is never trusted by itself.

- [ ] **Step 5: Implement snapshot-safe scan orchestration and atomic spool writes**

Use a clean Git commit SHA when the worktree is clean. For a dirty tree, hash a sorted manifest of repository-relative path, mode, size, and content digest before and after scanning. Write each batch to a temporary file, `fsync`, then rename atomically to `<sequence>-<digest>.json`; write `checkpoint.json` only after the batch rename succeeds.

- [ ] **Step 6: Wire CLI commands without changing existing hook behavior**

```go
case "scan":
    if len(args) > 1 && args[1] == "status" { return runScanStatus(root, stdout) }
    return runLocalScan(ctx, root, config, stdout, stderr)
```

`specforge scan` requires a signed release manifest and one-time Session descriptor file, prints only session ID, snapshot ID, counts, and spool path, and never prints nonce, token, source excerpts, or secrets.

- [ ] **Step 7: Run focused Go verification and commit**

Run: `go test ./...` from `apps/specforge-cli`.

Expected: all hook, trust, snapshot, redaction, spool, and CLI tests pass.

Run: `go build -trimpath -o dist/specforge.exe .` from `apps/specforge-cli`.

Expected: one Windows scanner binary is produced without repository-specific runtime dependencies.

Commit: `feat: add trusted standalone scanner runtime`

### Task 4: Static Extractor Registry and Evidence-Grade Observations

**Files:**
- Create: `apps/specforge-cli/internal/extractors/registry.go`
- Create: `apps/specforge-cli/internal/extractors/repository.go`
- Create: `apps/specforge-cli/internal/extractors/contracts.go`
- Create: `apps/specforge-cli/internal/extractors/schema.go`
- Create: `apps/specforge-cli/internal/extractors/golang.go`
- Create: `apps/specforge-cli/internal/extractors/java.go`
- Create: `apps/specforge-cli/internal/extractors/typescript.go`
- Create: `apps/specforge-cli/internal/extractors/supporting.go`
- Create: `apps/specforge-cli/internal/extractors/registry_test.go`
- Create: `apps/specforge-cli/internal/extractors/golden_test.go`
- Create: `fixtures/legacy-scan/java-spring/`
- Create: `fixtures/legacy-scan/typescript-node/`
- Create: `fixtures/legacy-scan/go-service/`
- Create: `fixtures/legacy-scan/contracts/`
- Create: `fixtures/legacy-scan/hostile-workspace/`
- Modify: `apps/specforge-cli/internal/scanner/workspace.go`
- Modify: `apps/specforge-cli/go.mod`

**Interfaces:**
- Consumes: `scancontract.SourceObservationV2` and scanner limits.
- Produces: `Extractor` with `ID()`, `Version()`, `Supports(FileMeta)`, and `Extract(context.Context, File) ([]SourceObservationV2, CoverageDelta, error)`.
- Produces only statically registered extractors; repository content cannot register executable code.

- [ ] **Step 1: Write failing registry and golden-fixture tests**

```go
type Extractor interface {
    ID() string
    Version() string
    Supports(FileMeta) bool
    Extract(context.Context, File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error)
}

func TestRegistryIsStaticAndDeterministic(t *testing.T) {
    first := DefaultRegistry().IDs()
    second := DefaultRegistry().IDs()
    if !slices.Equal(first, second) { t.Fatalf("registry order changed: %v != %v", first, second) }
    if slices.Contains(first, "repository-plugin") { t.Fatal("dynamic plugin loaded") }
}
```

Golden tests must assert stable normalized digests and source locations for one Spring controller/entity/event publisher, one TypeScript route/schema/event emitter, one Go HTTP handler/struct/event publisher, OpenAPI/AsyncAPI operations, Prisma/SQL entities and keys, deployment/config/test evidence, and an unsupported-source coverage entry.

```go
func TestGoldenFixtures(t *testing.T) {
    for _, fixture := range []string{"java-spring", "typescript-node", "go-service", "contracts"} {
        got := scanFixture(t, fixture)
        want := readGolden(t, fixture+".observations.json")
        if !reflect.DeepEqual(want, got) { t.Fatalf("%s observations mismatch\nwant=%+v\ngot=%+v", fixture, want, got) }
    }
}
```

- [ ] **Step 2: Run extractor tests and verify RED**

Run: `go test ./internal/extractors -run 'TestRegistry|TestGolden'` from `apps/specforge-cli`.

Expected: FAIL because the extractor registry and fixtures do not exist.

- [ ] **Step 3: Implement deterministic structured extractors**

Use `gopkg.in/yaml.v3` for OpenAPI, AsyncAPI, configuration, and deployment documents; Go `go/parser` and `go/ast` for Go; and the official Tree-sitter Go binding with statically linked Java and TypeScript grammars for Java/Spring and TypeScript/Node. Extractors emit symbols, line ranges, parser ID/version, evidence kind, sensitivity classification, and a redacted excerpt capped at 8 KiB.

```go
func DefaultRegistry() Registry {
    return NewRegistry(
        RepositoryExtractor{}, ContractExtractor{}, SchemaExtractor{},
        GoExtractor{}, JavaExtractor{}, TypeScriptExtractor{},
        TestExtractor{}, ConfigExtractor{}, DeploymentExtractor{}, DocumentationExtractor{},
    )
}
```

- [ ] **Step 4: Implement fail-closed path, secret, binary, and size behavior**

Files above 10 MiB, binaries, unreadable paths, symlinks escaping root, credential files, private keys, and excerpts matching the redaction policy emit a structured skip/redaction coverage reason. They never enter raw payloads. Parser failures create coverage gaps and do not silently mark coverage complete.

- [ ] **Step 5: Run golden and malicious-workspace verification**

Run: `go test ./internal/extractors ./internal/scanner`

Expected: stable fixture digests, no escaped path reads, no fixture secrets in output, and explicit coverage gaps for unsupported or failed files.

Commit: `feat: add static evidence extractors`

### Task 5: Agent Semantic Candidate Protocol and Candidate-Level T0-T3 Review

**Files:**
- Modify: `packages/core/src/knowledge/types.ts`
- Create: `packages/core/src/knowledge/risk.ts`
- Create: `packages/core/src/__tests__/knowledge-risk.test.ts`
- Create: `apps/mcp-server/src/knowledge/risk-policy.ts`
- Create: `apps/mcp-server/src/knowledge/risk-policy.test.ts`
- Create: `apps/mcp-server/src/knowledge/candidate-persistence.ts`
- Create: `apps/mcp-server/src/knowledge/candidate-persistence.test.ts`
- Modify: `apps/mcp-server/src/knowledge/semantic-persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Create: `docs/agent-integration/legacy-baseline-protocol.md`
- Create: `docs/agent-integration/claude-code-example.md`
- Create: `docs/agent-integration/opencode-example.md`

**Interfaces:**
- Consumes: persisted Source Observations and identity candidates.
- Produces: `classifyCandidateRisk(candidate, identityDecision): ReviewRiskTier` and `submitSemanticCandidateBatch(input)`.
- Produces MCP tools: `submit_semantic_candidate_batch`, `assemble_knowledge_review_bundle`, and existing decision tools with separation-of-duty checks.

- [ ] **Step 1: Write failing risk and actor-separation tests**

```ts
it.each([
  [candidate("documentation", 0.98), "T0"],
  [candidate("api-contract", 0.92), "T1"],
  [candidate("data-model", 0.88, { breaking: true }), "T2"],
  [candidate("security-policy", 0.95), "T3"]
])("classifies %s as %s", (input, tier) => expect(classifyCandidateRisk(input)).toBe(tier));

it("prevents the generating actor from approving a T1 bundle", async () => {
  await expect(decideKnowledgeReviewBundle(decisionBy("semantic-agent", t1Bundle))).rejects.toThrow("REVIEW_ACTOR_SEPARATION_REQUIRED");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run packages/core/src/__tests__/knowledge-risk.test.ts apps/mcp-server/src/knowledge/risk-policy.test.ts apps/mcp-server/src/knowledge/candidate-persistence.test.ts`

Expected: FAIL because candidate-level risk and batch submission do not exist.

- [ ] **Step 3: Add candidate metadata and deterministic risk policy**

```ts
export interface KnowledgeAssertion {
  // existing fields remain unchanged
  riskTier: ReviewRiskTier;
  domainCluster: string;
  generatedByActorId: string;
}
```

Risk is computed per candidate. The bundle risk is the maximum candidate tier. T0 can auto-accept only when identity is unambiguous, coverage is complete, confidence is at least 0.95, and no unresolved question exists. T1 requires an actor different from the generator. T2 and T3 require human approval. Any incomplete coverage, conflict, ambiguous identity, missing Chinese overlay, or missing evidence blocks approval.

- [ ] **Step 4: Implement chunked semantic candidate submission**

`submitSemanticCandidateBatch` validates that every source observation belongs to the persisted Scan Session Scope, deduplicates by `sessionId + semanticIdentity + normalizedDigest`, records Agent/model/tool provenance without requiring a real model provider, and advances a semantic checkpoint. The existing `MockAIProvider` remains test-only and `generate_knowledge_candidates` is marked compatibility-only in descriptions.

- [ ] **Step 5: Add provider-neutral Agent instructions**

The protocol must tell Claude Code and OpenCode to read only the approved observation batches, generate English canonical and Chinese localized human-facing content, preserve evidence references, submit bounded candidate batches, query checkpoint before retry, and never call approval or Baseline publication tools as the generating actor.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @specforge/core test`

Expected: core scanner, knowledge, identity, and risk tests pass.

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge apps/mcp-server/src/tools.test.ts`

Expected: candidate batching, deduplication, Scope isolation, risk aggregation, and actor separation pass.

Commit: `feat: add governed agent semantic review`

### Task 6: Transactional Candidate Promotion and Immutable Baseline Publication

**Files:**
- Create: `apps/mcp-server/src/knowledge/promotion.ts`
- Create: `apps/mcp-server/src/knowledge/promotion.test.ts`
- Create: `apps/mcp-server/src/knowledge/promotion.integration.test.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `packages/core/src/knowledge/types.ts`

**Interfaces:**
- Consumes: an approved ReviewBundle and PromotionDecision from Task 5.
- Produces: `promoteKnowledgeCandidates(input): Promise<PromotionReceipt>` and `reconcileKnowledgeBaseline(input): Promise<ReconciliationResult>`.
- Produces MCP tools: `promote_knowledge_candidates` and `reconcile_knowledge_baseline`; existing `publish_knowledge_baseline` requires a converged reconciliation receipt.

- [ ] **Step 1: Write failing transaction and idempotency tests**

```ts
it("materializes assets, typed links, evidence, outbox, and ChangeSet atomically", async () => {
  const receipt = await promoteKnowledgeCandidates(approvedFixture());
  expect(receipt).toMatchObject({ assetRevisionIds: expect.any(Array), relationshipRevisionIds: expect.any(Array), changeSetId: expect.any(String) });
  expect(await scopedAssetCount(designerScope)).toBeGreaterThan(0);
  expect(await scopedOutboxCount(designerScope)).toBe(receipt.relationshipRevisionIds.length);
});

it("rolls back every authored record when relationship persistence fails", async () => {
  forceRelationshipFailure();
  await expect(promoteKnowledgeCandidates(approvedFixture())).rejects.toThrow("PROMOTION_TRANSACTION_FAILED");
  expect(await scopedAssetCount(designerScope)).toBe(0);
  expect(await scopedChangeSetCount(designerScope)).toBe(0);
});
```

- [ ] **Step 2: Run focused promotion tests and verify RED**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/promotion.test.ts apps/mcp-server/src/knowledge/promotion.integration.test.ts`

Expected: FAIL because approved assertions are not materialized into canonical design revisions.

- [ ] **Step 3: Implement the explicit fact-to-asset mapping registry**

```ts
const promotionMappers: Record<string, PromotionMapper> = {
  "domain-concept": mapDomain,
  "business-rule": mapRule,
  "api-contract": mapApi,
  "event-contract": mapEvent,
  "data-model": mapDataModel,
  "state-machine": mapStateMachine,
  "architecture-decision": mapAdr,
  "typed-relationship": mapRelationship
};
```

Unknown fact types fail with `PROMOTION_MAPPING_UNSUPPORTED`; they are not stored as generic assets. Each mapper requires canonical English, validates Chinese localized fields for human-facing content, preserves source evidence, and creates directional normalized relationship commands.

- [ ] **Step 4: Implement one authoritative promotion transaction**

Within one Prisma transaction: lock the ReviewBundle and PromotionDecision; verify exact Scope, status, evidence, risk policy, and actor separation; reuse the existing design asset and relationship command services with the same transaction; persist Evidence; enqueue `RelationshipOutbox`; create the monotonic `KnowledgeChangeSet`; mark assertions promoted; and write a unique `KnowledgePromotionReceipt`. A retry returns the existing receipt only when its input digest matches.

- [ ] **Step 5: Require converged reconciliation before Baseline publication**

Reconciliation compares the receipt's asset revision IDs, relationship revision IDs, evidence refs, Scope, and source Scan Session digest against PostgreSQL. Publication creates an immutable Baseline manifest and supersedes the previous Baseline only after the new row commits. A failed reconciliation leaves the previous Baseline and dashboard counts unchanged.

- [ ] **Step 6: Verify user-visible Scope isolation and commit**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/promotion.test.ts apps/mcp-server/src/knowledge/promotion.integration.test.ts apps/mcp-server/src/persistence.integration.test.ts`

Expected: atomic promotion, retry idempotency, bilingual validation, exact-Scope isolation, previous-Baseline preservation, and scoped asset counts pass.

Commit: `feat: promote reviewed knowledge into baseline assets`

### Task 7: End-to-End Production Proof, Recovery Runbook, and Release Artifacts

**Files:**
- Create: `apps/mcp-server/src/scanner/legacy-baseline.e2e.test.ts`
- Create: `apps/mcp-server/src/scanner/legacy-baseline.scale.test.ts`
- Create: `scripts/verify-legacy-baseline.ps1`
- Create: `scripts/build-scanner-release.ps1`
- Create: `.github/workflows/scanner-release.yml`
- Create: `docs/operations/legacy-baseline-discovery.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `deploy/compose.yaml`

**Interfaces:**
- Consumes: all Phase 1 runtime interfaces.
- Produces: `pnpm legacy-baseline:verify`, signed scanner artifacts under `dist/scanner/<version>/`, and an operator runbook.

- [ ] **Step 1: Write the end-to-end fixture test**

The test must create one exact-Scope Scan Session, run the Go scanner against `fixtures/legacy-scan`, submit at least three batches, simulate a transport interruption and checkpoint resume, submit Agent semantic fixtures, match identities, approve according to risk, promote, reconcile, publish Baseline v1, and rescan without duplicate canonical assets. A sibling Scope query must return zero Phase 1 records.

```ts
it("publishes Baseline v1 and keeps sibling Scope empty after resume and rescan", async () => {
  const first = await runLegacyBaselineFixture({ scope: designerScope, interruptAfterSequence: 1 });
  expect(first.checkpoint.acceptedSequence).toBe(1);
  const resumed = await resumeLegacyBaselineFixture(first.sessionId);
  expect(resumed.baseline.status).toBe("PUBLISHED");
  const rescanned = await runLegacyBaselineFixture({ scope: designerScope, previousBaselineId: resumed.baseline.id });
  expect(rescanned.canonicalAssetIds).toEqual(resumed.canonicalAssetIds);
  expect(await listPhaseOneRecords(policyHubScope)).toEqual([]);
});
```

- [ ] **Step 2: Write bounded scale and hostile-input tests**

Generate 100,000 metadata-only observations without copying repository source. Assert 200 accepted batches of at most 500 observations, bounded process memory recorded by the script, exact resume after an injected failure, rejection of batch 201, and no source excerpt above 8 KiB. Exercise symlink escape, binary, private key, token, huge file, malformed OpenAPI, and workspace mutation cases.

```ts
it("accepts the session ceiling in bounded batches and rejects overflow", async () => {
  const session = await startScaleSession(designerScope);
  for (let sequence = 0; sequence < 200; sequence += 1) {
    await submitScanBatch(scaleBatch(session, sequence, 500));
  }
  await expect(submitScanBatch(scaleBatch(session, 200, 1))).rejects.toThrow("SCAN_SESSION_OBSERVATION_LIMIT_EXCEEDED");
  expect(await maxPersistedExcerptBytes(session.id)).toBeLessThanOrEqual(8_192);
});
```

- [ ] **Step 3: Implement the signed release builder**

`scripts/build-scanner-release.ps1` builds and hashes one artifact for the current native runner and refuses to cross-compile Tree-sitter/CGO binaries. `.github/workflows/scanner-release.yml` runs native Windows, Linux amd64/arm64, and macOS amd64/arm64 jobs, aggregates their artifacts in a release job, emits one RFC-8785-compatible manifest, signs it using a CI-provided Ed25519 private key, and refuses to read the private key from the repository. The public key ID and minimum version are explicit release metadata. The same native-runner script remains reusable by CodeHub when its gate is delivered in Phase 4.

- [ ] **Step 4: Write the operations runbook**

Document token prerequisites, release trust-root installation, Session creation, Agent invocation, spool location and permissions, checkpoint resume, coverage review, T0-T3 approval, promotion, reconciliation, Baseline publication, release revocation, key rotation overlap, rollback refusal, spool cleanup, audit queries, and failure codes. State that production Agent integrations, CodeHub gate, 3A projections, and graph projection are outside Phase 1.

- [ ] **Step 5: Run one stage-level verification**

Run: `pnpm legacy-baseline:verify`

Expected: contract drift check, Go tests/build, focused core/MCP tests, PostgreSQL integration, end-to-end Baseline v1, Scope-isolation, and hostile-input checks all pass in one report.

Run: `pnpm typecheck`

Expected: all TypeScript workspaces typecheck.

Run: `pnpm build`

Expected: core, MCP, and Web production builds pass.

Commit: `test: prove legacy baseline production flow`

### Task 8: Dual-Record Design-Fact Closure Through MCP

**Files:**
- Modify: `docs/adr/0015-agent-driven-legacy-baseline-discovery.md`
- Modify: `docs/adr/0018-unified-3a-knowledge-initialization.md`
- Modify: `docs/TODO.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/superpowers/specs/2026-08-03-agent-driven-legacy-baseline-production-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-agent-driven-legacy-baseline-production.md`

**Interfaces:**
- Consumes: successful Task 7 evidence.
- Produces: matching repository and MCP ADR, Proposal, Context Pack, contract/rule/data-model facts, typed links, Evidence, and backlog facts under the exact owning Scope.

- [ ] **Step 1: Correct stale repository facts before synchronization**

Update ADR 0015 Chinese evidence to match the actual current core test count and implemented deterministic identity matching. Distinguish Phase 1 implemented behavior from Phase 2-5 deferred capability in both English and Chinese. Record exact commands and results from Task 7.

- [ ] **Step 2: Update the design-fact manifest**

Add stable IDs for the scanner release contract, Scan Session, Scan Batch, Source Observation v2, risk policy, promotion transaction, Baseline publication, Phase 1 Proposal, Agent Context Pack, and their directional typed relationships. Preserve repository IDs as MCP IDs.

- [ ] **Step 3: Synchronize the Task 0 exact-Scope session through MCP**

Run:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
pnpm design-facts:federation:check
```

Expected: no missing, mismatched, blocked, pending, or out-of-Scope facts.

- [ ] **Step 4: Read back MCP assets and typed links**

Read ADR 0015, ADR 0018, the Phase 1 Proposal, Agent Context Pack, contract assets, and their links through MCP. Verify exact Scope, matching IDs, English canonical content, complete Chinese overlays, evidence refs, directional relationship types, and PostgreSQL authority statements.

- [ ] **Step 5: Close the design context and commit**

Run:

```powershell
$receiptPath = Get-ChildItem -LiteralPath '.specforge/design-context' -Filter '*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
$sessionId = (Get-Content -LiteralPath $receiptPath -Raw -Encoding utf8 | ConvertFrom-Json).receipt.sessionId
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session $sessionId --status CONVERGED --evidence "pnpm legacy-baseline:verify=passed,pnpm design-facts:check=passed,pnpm design-facts:federation:check=passed"
```

Expected: the session closes as `CONVERGED`. If any MCP write fails, record `MCP synchronization blocked`, its failure reason and retry trigger, create/update the backlog fact, and do not claim Phase 1 complete.

Commit: `docs: close legacy baseline production facts`

---

## Stage Acceptance Gate

Phase 1 is complete only when all of the following are true:

- a trusted scanner release can be verified from a preconfigured trust root and revoked without shipping a new client;
- an exact-Scope Session can ingest, resume, and finalize hash-chained batches without duplicate observations;
- Java/Spring, TypeScript/Node, Go, OpenAPI, AsyncAPI, Prisma/SQL, tests, config, deployment, and documentation produce deterministic evidence or explicit coverage gaps;
- an authorized Agent can submit bilingual semantic candidates without receiving database credentials or approval authority;
- candidate-level T0-T3 policy and actor separation block unsafe promotion;
- approved candidates materialize atomically into canonical assets, typed relationships, Evidence, outbox rows, a ChangeSet, and an immutable Baseline;
- a repeated scan does not duplicate canonical assets and sibling application-service Scope returns no records;
- stage-level verification, typecheck, build, MCP synchronization, and MCP read-back all pass;
- the repository and SpecForge operational design records agree on implemented and deferred capability.

## 中文执行摘要

本计划只实施第一阶段，即从存量代码仓扫描到 Baseline v1 的生产闭环。任务 1 建立 Go/TypeScript 共用契约；任务 2 建立签名发布、精确 Scope 会话和断点批次；任务 3 建立本地可信扫描运行时；任务 4 完成静态提取器；任务 5 完成 Agent 语义候选和 T0-T3 审核；任务 6 将候选事务化提升为规范设计资产；任务 7 统一执行阶段级端到端、规模和安全验证；任务 8 通过 MCP 完成双记录闭环。

第一阶段不依赖图数据库，也不交付 3A 投影、CodeHub 门禁或完整企业部署加固。这些能力分别进入第二至第五阶段。第一阶段完成后，企业用户已经可以使用 Claude Code、OpenCode 等现有 Agent，在获得多个应用服务 Scope 权限的 Token 后，为每个应用服务独立建立可追溯、可审核、可重复扫描的 Baseline v1。
