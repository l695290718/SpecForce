# Strict Application-Service Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every normal SpecForge read and write operate in one explicit, authorized Huawei application-service scope.

**Architecture:** A shared Web scope resolver validates an application-service id against the same core grant model used by MCP. Repository functions receive that resolved scope explicitly and apply indexed database filters; they do not consult the in-memory legacy store. MCP schemas likewise require a service scope for writes and apply it to reads. Cross-service aggregation remains absent from normal views and is deferred to explicit impact analysis.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma/PostgreSQL, MCP SDK, Zod, Vitest.

## Global Constraints

- A normal dashboard, catalog, search, governance view, or graph is bound to exactly one application service.
- Missing, unknown, non-service, and unauthorized scope ids are rejected. No repository, API, or MCP fallback may select `com.huawei.celon.desiner`.
- All persisted assets, proposals, context packs, and links carry `applicationServiceId` and `scopePath`.
- The mock Agent has inherited read access to the Celon Designer module and write access only to `com.huawei.celon.desiner`.
- Cross-service reads are not a normal-view feature; only a future explicit impact-analysis flow may traverse authorized targets.

---

### Task 1: Define and Test the Explicit Web Scope Context

**Files:**
- Create: `apps/web/lib/scope.ts`
- Create: `apps/web/lib/__tests__/scope.test.ts`
- Modify: `packages/core/src/__tests__/architecture-scope.test.ts`

**Interfaces:**
- Produces `requireReadableApplicationService(scopeId: string): ResolvedApplicationServiceScope`.
- Produces `scopeDatabaseWhere(scope: ResolvedApplicationServiceScope): { applicationServiceId: string; scopePath: { startsWith: string } }`.

- [ ] **Step 1: Write failing tests**

```ts
expect(() => requireReadableApplicationService("unknown")).toThrow("Application-service scope is required");
expect(() => requireReadableApplicationService("module-celon-designer")).toThrow("must be an application service");
expect(requireReadableApplicationService("com.huawei.celon.policyhub").id).toBe("com.huawei.celon.policyhub");
```

- [ ] **Step 2: Run the focused test and verify it fails because the resolver does not exist.**

Run: `node_modules/.bin/vitest.CMD run apps/web/lib/__tests__/scope.test.ts`

- [ ] **Step 3: Implement the resolver from `huaweiArchitectureScopes`, `defaultHuaweiActor`, and shared core access checks.**

```ts
export function requireReadableApplicationService(scopeId: string) {
  const scope = scopeById(scopeId);
  if (!scope) throw new Error("Application-service scope is required or unknown.");
  if (scope.level !== "applicationService") throw new Error("Scope must be an application service.");
  if (!hasScopeAccess(defaultHuaweiActor, scope, "read")) throw new Error("Scope read is not authorized.");
  return scope;
}
```

- [ ] **Step 4: Run focused tests and the core authorization tests.**

Run: `node_modules/.bin/vitest.CMD run apps/web/lib/__tests__/scope.test.ts packages/core/src/__tests__/architecture-scope.test.ts`

### Task 2: Make Web Repositories Strictly Service-Scoped

**Files:**
- Modify: `apps/web/lib/assets.ts`
- Create: `apps/web/lib/__tests__/assets-scope.test.ts`

**Interfaces:**
- Changes `getRouteAssetsWithDatabase(route, scopeId)`, `getRouteAssetWithDatabase(route, id, scopeId)`, `getProposalsWithDatabase(scopeId)`, `getProposalWithDatabase(id, scopeId)`, `getContextPacksWithDatabase(scopeId)`, `getContextPackWithDatabase(id, scopeId)`, `dashboardStats(scopeId)`, and `getAssetGraphWithDatabase(scopeId, domainId?, assetType?)` to require an explicit scope.

- [ ] **Step 1: Write failing repository tests**

```ts
await expect(getRouteAssetsWithDatabase("apis", policyHubId)).resolves.toEqual([]);
await expect(getRouteAssetWithDatabase("apis", designerApiId, policyHubId)).rejects.toThrow("Asset not found");
await expect(dashboardStats(policyHubId)).resolves.toEqual(expect.arrayContaining([{ type: "api", count: 0 }]));
```

- [ ] **Step 2: Run the focused test and verify it exposes legacy/default leakage.**

Run: `node_modules/.bin/vitest.CMD run apps/web/lib/__tests__/assets-scope.test.ts`

- [ ] **Step 3: Apply `requireReadableApplicationService` to every query and remove `getStore`, `listAssets`, and fallback reads from database-backed helpers.**

```ts
const scope = requireReadableApplicationService(scopeId);
const rows = await prisma.proposal.findMany({
  where: { applicationServiceId: scope.id, scopePath: { startsWith: scope.scopePath } },
  orderBy: { createdAt: "asc" }
});
```

