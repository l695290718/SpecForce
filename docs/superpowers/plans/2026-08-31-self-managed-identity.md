# Self-Managed Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator-managed local users, stable Agent identities, individually revocable Agent credentials, and exact Scope-operation authorization to the single-enterprise SpecForge deployment.

**Architecture:** PostgreSQL is the only identity, credential, authorization and audit authority. A new `@specforge/identity` package owns database-backed authentication and policy resolution; Core retains pure claim and exact-scope policy helpers. Web sessions and MCP Bearer credentials resolve through the same identity service, while every protected request obtains a current principal before reading or mutating design data.

**Tech Stack:** TypeScript, Node 22, Next.js 15, MCP SDK, Prisma/PostgreSQL, Zod, Node `crypto`, `@node-rs/argon2`, Vitest, Docker Compose.

## Global Constraints

- One deployment represents exactly one enterprise. The server resolves `SPECFORGE_ENTERPRISE_ID`; request input cannot choose it.
- PostgreSQL remains authoritative. NebulaGraph and all other graph stores remain derived and cannot authenticate or authorize.
- In local-account production mode, static principals, seed identities, shared Bearer secrets, default cursor secrets and unapproved stdio access fail closed.
- Each authorization decision is an exact `(enterpriseId, applicationServiceId, operation)` tuple. Do not combine Scope lists and operation lists independently.
- Web account administration is not a design-asset write boundary. ADRs, Proposals, Context Packs and typed links remain MCP-authored.
- English is canonical; every human-facing design record has a Chinese overlay.
- Before each runtime task, run `pnpm design-context:preflight` with the exact Designer Scope. After focused verification, synchronize matching MCP facts and close the same session.
- The local design-context seed fixture deliberately lacks `knowledge:consume`, while the old HTTP static-claims fixture includes it; neither is a managed user credential. Use the existing exact-Scope design preflight to start implementation. After Task 6 issues a managed Token through the front end, use that Token for `knowledge:consume` and bounded-read acceptance without weakening readiness.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/identity/src/types.ts` | Stable identity, credential, session, scoped-operation and audit types. |
| `packages/identity/src/policy.ts` | Pure exact tuple intersection and denial-safe result types. |
| `packages/identity/src/repository.ts` | Prisma-backed identity lookup, lock ordering, bootstrap, revocation and audit transactions. |
| `packages/identity/src/credentials.ts` | Password hashing, opaque credential generation/digests and secure session generation. |
| `packages/identity/src/service.ts` | Login, session, Agent credential, grant and principal resolution services. |
| `packages/identity/src/*.test.ts` | Unit and PostgreSQL integration tests for every identity invariant. |
| `prisma/schema.prisma` | Additive UserAccount, AgentIdentity, AgentCredential, ScopeOperationGrant, WebSession and SecurityAudit models. |
| `prisma/migrations/<timestamp>_self_managed_identity/migration.sql` | Additive tables, indexes and a read-only legacy-grant migration report table. |
| `packages/core/src/architecture/{types,principal,service}.ts` | Exact Scope-operation Core contract; legacy helper quarantine. |
| `apps/mcp-server/src/auth.ts` | Managed MCP credential resolver and request principal binding. |
| `apps/mcp-server/src/index.ts` | Production HTTP/stdio transport policy; no shared production bearer fallback. |
| `apps/web/lib/identity/*.ts` | Session resolver, CSRF/origin checks and server-only account administration adapters. |
| `apps/web/app/api/auth/**/route.ts` | Login, logout and session routes. |
| `apps/web/app/api/admin/**/route.ts` | Administrator account and exact-grant routes. |
| `apps/web/app/api/agent-credentials/**/route.ts` | Owner-only Agent credential issue, rotate and revoke routes. |
| `apps/web/lib/request-principal.ts` | Route-independent Web principal resolution using the identity service. |
| `apps/web/app/(auth)/**` | Minimal login and administrator account-management screens. |
| `scripts/identity-{bootstrap,migrate-report,cutover-check}.ts` | Protected local bootstrap, reviewed legacy mapping report and deployment safety validation. |
| `deploy/{compose.yaml,.env.example,Dockerfile}` | Required identity secrets, production mode startup validation and one-time bootstrap guidance. |
| `docs/adr/0046-self-managed-identity.md` | Update with implementation evidence only after the behavior is delivered. |

## Task 1: Open The Runtime Session Without Circular Credential Bootstrap

**Files:**

- Create: `.specforge/design-context/<new-session>.json` through the existing command.

**Interfaces:**

- Consumes: the existing exact-Scope design-context preflight and `adr-self-managed-identity`.
- Produces: one OPEN runtime `DesignChangeSession`; managed-Token knowledge-readiness evidence is produced after Task 6.

- [ ] **Step 1: Open a fresh implementation design session**

Run:

```powershell
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Implement self-managed identity and exact Scope-operation authorization" --affected "adr-self-managed-identity,api-specforge-mcp-tools,adr-design-context-preflight-gate,adr-system-knowledge-readiness-gate" --evidence "identity-flow-review,identity-runtime-tests,identity-managed-token-readiness"
```

Expected: one new OPEN session receipt. Do not synthesize a `knowledge:consume` claim or use the old static fixture as acceptance evidence. Commit no code in this task.

## Task 2: Introduce Identity Storage And Pure Operation Policy

**Files:**

- Create: `packages/identity/package.json`, `packages/identity/tsconfig.json`, `packages/identity/src/{types,policy,credentials,index}.ts`.
- Create: `packages/identity/src/{policy,credentials}.test.ts`.
- Modify: `pnpm-workspace.yaml`, `prisma/schema.prisma`, `packages/core/src/architecture/types.ts`, `packages/core/src/index.ts`.
- Create: `prisma/migrations/<timestamp>_self_managed_identity/migration.sql`.
- Test: `prisma/identity-schema.test.ts`.

**Interfaces:**

- Produces `ScopedOperationGrant = { applicationServiceId: string; operation: Permission }`.
- Produces `AuthorizationSubject = { subjectId: string; actorType: "user" | "agent"; ownerUserId?: string; authorizationVersion: bigint; credentialVersion?: bigint }`.
- Produces `evaluateExactOperation(input): AuthorizationDecision` where `AuthorizationDecision` is `{ allowed: true; scope: ArchitectureScopeRef } | { allowed: false; code: "SCOPE_ACCESS_DENIED" | "OPERATION_DENIED" | "CREDENTIAL_INACTIVE" }`.

- [ ] **Step 1: Write failing pure-policy and credential tests**

```ts
it("does not cross-product operations across scopes", () => {
  expect(evaluateExactOperation({
    requested: { applicationServiceId: "service-b", scopePath: "/b", operation: "governance:run" },
    ownerGrants: [{ applicationServiceId: "service-a", operation: "governance:run" }, { applicationServiceId: "service-b", operation: "asset:write" }],
    credentialCeiling: [{ applicationServiceId: "service-a", operation: "governance:run" }],
    registry: registryFor(["service-a", "service-b"])
  })).toEqual({ allowed: false, code: "OPERATION_DENIED" });
});

it("does not expose an opaque credential plaintext after creation", async () => {
  const created = await createOpaqueCredential();
  expect(created.secret).toMatch(/^sfat_/);
  expect(await verifyCredentialSecret(created.secret, created.digest)).toBe(true);
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @specforge/identity test -- policy credentials`

Expected: FAIL because the workspace package and exported functions do not exist.

- [ ] **Step 3: Add additive Prisma models and indexes**

Create `UserAccount`, `AgentIdentity`, `AgentCredential`, `ScopeOperationGrant`, `WebSession`, `SecurityAudit` and `LegacyScopeGrantMigrationReport`. Store only digests of passwords, sessions and Agent secrets. Foreign-key Agent credential to its stable Agent, Agent to owner user, session to user, and every operation grant to one current application-service ID. Add indexes for active credential lookup, user/session expiry, grant tuple lookup and chronological audit lookup. Do not alter `ActorScopeGrant`, `AgentServiceWorkspace` or existing authored asset keys.

Create `packages/identity/package.json` with the workspace name, `type: "module"`, `typecheck: "tsc -p tsconfig.json --noEmit"` and `test: "vitest run"`; add `@prisma/client`, `@specforge/core`, `@node-rs/argon2`, `zod` and Vitest at the appropriate dependency scope.

```prisma
model ScopeOperationGrant {
  id                   String   @id @default(cuid())
  subjectId            String
  applicationServiceId String
  operation            String
  createdByUserId      String
  createdAt            DateTime @default(now())
  @@unique([subjectId, applicationServiceId, operation])
  @@index([subjectId, applicationServiceId, operation])
}
```

- [ ] **Step 4: Implement package types, policy and cryptography**

Use `@node-rs/argon2` only for user passwords. Generate Agent and session secrets with `randomBytes(32).toString("base64url")`; persist a SHA-256 digest with a server pepper, and compare digests with `timingSafeEqual`. Use versioned credential/session records; never place a secret in a serialized principal.

```ts
export function evaluateExactOperation(input: ExactOperationInput): AuthorizationDecision {
  const scope = input.registry.scopes.find((item) => item.id === input.requested.applicationServiceId);
  if (!scope || scope.level !== "applicationService" || scope.scopePath !== input.requested.scopePath) return { allowed: false, code: "SCOPE_ACCESS_DENIED" };
  const grants = (items: ScopedOperationGrant[]) => items.some((grant) => grant.applicationServiceId === scope.id && grant.operation === input.requested.operation);
  return grants(input.ownerGrants) && grants(input.credentialCeiling)
    ? { allowed: true, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } }
    : { allowed: false, code: "OPERATION_DENIED" };
}
```

- [ ] **Step 5: Validate schema and package tests**

Run:

```powershell
pnpm db:generate
pnpm exec prisma validate
pnpm --filter @specforge/identity test
```

Expected: Prisma validates and all new policy/credential tests pass.

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations packages/identity pnpm-workspace.yaml packages/core/src/architecture/types.ts packages/core/src/index.ts
git commit -m "feat: add identity storage and scoped operation policy"
```

## Task 3: Build Transactional Identity, Grant And Revocation Services

**Files:**

- Create: `packages/identity/src/{repository,service,repository.integration}.ts`.
- Create: `packages/identity/src/{service,repository}.test.ts`.
- Modify: `packages/identity/src/index.ts`, `apps/mcp-server/package.json`, `apps/web/package.json`.

**Interfaces:**

- Produces `resolveAgentPrincipal(rawToken, request): Promise<ResolvedAgentPrincipal>`.
- Produces `createAgentCredential(input): Promise<{ credentialId: string; secret: string; expiresAt: Date }>`.
- Produces `revokeCredential`, `disableUser`, `resetPassword`, `grantOperation` and `revokeOperation`.
- `ResolvedAgentPrincipal` contains stable Agent subject, owner ID, credential ID/version, exact operation grants and an authorization revision; it contains no raw secret.

- [ ] **Step 1: Write failing service and integration tests**

```ts
it("rejects a reused token after revoke commits", async () => {
  const { secret, credentialId } = await service.createAgentCredential(fixture);
  await expect(service.resolveAgentPrincipal(secret, readRequest)).resolves.toMatchObject({ actorId: fixture.agentId });
  await service.revokeCredential({ credentialId, actor: fixture.admin, reason: "rotation" });
  await expect(service.resolveAgentPrincipal(secret, readRequest)).rejects.toThrow("CREDENTIAL_INACTIVE");
});

it("keeps an Agent identity and workspace owner stable during rotation", async () => {
  const first = await service.createAgentCredential(fixture);
  const second = await service.rotateAgentCredential({ oldCredentialId: first.credentialId, actor: fixture.owner });
  expect(second.agentId).toBe(fixture.agentId);
  expect(await workspaceOwner(fixture.agentId)).toBe(fixture.agentId);
});
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm --filter @specforge/identity test -- service repository`

Expected: FAIL because the service and transactional repository do not exist.

- [ ] **Step 3: Implement guarded transactions and audit**

Lock user, Agent and credential guard rows in lexicographic `(table, id)` order with PostgreSQL row locks. `revokeCredential`, `disableUser`, password reset and grant reduction use the identical guard order. A mutation reloads active user, Agent, credential and grants inside its transaction, evaluates the exact tuple, writes its business change and appends a redacted `SecurityAudit` row before committing. An audit failure aborts the transaction.

```ts
export async function authorizeMutation<T>(input: MutationAuthorizationInput<T>): Promise<T> {
  return input.prisma.$transaction(async (tx) => {
    const state = await lockAndReloadIdentity(tx, input.guardIds);
    const decision = evaluateExactOperation(state.authorizationInput(input.request));
    if (!decision.allowed) throw new IdentityError(decision.code);
    const result = await input.mutate(tx, state);
    await appendSecurityAudit(tx, { ...input.audit, outcome: "ALLOW" });
    return result;
  }, { isolationLevel: "Serializable" });
}
```

- [ ] **Step 4: Enforce owner-aware review identity**

Extend the candidate-review caller adapter so it supplies stable Agent ID and owner user ID. Reject T1 when the reviewing Agent equals the generator or shares the generator's owner; preserve current T2/T3 human requirement. Historical records without owner provenance take the existing human-review path and cannot claim independent Agent review.

- [ ] **Step 5: Run integration tests against Docker PostgreSQL**

Run: `pnpm --filter @specforge/identity test --runInBand`

Expected: credential revocation, user disable, rotation, owner-aware T1 separation, audit rollback and both revoke/write race orders pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/identity apps/mcp-server/package.json apps/web/package.json
git commit -m "feat: add transactional identity and credential lifecycle"
```

## Task 4: Replace Mixed Scope Authorization With One Current Registry Path

**Files:**

- Modify: `packages/core/src/architecture/{types,principal,service}.ts`.
- Create: `packages/core/src/architecture/operation-policy.test.ts`.
- Create: `packages/identity/src/registry.ts`, `packages/identity/src/registry.test.ts`.
- Modify: `apps/mcp-server/src/{persistence,auth}.ts`, `apps/web/lib/3a/principal.ts`.

**Interfaces:**

- Produces `resolveScopeRegistry(tx): Promise<ArchitectureScopeRegistry>` from `ArchitectureScope` rows.
- Produces `authorizeExactOperation(principal, request, registry): Promise<ArchitectureScopeRef>`.
- Legacy `hasScopeAccess` is allowed only in development fixture construction; no protected production call site may use inherited authorization.

- [ ] **Step 1: Write failing regression tests**

```ts
it("does not inherit a product grant to a new application service", async () => {
  const decision = await authorizeExactOperation(parentGrantedPrincipal, {
    applicationServiceId: "new-service", scopePath: "/product/new-service", operation: "asset:read"
  }, registry);
  expect(decision).toEqual({ allowed: false, code: "SCOPE_ACCESS_DENIED" });
});

it("fails closed when an asset Scope no longer exists", () => {
  expect(() => assertProtectedAssetScope({ applicationServiceId: "missing", scopePath: "/missing" }, registry)).toThrow("SCOPE_ACCESS_DENIED");
});
```

- [ ] **Step 2: Run the failing regression tests**

Run: `pnpm --filter @specforge/core test -- operation-policy`

Expected: FAIL because current helpers consult static mock registry and inherited grants.

- [ ] **Step 3: Implement exact operation contracts and registry adapter**

Keep Core deterministic: it validates one registry snapshot and one supplied operation tuple. The identity repository supplies a database snapshot per request. Remove production calls to `scopeById()` without an injected registry and make `filterByReadableScope` reject missing Scope assets. Keep mock registry only for tests and explicit development seed construction.

- [ ] **Step 4: Create reviewed legacy mapping reports**

`scripts/identity-migrate-report.ts` must enumerate each old `ActorScopeGrant`, resolve its current application-service descendants, list proposed exact operation tuples and record registry/grant version. It performs no writes. `scripts/identity-apply-migration.ts` accepts only an administrator-approved report ID whose versions still match, locks authorization/registry changes, writes `ScopeOperationGrant` rows and appends audit records. New application services are excluded from historical snapshots.

- [ ] **Step 5: Run Core, registry and report tests**

Run:

```powershell
pnpm --filter @specforge/core test -- principal operation-policy
pnpm --filter @specforge/identity test -- registry
pnpm exec vitest run scripts/identity-migrate-report.test.ts scripts/identity-apply-migration.test.ts
```

Expected: exact-only checks pass; parent inheritance, missing Scope access and stale report application fail closed.

- [ ] **Step 6: Commit**

```powershell
git add packages/core packages/identity apps/mcp-server/src/persistence.ts apps/mcp-server/src/auth.ts apps/web/lib/3a/principal.ts scripts
git commit -m "feat: enforce exact scoped operation grants"
```

## Task 5: Integrate Managed Credentials Into MCP Transports

**Files:**

- Modify: `apps/mcp-server/src/{auth,index}.ts`.
- Create: `apps/mcp-server/src/identity/{mcp-resolver,transport-policy}.ts`.
- Create: `apps/mcp-server/src/identity/{mcp-resolver,transport-policy}.test.ts`.
- Modify: `apps/mcp-server/src/{auth,tools,federation/tools}.test.ts`.

**Interfaces:**

- `resolveMcpBearer(request: Request): Promise<ScopedPrincipal>` resolves `Authorization: Bearer sfat_<secret>` through `@specforge/identity`.
- `assertMcpTransportMode(config): void` rejects production static/seed/shared-token configuration.
- Each MCP tool execution receives its principal through `withRequestPrincipal`; no tool falls back to `allowAllPolicy` in local-account production mode.

- [ ] **Step 1: Write failing MCP tests**

```ts
it("re-authorizes every request on a reused HTTP MCP transport", async () => {
  const transport = await openMcpTransport(activeAgentToken);
  await expect(transport.call("search_design_assets", readInput)).resolves.toBeDefined();
  await identity.revokeCredential(activeAgentToken.credentialId);
  await expect(transport.call("search_design_assets", readInput)).rejects.toThrow("CREDENTIAL_INACTIVE");
});

it("refuses static or seed authentication in local-account production mode", () => {
  expect(() => assertMcpTransportMode({ mode: "local-account", seed: true })).toThrow("PRODUCTION_AUTH_CONFIG_INVALID");
});
```

- [ ] **Step 2: Run the failing MCP tests**

Run: `pnpm exec vitest run apps/mcp-server/src/auth.test.ts apps/mcp-server/src/identity/mcp-resolver.test.ts apps/mcp-server/src/identity/transport-policy.test.ts`

Expected: FAIL because HTTP uses `SPECFORGE_MCP_BEARER_TOKEN` and stdio is seed-capable.

- [ ] **Step 3: Implement credential resolver and transport policy**

Parse only a Bearer secret, lookup its digest and active state, resolve current agent/owner/grants from PostgreSQL, then bind it with `withRequestPrincipal`. Retain seed/static behavior only when `SPECFORGE_IDENTITY_MODE=development`; startup rejects it when `SPECFORGE_IDENTITY_MODE=local-account`. Stdio in local-account mode accepts a managed credential through a protected inherited file descriptor or is refused; it never reads a token from a command argument.

- [ ] **Step 4: Cover all MCP authorization paths**

Route ordinary asset reads/writes, MCP design writes, graph reads, exports, governance actions and knowledge tools through operation checks. Keep readiness as an additional `knowledge:consume` gate, not a replacement for authentication. Denials return the existing no-leak shapes and no target body.

- [ ] **Step 5: Run focused MCP verification**

Run:

```powershell
pnpm --filter @specforge/mcp-server typecheck
pnpm exec vitest run apps/mcp-server/src/auth.test.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/identity/*.test.ts
```

Expected: token revocation, expiry, wrong Scope, wrong operation, static/seed production rejection and no-leak denials pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/mcp-server/src apps/mcp-server/package.json
git commit -m "feat: authenticate MCP with managed agent credentials"
```

## Task 6: Add Web Sessions And Secure Local Administration

**Files:**

- Create: `apps/web/lib/identity/{server,csrf,forms}.ts`.
- Create: `apps/web/lib/identity/{server,csrf}.test.ts`.
- Modify: `apps/web/lib/{request-principal.ts,3a/principal.ts}`.
- Create: `apps/web/app/api/auth/{login,logout}/route.ts`, `apps/web/app/api/admin/{users,grants}/route.ts`, `apps/web/app/api/agent-credentials/{agents,issue,rotate,revoke}/route.ts`.
- Create: `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(admin)/identity/page.tsx`.
- Modify: `apps/web/middleware.ts` if it exists; otherwise create it only for route protection and no business authorization.

**Interfaces:**

- `resolveWebSession(request): Promise<ScopedPrincipal>` resolves an opaque `__Host-specforge_session` cookie via `@specforge/identity`.
- `assertCsrfRequest(request, session): void` validates Origin and a double-submit CSRF value for mutations.
- `requireRecentAuthentication(session, now): void` protects grants, credential issuance, password reset and account state changes.

- [ ] **Step 1: Write failing session and route tests**

```ts
it("does not resolve a disabled user's old session", async () => {
  const session = await identity.login({ login: "architect", password: "correct" });
  await identity.disableUser({ userId: session.userId, actor: admin });
  await expect(resolveWebSession(cookie(session.secret))).rejects.toThrow("SESSION_INACTIVE");
});

it("rejects a grant mutation without matching origin and CSRF token", async () => {
  const response = await POST(grantRequest({ origin: "https://evil.example", csrf: "wrong" }));
  expect(response.status).toBe(403);
});
```

- [ ] **Step 2: Run the failing Web tests**

Run: `pnpm exec vitest run apps/web/lib/identity/*.test.ts apps/web/app/api/auth/**/*.test.ts apps/web/app/api/admin/**/*.test.ts`

Expected: FAIL because there is no local session resolver or account routes.

- [ ] **Step 3: Implement sessions and route adapters**

Login verifies an enabled local account and password, creates a session with idle/absolute expiry and emits a `__Host-` HttpOnly, Secure, SameSite=Lax cookie in production. Logout revokes it. Do not put Agent tokens in Cookies, HTML, URLs, local storage or client props. `getRequestPrincipal` and `resolveRequestPrincipal` use the same server-only resolver for every Web route; `resolveWebAuthMode()` rejects `seed` and `static` in local-account production.

- [ ] **Step 4: Implement administration endpoints and minimal screens**

Only an authenticated platform administrator may create/disable users, grant/revoke exact operation tuples or run password reset. An authenticated user with recent authentication may create an Agent identity only for themselves, issue one displayed secret only for an Agent they own, and rotate/revoke only their own credentials. The server rejects a requested Token ceiling that is not a subset of the user's current exact Scope-operation grants. All mutations require CSRF/origin checks and append `SecurityAudit`. The UI displays credential metadata and expiry, never re-displays a secret, and gives the secret once in a server response body intended for immediate copying.

- [ ] **Step 5: Add first-admin and recovery commands**

`scripts/identity-bootstrap.ts` reads first-admin credentials from stdin, acquires a `DeploymentBootstrap` lock and creates the account exactly once with zero design grants. `scripts/identity-recover.ts` requires direct local database access, resets a named administrator and revokes its sessions/owned credentials. Neither accepts a password/token in its command line; both redact errors and write audit rows.

- [ ] **Step 6: Run Web and command tests**

Run:

```powershell
pnpm --filter @specforge/web typecheck
pnpm exec vitest run apps/web/lib/identity apps/web/app/api/auth apps/web/app/api/admin scripts/identity-bootstrap.test.ts scripts/identity-recover.test.ts
```

Expected: login, logout, expiry, disable, CSRF, recent-auth, one-time bootstrap, last-admin protection and recovery invalidation pass.

- [ ] **Step 7: Verify a front-end-issued Token against MCP readiness**

Create an enabled user with an exact `knowledge:consume` grant on the Designer Scope. Through the owner route, create that user's Agent and issue its credential. Call `evaluate_system_knowledge_readiness` and `read_system_knowledge` through HTTP MCP using its Bearer Token.

Expected: the Token resolves to its stable Agent and cannot exceed the owner's Scope-operation grants. A readiness result of `ALLOW`, `SOURCE_CHECK_REQUIRED`, or `BLOCKED` is valid according to the selected profile evidence; `PERMISSION_DENIED` is not. Record the result and waterline as acceptance evidence.

Run:

```powershell
pnpm exec vitest run apps/web/app/api/agent-credentials apps/mcp-server/src/identity/mcp-resolver.test.ts apps/mcp-server/src/knowledge-readiness/readiness.e2e.test.ts
```

- [ ] **Step 8: Commit**

```powershell
git add apps/web apps/mcp-server/package.json packages/identity scripts
git commit -m "feat: add local web sessions and identity administration"
```

## Task 7: Perform Reviewed Migration, Production Cutover And Deployment Validation

**Files:**

- Modify: `deploy/{compose.yaml,.env.example,Dockerfile}`.
- Create: `deploy/scripts/verify-identity-config.ps1`.
- Create: `deploy/scripts/verify-identity-config.test.ts`.
- Modify: `scripts/identity-{migrate-report,apply-migration,cutover-check}.ts`.
- Modify: `README.md`, `docs/deployment.md` if present; otherwise create `docs/deployment.md`.

**Interfaces:**

- `identity-migrate-report` returns `{ reportId, registryVersion, grantVersion, proposedGrants, excludedNewServices }` and writes no grants.
- `identity-apply-migration --report <id>` applies exactly one approved, current report under authorization/registry lock.
- `identity-cutover-check` returns a nonzero exit code if local-account production has seed/static/shared bearer/default cursor secret/missing TLS secret configuration.

- [ ] **Step 1: Write failing migration and deployment tests**

```ts
it("rejects applying a migration report after registry version changes", async () => {
  const report = await createLegacyGrantReport();
  await addApplicationServiceAfter(report.registryVersion);
  await expect(applyLegacyGrantReport(report.id, admin)).rejects.toThrow("MIGRATION_REPORT_STALE");
});

