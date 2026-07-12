# Huawei Architecture Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope every SpecForge artifact to the Huawei product-family-to-application-service hierarchy and enforce inherited mock read/write grants in Web and MCP.

**Architecture:** A shared Core scope module owns the immutable hierarchy types, path-based authorization, and target validation. PostgreSQL stores hierarchy nodes, actor grants, and denormalized service/path columns on persisted records. MCP and Web request helpers call the same Core evaluator; the Web scope picker controls the selected read scope while all writes require an application-service target with write access.

**Tech Stack:** TypeScript, Next.js 15 / React 19, Prisma 6 / PostgreSQL, MCP SDK, Zod, Vitest, Tailwind CSS.

## Global Constraints

- The initial default application service id is exactly `com.huawei.celon.desiner`.
- Design-asset writes remain MCP-native; Web must not write database rows directly.
- A writable target is always an `applicationService`; ancestor scopes are read-only aggregate views.
- The default mock actor has read/write on the default service and read on its module.
- Forbidden records must not appear in list results, counts, graph nodes/edges, or impact summaries.
- Preserve existing uncommitted PostgreSQL and proposal-localization work; do not revert or stage it accidentally.

---

## File Structure

- Create: `packages/core/src/architecture/types.ts` — scope, grant, actor, and scoped-artifact contracts.
- Create: `packages/core/src/architecture/service.ts` — pure scope-tree lookup, inherited permission evaluation, filtering, and write validation.
- Create: `packages/core/src/architecture/mock.ts` — Huawei mock hierarchy and default actor grants.
- Create: `packages/core/src/__tests__/architecture-scope.test.ts` — unit coverage for inheritance and denial paths.
- Modify: `packages/core/src/types.ts` — add `architectureScope` to persisted artifact contracts and impact result.
- Modify: `packages/core/src/index.ts` — expose architecture APIs.
- Modify: `prisma/schema.prisma` — normalized `ArchitectureScope` / `ActorScopeGrant` models and indexed scope columns.
- Modify: `apps/mcp-server/src/auth.ts` — resolve active actor and delegate scope checks to Core.
- Modify: `apps/mcp-server/src/persistence.ts` — persist and filter scope metadata; validate MCP writes.
- Modify: `apps/mcp-server/src/tools.ts` — add scope schema, scope-aware read/write tools, and stable authorization errors.
- Modify: `apps/mcp-server/src/resources.ts` — filter MCP resources and graph resources by actor scope.
- Modify: `apps/mcp-server/src/seed.ts` — seed the hierarchy through the MCP path and attach default scope to every self-design record.
- Modify: `apps/mcp-server/src/smoke.ts` — exercise allowed and denied MCP scope behavior.
- Modify: `prisma/data/specforge-self-design.ts` — define `architectureScope` for every seeded asset, proposal, Context Pack, and relation.
- Create: `apps/web/lib/architecture-scope.ts` — selected-scope parsing plus server-side actor/scope resolution.
- Create: `apps/web/components/architecture-scope-provider.tsx` — localStorage-backed scope context for client controls.
- Create: `apps/web/components/architecture-scope-switcher.tsx` — permitted hierarchy selector with current service path.
- Modify: `apps/web/app/layout.tsx` and `apps/web/components/app-shell.tsx` — mount provider and picker in the app chrome.
- Modify: `apps/web/lib/assets.ts` — scope-aware database reads, counts, graph, and relationship filtering.
- Modify: `apps/web/app/assets/[type]/page.tsx`, `apps/web/app/assets/[type]/[id]/page.tsx`, `apps/web/app/assets/[type]/new/page.tsx`, `apps/web/app/assets/[type]/[id]/edit/page.tsx` — propagate selected scope and suppress write controls in aggregate/read-only views.
- Modify: `apps/web/app/page.tsx`, `apps/web/app/proposals/page.tsx`, `apps/web/app/proposals/[id]/page.tsx`, `apps/web/app/context-packs/page.tsx`, `apps/web/app/context-packs/[id]/page.tsx`, `apps/web/app/graph/page.tsx`, `apps/web/app/governance/checks/page.tsx` — apply scope filtering consistently.
- Modify: `apps/web/components/asset-graph.tsx` — show selected architecture scope in node details and retain filtered links only.

### Task 1: Define the shared hierarchy and inherited authorization service

