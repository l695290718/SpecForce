# Idempotent 3A Projection Publication Implementation Plan

> **For agentic workers:** Execute the tasks in order and keep the exact-Scope evidence with the implementation.

**Goal:** Make repeated 3A projection publication safe and recoverable without changing immutable projection identity.

**Architecture:** Keep idempotency in `PrismaProjectionBuildRepository.publish`. The transaction validates the leased job, checks the existing manifest by exact Scope and deterministic ID, reuses only an identical immutable row, and rejects conflicting content. The projector and Web containers then consume the same published projection.

**Tech Stack:** TypeScript, Prisma, PostgreSQL, Vitest, Docker Compose, SpecForge MCP governance.

## Global Constraints

- Application service: `com.huawei.celon.desiner`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL is authoritative; projection publication is immutable and exact-Scope.
- Do not delete, overwrite, or silently replace an existing manifest.

### Task 1: Repository idempotency

**Files:**
- Modify: `apps/knowledge-projector/src/repository.ts`
- Test: `apps/knowledge-projector/src/repository.test.ts`

- [ ] Add tests for initial create, identical retry reuse, and conflicting retry rejection.
- [ ] Read the manifest inside the existing publish transaction before create.
- [ ] Reuse an identical row and mark the leased build job ready.
- [ ] Throw `PROJECTION_MANIFEST_IMMUTABLE_CONFLICT` for differing immutable identity.

### Task 2: Verification and deployment

**Files:**
- Update: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Update: `docs/design-facts/baseline-manifest.json`
- Create: `docs/evidence/idempotent-projection-publication-evidence.md`

- [ ] Run focused projector tests, typechecks, and `git diff --check`.
- [ ] Rebuild and restart the managed projector and Web services.
- [ ] Verify `3010/healthz` and exact-Scope 3A read behavior.
- [ ] Synchronize design facts and close the same design-change session with exact evidence.