it("rejects production compose config with a shared MCP bearer", () => {
  expect(() => verifyIdentityConfig({ identityMode: "local-account", mcpBearerToken: "shared" })).toThrow("PRODUCTION_AUTH_CONFIG_INVALID");
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run scripts/identity-migrate-report.test.ts scripts/identity-apply-migration.test.ts deploy/scripts/verify-identity-config.test.ts`

Expected: FAIL until report-version checks and production startup validation exist.

- [ ] **Step 3: Implement maintenance-aware cutover**

Require an approved report and maintenance mode. Stop accepting old sessions/transports, invalidate legacy cursors, verify no active static/seed source, apply only report tuples, then set `SPECFORGE_IDENTITY_MODE=local-account`. If cutover fails, preserve revocations and grant authority while returning maintenance status; never restore shared credentials. Set explicit production cursor keys and identity pepper references through secrets, not Compose literals.

- [ ] **Step 4: Validate the packaged deployment**

Run:

```powershell
pnpm exec vitest run scripts/identity-migrate-report.test.ts scripts/identity-apply-migration.test.ts deploy/scripts/verify-identity-config.test.ts
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/verify-identity-config.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1
```

Expected: stale report, static/seed/shared bearer/default-secret configurations fail; the sanitized local-account production configuration passes without exposing credential values.

- [ ] **Step 5: Commit**

```powershell
git add deploy scripts README.md docs/deployment.md
git commit -m "feat: validate local identity production cutover"
```

## Task 8: Consolidate Verification And Close Governance Records

**Files:**

- Modify: `docs/adr/0046-self-managed-identity.md`, `docs/TODO.md`, `docs/design-facts/baseline-manifest.json`.
- Modify through MCP: `adr-self-managed-identity`, `proposal-self-managed-identity`, `context-pack-self-managed-identity` and their typed links.

**Interfaces:**

- Consumes: the Task 1 implementation session ID and exact command results.
- Produces: a `CONVERGED` closure only when all required checks and MCP reconciliation succeed.

- [ ] **Step 1: Run the consolidated stage verification once**

Run:

```powershell
pnpm db:generate
pnpm typecheck
pnpm exec vitest run packages/identity packages/core/src/__tests__/principal.test.ts apps/mcp-server/src/auth.test.ts apps/mcp-server/src/identity apps/mcp-server/src/federation/tools.test.ts apps/web/lib/identity apps/web/app/api/auth apps/web/app/api/admin scripts/identity-migrate-report.test.ts scripts/identity-apply-migration.test.ts deploy/scripts/verify-identity-config.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'
git diff --check
```

Expected: all tests pass and `git diff --check` is clean. Do not call the stage complete if a production-mode negative test is skipped.

- [ ] **Step 2: Update evidence accurately**

Replace design-only wording in ADR-0046 only with exact commands, results, session ID, local versus production distinction and any remaining deferred comparison work. Set Proposal status to `implemented` only after runtime tests pass. Keep comparison as a separate backlog record; do not claim it in this closure.

- [ ] **Step 3: Synchronize and reconcile exact-Scope design records**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS = 'self-managed-identity'
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/sync-design-facts.ts
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/reconcile-design-facts.ts
```

Expected: `complete`, then no missing/mismatched/out-of-scope/blocked records. Read back ADR, Proposal and Context Pack and compare the English decision, Chinese localization and exact Scope.

- [ ] **Step 4: Close the same session**

Run:

```powershell
pnpm design-context:close -- --session <Task-1-session-id> --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --status CONVERGED --evidence "pnpm db:generate=PASS,pnpm typecheck=PASS,identity-focused-vitest=PASS,git diff --check=PASS,identity-design-sync=complete,identity-design-reconcile=missing0-mismatched0-outOfScope0-blocked0"
```

Expected: session status `CONVERGED`. If readiness, sync or verification fails, close as `BLOCKED` with the concrete reason and retry trigger; do not claim implementation complete.

- [ ] **Step 5: Commit governance facts**

```powershell
git add docs/adr/0046-self-managed-identity.md docs/TODO.md docs/design-facts/baseline-manifest.json
git commit -m "docs: record self-managed identity delivery"
```

## Deferred Follow-On Plan

After Task 8 is converged, write a separate plan for multi-service comparison. It must add no authorization shortcuts: validate all explicitly selected services before body reads, bind continuations to the complete selection and per-service versions, retain source/coverage/trust provenance, report unavailable as unknown rather than zero, and apply knowledge readiness separately per Scope/Profile. OIDC, multi-tenant SaaS, CodeHub integration and live connector rollout remain outside this plan.

## Plan Self-Review

- Spec coverage: Tasks 2-7 implement every first-increment requirement from the approved design: local accounts, opaque credentials, stable delegation, exact tuples, revoke/write ordering, hardened sessions/bootstrap, legacy migration and production cutover. Task 8 covers bilingual governance and MCP closure. Cross-service comparison is explicitly deferred to its own plan.
- Placeholder scan: no `TBD`, `TODO` or unbounded “test the above” steps. Timestamped Prisma migration path is intentionally generated by `prisma migrate dev`; it is not an unresolved design decision.
- Type consistency: `ScopedOperationGrant`, `AuthorizationSubject`, `AuthorizationDecision`, `evaluateExactOperation`, `resolveAgentPrincipal`, `resolveWebSession`, registry version and report ID are introduced before later tasks consume them.