**Files:**
- Create: `packages/core/src/architecture/types.ts`
- Create: `packages/core/src/architecture/mock.ts`
- Create: `packages/core/src/architecture/service.ts`
- Create: `packages/core/src/__tests__/architecture-scope.test.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `ArchitectureScope`, `ArchitectureScopeLevel`, `ArchitectureScopeRef`, `ScopeGrant`, `ScopedActor`, `hasScopeAccess`, `filterByReadableScope`, and `assertWritableApplicationService`.
- Consumed by MCP authorization/persistence and Web database helpers.

- [ ] **Step 1: Write failing core tests for scope inheritance and service-only writes.**

```ts
import { describe, expect, it } from "vitest";
import {
  assertWritableApplicationService,
  defaultHuaweiActor,
  filterByReadableScope,
  huaweiArchitectureScopes,
  hasScopeAccess
} from "../index";

describe("Huawei architecture scope authorization", () => {
  it("inherits module read access to child application services", () => {
    expect(hasScopeAccess(defaultHuaweiActor, huaweiArchitectureScopes, "module-celon-designer", "read")).toBe(true);
    expect(hasScopeAccess(defaultHuaweiActor, huaweiArchitectureScopes, "com.huawei.celon.desiner", "read")).toBe(true);
  });

  it("does not turn an ancestor read grant into a service write grant", () => {
    expect(() => assertWritableApplicationService(defaultHuaweiActor, huaweiArchitectureScopes, "module-celon-designer")).toThrow("application service");
    expect(() => assertWritableApplicationService(defaultHuaweiActor, huaweiArchitectureScopes, "com.huawei.celon.runtime")).toThrow("not authorized");
  });

  it("filters data outside readable scope paths", () => {
    const visible = filterByReadableScope(defaultHuaweiActor, huaweiArchitectureScopes, [
      { id: "designer", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" } },
      { id: "runtime", architectureScope: { applicationServiceId: "com.huawei.celon.runtime", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-runtime/com.huawei.celon.runtime" } }
    ]);
    expect(visible.map((item) => item.id)).toEqual(["designer"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `pnpm --filter @specforge/core test -- architecture-scope.test.ts`

Expected: failure because the architecture exports do not exist yet. If Vitest cannot start because of the OneDrive sandbox directory traversal issue, record its exact startup error and still continue with `pnpm typecheck` after implementation.

- [ ] **Step 3: Add complete scope contracts and the mock tree.**

```ts
export type ArchitectureScopeLevel = "productFamily" | "product" | "subProduct" | "module" | "applicationService";
export type ScopeAction = "read" | "write";

export interface ArchitectureScope {
  id: string;
  code: string;
  name: string;
  description: string;
  owner: string;
  level: ArchitectureScopeLevel;
  parentId?: string;
  scopePath: string;
}

export interface ArchitectureScopeRef {
  applicationServiceId: string;
  scopePath: string;
}

export interface ScopeGrant { scopeId: string; action: ScopeAction; }
export interface ScopedActor { actorType: "agent" | "user" | "system"; actorId: string; grants: ScopeGrant[]; }
```

Implement `scopeById`, `isDescendantScope`, `hasScopeAccess`, `filterByReadableScope`, and `assertWritableApplicationService` in `architecture/service.ts`. `hasScopeAccess` must match a grant when the requested node’s `scopePath` equals or starts with `${grantScope.scopePath}/`; `write` must not fall back to a `read` grant. `assertWritableApplicationService` must first require `level === "applicationService"`, then require inherited write access, and return `{ applicationServiceId, scopePath }`.

Define the mock path:

```ts
pf-huawei
pf-huawei/product-celon
pf-huawei/product-celon/subproduct-platform
pf-huawei/product-celon/subproduct-platform/module-celon-designer
pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
```

Add a sibling `com.huawei.celon.runtime` under a different module for denial testing. Export `defaultHuaweiActor` with read/write on `com.huawei.celon.desiner` and read on `module-celon-designer`.

- [ ] **Step 4: Extend artifact and impact types without weakening existing contracts.**

```ts
export interface BaseAsset {
  // existing fields
  architectureScope?: ArchitectureScopeRef;
}

export interface ContextPack {
  // existing fields
  architectureScope?: ArchitectureScopeRef;
}

export interface AssetLink {
  // added shared contract for persistence and graph APIs
  architectureScope?: ArchitectureScopeRef;
}

export interface ImpactAnalysis {
  // existing fields
  affectedArchitectureScopes?: ArchitectureScopeRef[];
}
```

Add exports for `./architecture/types`, `./architecture/mock`, and `./architecture/service` in `packages/core/src/index.ts`.

- [ ] **Step 5: Run focused tests and typecheck.**

Run: `pnpm --filter @specforge/core test -- architecture-scope.test.ts`

Expected: all three assertions pass, or the known Vitest startup restriction is captured with no assertion output.

Run: `pnpm --filter @specforge/core typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit the shared authorization model.**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts packages/core/src/architecture packages/core/src/__tests__/architecture-scope.test.ts
git commit -m "feat: add Huawei architecture scope authorization"
```

### Task 2: Persist normalized scopes and scoped design records in PostgreSQL

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `apps/mcp-server/src/persistence.ts`

**Interfaces:**
- Consumes Core `ArchitectureScopeRef`, `ScopedActor`, and `assertWritableApplicationService`.
- Produces `ensureArchitectureScopes`, `listPersistedArchitectureScopes`, and scope-aware versions of the existing persistence methods.

- [ ] **Step 1: Add a failing persistence unit case around missing and unauthorized scope.**

Add an MCP-server test file `apps/mcp-server/src/persistence.test.ts` that calls the pure exported scope-validation helper with a payload missing `architectureScope`, and with `applicationServiceId: "com.huawei.celon.runtime"`. Assert the stable messages `Architecture scope is required.` and `Scope write is not authorized.`.

- [ ] **Step 2: Run the targeted test and verify it fails.**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/persistence.test.ts`

Expected: fail because scope validation is not implemented.

- [ ] **Step 3: Add Prisma models and denormalized query columns.**

```prisma
model ArchitectureScope {
  id        String   @id
  code      String   @unique
  name      String
  description String
  owner     String
  level     String
  parentId  String?
  scopePath String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([parentId])
  @@index([level])
}

model ActorScopeGrant {
  id        String   @id @default(cuid())
  actorType String
  actorId   String
  scopeId   String
  action    String
  createdAt DateTime @default(now())

  @@unique([actorType, actorId, scopeId, action])
  @@index([actorType, actorId])
}
```

Add nullable `applicationServiceId String?` and `scopePath String?` to `DesignAsset`, `Proposal`, and `ContextPack`; add the same two columns to `AssetLink`. Add indexes on `applicationServiceId` and `scopePath` for all four artifact tables.

- [ ] **Step 4: Update MCP schema initialization and persistence methods.**

Extend `ensureMcpPersistenceSchema()` with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements matching the Prisma schema. Implement `ensureArchitectureScopes()` to upsert `huaweiArchitectureScopes` and `defaultHuaweiActor.grants` before each MCP operation. Extract:

```ts
export function resolveWritableScope(
  actor: ScopedActor,
  scope: ArchitectureScopeRef | undefined
): ArchitectureScopeRef {
  if (!scope) throw new Error("Architecture scope is required.");
  try { return assertWritableApplicationService(actor, huaweiArchitectureScopes, scope.applicationServiceId); }
  catch { throw new Error("Scope write is not authorized."); }
}
```

`upsertDesignAsset`, `upsertProposal`, `upsertContextPack`, and `upsertAssetLink` must call it and write the resolved id/path into both columns and JSON payload. Use the source service as the link’s scope after confirming the actor can read the target endpoint’s scope.

- [ ] **Step 5: Run database generation, push, focused test, and server typecheck.**

Run: `pnpm db:generate`

Expected: Prisma client generated successfully.

Run: `pnpm db:push`

Expected: schema synchronized with local `specforge` PostgreSQL.

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/persistence.test.ts`

Expected: scope denial assertions pass.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit scoped persistence.**

```bash
git add prisma/schema.prisma apps/mcp-server/src/persistence.ts apps/mcp-server/src/persistence.test.ts
git commit -m "feat: persist scoped architecture data"
```

### Task 3: Enforce scope authorization through MCP tools and resources

**Files:**
- Modify: `apps/mcp-server/src/auth.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/resources.ts`
- Modify: `apps/mcp-server/src/smoke.ts`

**Interfaces:**
- Consumes scope-aware persistence methods from Task 2 and `hasScopeAccess` from Core.
- Produces scope-filtered tools/resources and an MCP smoke proof for allowed/denied operations.

- [ ] **Step 1: Extend smoke coverage before changing tool definitions.**

Add calls that upsert an asset with:

```ts
architectureScope: {
  applicationServiceId: "com.huawei.celon.runtime",
  scopePath: "ignored-by-server"
}
```

Assert `firstText(deniedWrite)` contains `Scope write is not authorized.`. Add an allowed upsert whose scope is `com.huawei.celon.desiner`, then assert its response includes `status` and `applicationServiceId`.

- [ ] **Step 2: Run MCP smoke to record the pre-change failure.**

Run: `pnpm --filter @specforge/mcp-server smoke`

Expected: failure because write schemas do not accept/validate architecture scope and reads are unfiltered.

- [ ] **Step 3: Replace the allow-all policy with an adapter over the default scoped actor.**

Keep existing capability permissions such as `asset:write`; add `getDefaultActor()` returning the Core `defaultHuaweiActor`, optionally using `SPECFORGE_MCP_ACTOR_ID` for `actorId`. `authorize` continues to check capability permissions, while every data operation invokes its corresponding scope check. Do not make arbitrary environment grants part of this MVP.

- [ ] **Step 4: Add Zod scope input and bind it to every MCP write path.**

```ts
const architectureScopeSchema = z.object({
  applicationServiceId: z.string().min(1),
  scopePath: z.string().optional()
});
```

Require `architectureScope` on `upsert_design_asset`, `upsert_proposal`, and `upsert_context_pack` envelopes; require it on `link_assets` as `sourceArchitectureScope`. For `create_proposal`, `update_proposal`, `create_adr`, and `generate_context_pack`, resolve the default service only when the target is already within that service; otherwise reject cross-scope writes. Pass the resolved scope to persistence rather than trusting client `scopePath`.

Add an optional `scopeId` to `search_design_assets` and read tools. Validate the requested scope is readable, then filter the returned candidates using the persisted `scopePath`. Omit hidden records rather than returning partial metadata.

- [ ] **Step 5: Scope resources and graph rendering.**

Call the scope-filtered `listPersistedAssets`, `listPersistedProposals`, `listPersistedContextPacks`, and `listPersistedAssetLinks` inside `resources.ts`. In graph rendering, build nodes from only readable artifacts and include an edge only when both endpoints are in the readable node set. Add resource `specforge://architecture/scopes` to expose the permitted mock hierarchy as markdown.

- [ ] **Step 6: Run smoke and typecheck.**

Run: `pnpm --filter @specforge/mcp-server smoke`

Expected: printed JSON includes `scopedWriteToolWorked: true` and `deniedScopeWriteRejected: true`.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit MCP authorization.**

```bash
git add apps/mcp-server/src/auth.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/resources.ts apps/mcp-server/src/smoke.ts
git commit -m "feat: enforce architecture scope in MCP"
```

### Task 4: Seed the Huawei scope and migrate self-design data through MCP

**Files:**
- Modify: `prisma/data/specforge-self-design.ts`
- Modify: `apps/mcp-server/src/seed.ts`

**Interfaces:**
- Consumes `ArchitectureScopeRef` and MCP write schemas from Task 3.
- Produces a repeatable PostgreSQL seed in which every existing SpecForge asset belongs to the default Huawei application service.

- [ ] **Step 1: Add a seed assertion before implementation.**

At the end of `apps/mcp-server/src/seed.ts`, query persisted records and throw unless every self-design asset, proposal, context pack, and link has `applicationServiceId === "com.huawei.celon.desiner"`. The query must be read-only after the seed operations.

- [ ] **Step 2: Run the seed and verify the assertion fails.**

Run: `pnpm db:seed`

Expected: failure explaining that existing payloads do not carry the default service scope.

- [ ] **Step 3: Add scope metadata to all self-design seed payloads and calls.**

Define once in `prisma/data/specforge-self-design.ts`:

```ts
export const selfDesignArchitectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;
```

Attach `architectureScope: selfDesignArchitectureScope` to the domain, every data model/API/event/rule/state machine/integration/quality/observability/ADR record, the proposal, and the Context Pack. In `seed.ts`, pass the same object as the MCP envelope `architectureScope` for each upsert and as `sourceArchitectureScope` for every link. Make delete/reseed idempotent without deleting unrelated scoped data.

- [ ] **Step 4: Reseed and inspect scoped counts.**

Run: `pnpm db:seed`

Expected: exit code 0.

Run: `pnpm exec prisma db execute --stdin` with `SELECT "applicationServiceId", COUNT(*) FROM "DesignAsset" GROUP BY "applicationServiceId";`

Expected: the self-design records group under `com.huawei.celon.desiner`.

- [ ] **Step 5: Commit seed data.**

```bash
git add prisma/data/specforge-self-design.ts apps/mcp-server/src/seed.ts
git commit -m "feat: seed Huawei-scoped design assets"
```

### Task 5: Add scope-aware Web data access and architecture selector

**Files:**
- Create: `apps/web/lib/architecture-scope.ts`
- Create: `apps/web/components/architecture-scope-provider.tsx`
- Create: `apps/web/components/architecture-scope-switcher.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/lib/assets.ts`

**Interfaces:**
- Consumes Core hierarchy authorization and persisted scope columns.
- Produces `resolveWebScope(searchParams)`, `getPermittedScopes()`, and scoped versions of every public data helper in `assets.ts`.

- [ ] **Step 1: Write a focused helper test.**

Create `apps/web/lib/architecture-scope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSelectedScopeId } from "./architecture-scope";

describe("resolveSelectedScopeId", () => {
  it("falls back to the current Huawei application service for missing or unreadable input", () => {
    expect(resolveSelectedScopeId(undefined)).toBe("com.huawei.celon.desiner");
    expect(resolveSelectedScopeId("com.huawei.celon.runtime")).toBe("com.huawei.celon.desiner");
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails.**

Run: `pnpm --filter @specforge/web exec vitest run lib/architecture-scope.test.ts`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement server scope resolution and database filtering.**

`resolveSelectedScopeId` must accept a requested `scope` query string, verify inherited read access using the Core default actor, and otherwise return `com.huawei.celon.desiner`. `getPermittedScopes()` returns the default actor’s readable tree nodes. Extend all `assets.ts` helpers with an optional `scopeId` argument and use the resolved scope’s `scopePath` to filter:

```ts
where: { scopePath: { startsWith: selectedScope.scopePath } }
```

Use this predicate for `DesignAsset`, `Proposal`, `ContextPack`, and `AssetLink`. When building graph results, keep only readable nodes and only edges whose two endpoints remain. `dashboardStats(scopeId)` counts only scoped rows. A direct detail helper must throw a not-found error if the record is not readable in the selected scope.

- [ ] **Step 4: Implement the client provider and selector.**

The provider stores `specforge-architecture-scope` in localStorage and synchronizes changes to a `scope` query parameter using `router.replace`. The switcher is a compact native `<select>` in the AppShell top bar. Each option label is the full hierarchy breadcrumb, e.g. `Huawei Cloud / Celon / Platform / Design Center / com.huawei.celon.desiner`. It must use `useLanguage()` only for static UI copy and must not duplicate server authorization logic.

Mount `<ArchitectureScopeProvider>` inside `<LanguageProvider>` in `layout.tsx`, then place `<ArchitectureScopeSwitcher />` beside the language switcher in `app-shell.tsx`.

- [ ] **Step 5: Run helper test, Web typecheck, and lint.**

Run: `pnpm --filter @specforge/web exec vitest run lib/architecture-scope.test.ts`

Expected: selected-scope fallback test passes.

Run: `pnpm --filter @specforge/web typecheck`

Expected: exit code 0.

Run: `pnpm lint`

Expected: exit code 0, aside from the existing Next.js lint deprecation notice.

- [ ] **Step 6: Commit scope selector and data helpers.**

```bash
git add apps/web/lib/architecture-scope.ts apps/web/lib/architecture-scope.test.ts apps/web/components/architecture-scope-provider.tsx apps/web/components/architecture-scope-switcher.tsx apps/web/app/layout.tsx apps/web/components/app-shell.tsx apps/web/lib/assets.ts
git commit -m "feat: add architecture scope selector"
```

### Task 6: Propagate scope through every Web view and protect write affordances

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/assets/[type]/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/page.tsx`
- Modify: `apps/web/app/assets/[type]/new/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/edit/page.tsx`
- Modify: `apps/web/app/proposals/page.tsx`
- Modify: `apps/web/app/proposals/[id]/page.tsx`
- Modify: `apps/web/app/context-packs/page.tsx`
- Modify: `apps/web/app/context-packs/[id]/page.tsx`
- Modify: `apps/web/app/graph/page.tsx`
- Modify: `apps/web/app/governance/checks/page.tsx`
- Modify: `apps/web/components/asset-draft-form.tsx`
- Modify: `apps/web/components/asset-graph.tsx`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes `resolveSelectedScopeId`, `canWriteSelectedScope`, and scope-aware `assets.ts` helpers from Task 5.
- Produces consistent scope propagation through list/detail/graph/dashboard screens.

- [ ] **Step 1: Add a route-level regression case for aggregate scopes.**

In `apps/web/lib/architecture-scope.test.ts`, add a pure test asserting `canWriteSelectedScope("module-celon-designer") === false` and `canWriteSelectedScope("com.huawei.celon.desiner") === true`.

- [ ] **Step 2: Run the test to record the pre-change failure.**

Run: `pnpm --filter @specforge/web exec vitest run lib/architecture-scope.test.ts`

Expected: fail because write visibility helper is absent.

- [ ] **Step 3: Thread `scope` through server pages.**

Every page listed above accepts `searchParams: Promise<{ scope?: string; ...existingParams }>` and resolves it once. Pass the scope id to all data helpers. Preserve the query parameter in every list/detail/new/edit link with a helper such as:

```ts
export function withScope(href: string, scopeId: string): string {
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}scope=${encodeURIComponent(scopeId)}`;
}
```

The dashboard, proposal pages, context packs, governance checks, and graph must call the scoped helpers. Graph gets a third filter that is always the resolved selected scope; domain and asset type remain optional secondary filters.

- [ ] **Step 4: Make controls accurately reflect permission.**

Only render `New`, `Edit`, proposal creation, and the draft save control when `canWriteSelectedScope(scopeId)` is true. In an ancestor aggregate view, render a short localized read-only state near the page header and no mutation button. The asset draft JSON defaults must include:

```json
"architectureScope": {
  "applicationServiceId": "com.huawei.celon.desiner",
  "scopePath": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
}
```

Do not add direct database POST operations: leave draft saving as local draft behavior and make all persistent mutation guidance point to MCP.

- [ ] **Step 5: Update graph details and localized messages.**

Extend `AssetGraphNode` and graph node data to include `architectureScope`. In `asset-graph.tsx`, display application-service id and breadcrumb in node details. Add Chinese and English keys for scope label, selector label, aggregate read-only state, and application-service-only write explanation. Do not add raw English strings in client components.

- [ ] **Step 6: Verify with build-quality commands and HTTP responses.**

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm --filter @specforge/mcp-server smoke`

Expected: JSON confirms allowed and denied scoped MCP behavior.

Run: `Invoke-WebRequest http://localhost:3000/assets/data-models?scope=com.huawei.celon.desiner -UseBasicParsing`

Expected: HTTP 200 and page content contains `com.huawei.celon.desiner` or its visible breadcrumb.

- [ ] **Step 7: Commit Web integration.**

```bash
git add apps/web/app apps/web/components apps/web/lib apps/web/lib/i18n.ts packages/core/src/types.ts
git commit -m "feat: filter Web views by architecture scope"
```

### Task 7: Final reseed and end-to-end verification

**Files:**
- Modify only files required to fix verified failures from Tasks 1-6.

**Interfaces:**
- Consumes the completed Core, PostgreSQL, MCP, seed, and Web scope model.
- Produces final evidence for all acceptance criteria.

- [ ] **Step 1: Synchronize the local database and seed through MCP.**

Run: `pnpm db:generate`

Expected: Prisma generation succeeds.

Run: `pnpm db:push`

Expected: PostgreSQL schema synchronized.

Run: `pnpm db:seed`

Expected: seeded records all resolve to `com.huawei.celon.desiner`.

- [ ] **Step 2: Run complete static and MCP verification.**

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm --filter @specforge/mcp-server smoke`

Expected: tool/resource counts still print and scope-specific assertions are true.

- [ ] **Step 3: Run core tests and document environmental limitation if it recurs.**

Run: `pnpm test`

Expected: all core tests pass. If the known OneDrive sandbox path error prevents Vitest startup, preserve the exact error in the implementation handoff and rely on successful typecheck/smoke plus the test source review; do not claim the tests passed.

- [ ] **Step 4: Inspect final diff and commit only implementation files.**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: inspect and preserve pre-existing uncommitted proposal-localization/PostgreSQL files; stage only the files intentionally changed for this feature.

```bash
git add packages/core prisma apps/mcp-server apps/web
git commit -m "feat: add Huawei application architecture scope"
```

Do not run the final broad `git add` if it would absorb pre-existing user changes; replace it with an explicit path list generated from the reviewed diff.