- [ ] **Step 4: Filter graph links by source service scope and retain only nodes whose records are in the selected service.**

- [ ] **Step 5: Run focused repository tests.**

Run: `node_modules/.bin/vitest.CMD run apps/web/lib/__tests__/assets-scope.test.ts`

### Task 3: Propagate Scope Through Every Web Route and Link

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/assets/[type]/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/edit/page.tsx`
- Modify: `apps/web/app/proposals/page.tsx`
- Modify: `apps/web/app/proposals/[id]/page.tsx`
- Modify: `apps/web/app/context-packs/page.tsx`
- Modify: `apps/web/app/context-packs/[id]/page.tsx`
- Modify: `apps/web/app/graph/page.tsx`
- Modify: `apps/web/app/governance/checks/page.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/components/architecture-scope-switcher.tsx`

**Interfaces:**
- Each server page consumes `searchParams.scope: string` and resolves it before requesting data.
- Every generated asset, proposal, graph, governance, and quick-link URL preserves `scope`.

- [ ] **Step 1: Add a failing page/helper test asserting that an asset detail URL cannot be fetched without its selected service scope.**

```ts
expect(buildScopedHref("/assets/apis/api-1", policyHubId)).toBe("/assets/apis/api-1?scope=com.huawei.celon.policyhub");
```

- [ ] **Step 2: Run it and verify it fails because the shared scoped URL helper does not exist.**

- [ ] **Step 3: Add `buildScopedHref` and use it for all page-generated links and filter forms. Preserve `scope` alongside graph and governance filters.**

- [ ] **Step 4: Resolve scope once per page, pass it to every repository function, and render a clear invalid-scope error instead of querying a default service.**

- [ ] **Step 5: Run Web typecheck.**

Run: `node_modules/.bin/tsc.CMD -p apps/web/tsconfig.json --noEmit`

### Task 4: Enforce Scope at MCP Read and Write Boundaries

**Files:**
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/resources.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/smoke.ts`
- Modify: `packages/core/src/__tests__/mcp-services.test.ts`

**Interfaces:**
- All mutation tool inputs require `architectureScope.applicationServiceId`.
- All read/search tool inputs require `applicationServiceId` and use it to filter results.
- Resource URIs contain an explicit application-service id.

- [ ] **Step 1: Add failing MCP tests**

```ts
expect(await callTool("search_design_assets", { applicationServiceId: policyHubId })).not.toContainEqual(expect.objectContaining({ id: designerAssetId }));
await expect(callTool("upsert_design_asset", { asset: designerAsset })).rejects.toThrow("Architecture scope is required");
```

- [ ] **Step 2: Run MCP tests and confirm the old schemas either accept missing scope or leak records.**

- [ ] **Step 3: Define a shared Zod `applicationServiceIdSchema`, validate readable/writable scope through persistence helpers, and add Prisma scope predicates to each list/detail/link query.**

- [ ] **Step 4: Update smoke calls and resources to provide explicit service scope.**

- [ ] **Step 5: Run MCP tests and smoke test.**

Run: `node_modules/.bin/vitest.CMD run packages/core/src/__tests__/mcp-services.test.ts`

### Task 5: Seed Isolated Service Fixtures and Verify End to End

**Files:**
- Modify: `apps/mcp-server/src/seed.ts`
- Modify: `docs/superpowers/specs/2026-07-12-huawei-architecture-scope-design.md`

**Interfaces:**
- The Designer, Spec Studio, Policy Hub, and Integration Gateway each have at least one scoped asset written through MCP.
- No seed record has a null `applicationServiceId` or `scopePath`.

- [ ] **Step 1: Add a failing seed assertion that checks each mock service has only its own records.**

- [ ] **Step 2: Run it to show the additional service workspaces are empty or mixed.**

- [ ] **Step 3: Add minimal service-specific fixtures and write assets, proposals, context packs, and same-service links through MCP with the explicit envelope.**

- [ ] **Step 4: Reseed local PostgreSQL and query counts by `applicationServiceId`.**

Run: `node_modules/.bin/tsx.CMD apps/mcp-server/src/seed.ts`

- [ ] **Step 5: Run all targeted tests, Prisma client generation, Web typecheck, and HTTP checks for Designer and Policy Hub.**

Run: `node_modules/.bin/prisma.CMD generate`

Run: `node_modules/.bin/tsc.CMD -p apps/web/tsconfig.json --noEmit`

Run: `Invoke-WebRequest 'http://localhost:3000/?scope=com.huawei.celon.desiner' -UseBasicParsing`

Run: `Invoke-WebRequest 'http://localhost:3000/?scope=com.huawei.celon.policyhub' -UseBasicParsing`
