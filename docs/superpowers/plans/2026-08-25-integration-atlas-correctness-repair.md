# Integration Atlas Correctness Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ADR-0039's Integration Atlas safe under restricted reads and reliably resumable, while rejecting malformed V1 contract writes at the MCP boundary.

**Architecture:** Keep consumer-owned contracts in PostgreSQL and keep graph output as a read-only projection. Persist only the normalized V1 query fields required for deterministic bounded ordering; bind continuation cursors to the authenticated subject, readable-scope set, active Scope, and a PostgreSQL aggregate waterline. Restricted provider bindings are rendered as opaque targets without provider-derived strings.

**Tech Stack:** Next.js 15, TypeScript, Prisma/PostgreSQL, MCP SDK, Vitest, Zod.

## Global Constraints

- Use the exact Designer Scope and open design-change session `design-change-session:bf43d980-f32c-4440-ab35-557390e08c03`.
- PostgreSQL remains the authoritative authored-contract store; no direct authoring outside MCP and no graph-store write is added.
- New contract writes are V1-governed; existing legacy records remain readable as unresolved until explicitly upgraded.
- English is canonical and all new human-facing text receives Chinese localization.
- No cross-Scope provider asset is created, edited, or linked by a consumer write.

---

### Task 1: Lock down V1 integration writes

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Test: `apps/mcp-server/src/tools.integration-v1.test.ts`

**Interfaces:**
- Consumes: `upsert_design_asset({ assetType: "integration", asset, architectureScope })`
- Produces: `validateIntegrationContractV1(asset, architectureScope)` and deterministic V1 persistence fields.

- [ ] Add an explicit V1 schema marker and normalized contract identity fields to the core integration contract type.
- [ ] Make the MCP tool reject malformed enums, a consumer/source Scope mismatch, invalid internal/external resolution tuples, missing normalized locators, and non-canonical call keys.
- [ ] Preserve a legacy record only when its existing persisted payload is also legacy; reject new ungoverned writes.
- [ ] Add focused tests for each rejected tuple and an accepted owned contract.

### Task 2: Persist a queryable Atlas projection and implement continuation

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/web/lib/integrations/atlas.ts`
- Test: `apps/web/lib/integrations/atlas.test.ts`

**Interfaces:**
- Consumes: normalized V1 integration payload persisted by Task 1.
- Produces: `loadIntegrationAtlas(readableScopes, activeScopeId, { subject, cursor, language })` with a signed page cursor.

- [ ] Add nullable normalized integration columns, an exact Scope plus call-key uniqueness constraint, and a deterministic Atlas sort index.
- [ ] Populate or clear those columns atomically with the authored `DesignAsset` upsert.
- [ ] Query one Scope at a time by `(targetBinding, protocolKind, protocolLocator, id)` with `take = remaining + 1`; carry the exact tuple and Scope index in the cursor.
- [ ] Encode cursors as `base64url(body).base64url(HMAC(body))`, select the active secret from the existing 3A key ring, and reject a changed subject, active Scope, readable-scope digest, or catalog waterline.
- [ ] Add tests that a page continuation returns the next records exactly once, and that cursor tampering or a different subject is rejected.

### Task 3: Enforce authorization projection through every Atlas surface

**Files:**
- Modify: `apps/web/lib/integrations/atlas.ts`
- Modify: `apps/web/app/api/integrations/atlas/route.ts`
- Modify: `apps/web/app/assets/integrations/page.tsx`
- Modify: `apps/web/components/integration-atlas-canvas.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Test: `apps/web/lib/integrations/atlas.test.ts`

**Interfaces:**
- Consumes: Atlas contract views and authenticated `ScopedPrincipal.subject`.
- Produces: `RESTRICTED` view state and a visible, safe continuation affordance.

- [ ] Redact provider-derived target names, call keys, locators, target IDs, revisions, and edge drawer detail for unreadable resolved providers.
- [ ] Use a deterministic restricted node based only on visible consumer contract identity.
- [ ] Return explicit errors for unauthorized active Scopes, invalid/stale cursors, and unavailable storage; never render those states as empty data.
- [ ] Render page continuation and localized partial/restricted messaging without claiming the bounded canvas is a complete inventory.
- [ ] Add a whole-response leak assertion that does not contain a hidden provider ID, name, asset ID, or target locator.

### Task 4: Verify, synchronize design facts, and close the session

**Files:**
- Modify: `docs/adr/0039-cross-scope-integration-contracts.md`
- Modify: `scripts/design-fact-manifest.ts` only if the existing ADR record requires its evidence/status update.

- [ ] Run focused MCP and Web tests, then `pnpm --filter @specforge/mcp-server typecheck` and `pnpm --filter @specforge/web typecheck`.
- [ ] Apply the Prisma schema change to the local Docker PostgreSQL target and run the focused suite against it.
- [ ] Update ADR-0039's outcome/evidence with exact successful commands and explicitly retain provider acknowledgement and external reconciliation as deferred work.
- [ ] Synchronize the updated ADR through `pnpm design-facts:sync`, run reconciliation, close the open design-change session with exact evidence, and commit implementation plus records together.
