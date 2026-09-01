# Settings Identity Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty Settings experience with one bilingual control-plane workspace for owned Agents and credentials, users and exact-Scope grants, and redacted runtime information.

**Architecture:** Keep PostgreSQL and `IdentityService` authoritative. Add bounded read models to the identity package, expose them through authenticated same-origin Web APIs, and render one Settings client workspace whose URL-selected sections reuse the existing mutation routes. Retire the duplicate `/identity` UI through a compatibility redirect.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Prisma 6, Tailwind CSS, Vitest, `@specforge/identity`.

## Global Constraints

- Exact owning Scope is `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for identities, grants, credential metadata, and security audit records.
- Identity mutations use same-origin Web APIs with Cookie, Origin, and CSRF enforcement; they are not MCP design-asset writes.
- Token plaintext appears only in the immediate issue or rotation response and is never persisted in browser storage, URLs, logs, analytics, or list responses.
- No UI control grants authority; all ownership, exact-Scope, operation-ceiling, recent-session, and audit checks remain server-side.
- Every human-facing label, state, and safe error summary has complete English and Chinese messages.
- Preserve unrelated worktree changes in `deploy/three-a-bootstrap.Dockerfile`, `docs/governance-briefing.md`, and `.tmp/`.
- Use design session `design-change-session:004276c3-4549-41d9-8e92-eb09acf06503` and close it only after focused verification and MCP synchronization converge.

## File Structure

- Modify `packages/identity/src/types.ts`: public safe read-model interfaces.
- Modify `packages/identity/src/service.ts`: bounded owner/admin list methods without secret fields.
- Create `packages/identity/src/service-read.test.ts`: read-model scope, ownership, ordering, and secret-redaction tests.
- Modify `apps/web/app/api/agent-credentials/agents/route.ts`: add owned-Agent `GET` while retaining `POST`.
- Modify `apps/web/app/api/admin/users/route.ts`: add administrator-only user/grant `GET` while retaining `POST`.
- Modify `apps/web/app/api/admin/grants/route.ts`: add audited exact-grant `DELETE` while retaining `POST`.
- Create `apps/web/app/api/identity-routes.test.ts`: route authorization, safe shape, and error status tests.
- Replace `apps/web/app/settings/page.tsx`: server Settings shell and redacted runtime configuration.
- Create `apps/web/components/settings/settings-workspace.tsx`: section navigation and data refresh boundary.
- Create `apps/web/components/settings/agents-panel.tsx`: Agent creation and credential lifecycle UI.
- Create `apps/web/components/settings/users-panel.tsx`: user creation and exact-Scope grant UI.
- Create `apps/web/components/settings/runtime-panel.tsx`: read-only runtime signals.
- Create `apps/web/components/settings/settings-state.ts`: URL, request, error-code, and one-time-secret state helpers.
- Create `apps/web/components/settings/settings-state.test.ts`: deterministic client-state tests.
- Modify `apps/web/app/(admin)/identity/page.tsx`: compatibility redirect only.
- Modify `apps/web/lib/i18n.ts`: complete Chinese and English settings messages.
- Create `apps/web/lib/__tests__/settings-page.test.tsx`: server render, section, redaction, and redirect tests.
- Modify `docs/adr/0046-self-managed-identity.md`: implemented Settings delivery and evidence after verification.
- Modify `docs/superpowers/specs/2026-09-01-settings-identity-control-plane-design.md`: implementation evidence and final status after verification.

---

### Task 1: Safe Identity Read Models

**Files:**
- Modify: `packages/identity/src/types.ts`
- Modify: `packages/identity/src/service.ts`
- Create: `packages/identity/src/service-read.test.ts`

**Interfaces:**
- Consumes: Prisma `UserAccount`, `ScopeOperationGrant`, `AgentIdentity`, `AgentCredential`, and `AgentCredentialScopeGrant` records.
- Produces: `IdentityService.listOwnedAgents(ownerUserId)` and `IdentityService.listUsersWithGrants()` returning safe metadata only.

- [ ] **Step 1: Write failing read-model tests**

Create fixtures that assert deterministic Agent ordering, owner filtering, credential ceilings, user grant ordering, and the absence of `secretDigest` and `passwordDigest`:

```ts
import { describe, expect, it, vi } from "vitest";
import { IdentityService } from "./service";

describe("IdentityService control-plane reads", () => {
  it("returns only the owner's agents and safe credential metadata", async () => {
    const prisma = fakePrisma({ agents: [ownedAgentFixture()] });
    const result = await new IdentityService(prisma, { pepper: "test-pepper" }).listOwnedAgents("user-1");
    expect(result[0]?.credentials[0]).toEqual(expect.objectContaining({ id: "credential-1", status: "ACTIVE" }));
    expect(JSON.stringify(result)).not.toContain("secretDigest");
  });

  it("orders user grants by application service and operation", async () => {
    const prisma = fakePrisma({ users: [userFixture()] });
    const result = await new IdentityService(prisma, { pepper: "test-pepper" }).listUsersWithGrants();
    expect(result[0]?.grants.map((grant) => `${grant.applicationServiceId}:${grant.operation}`)).toEqual([
      "com.huawei.celon.desiner:asset:read",
      "com.huawei.celon.desiner:knowledge:read"
    ]);
    expect(JSON.stringify(result)).not.toContain("passwordDigest");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run packages/identity/src/service-read.test.ts`

Expected: FAIL because the read-model types and service methods do not exist.

- [ ] **Step 3: Add safe public types**

Add to `packages/identity/src/types.ts`:

```ts
export interface CredentialSummary {
  id: string;
  agentId: string;
  status: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  ceiling: ScopedOperationGrant[];
}

export interface OwnedAgentSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  credentials: CredentialSummary[];
}

export interface UserGrantSummary {
  id: string;
  login: string;
  displayName: string;
  status: string;
  isAdministrator: boolean;
  grants: ScopedOperationGrant[];
}
```

- [ ] **Step 4: Implement bounded list methods**

Add methods to `IdentityService` that select only safe columns and sort nested records before mapping:

```ts
async listOwnedAgents(ownerUserId: string): Promise<OwnedAgentSummary[]> {
  const agents = await this.prisma.agentIdentity.findMany({
    where: { ownerUserId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true, name: true, status: true, createdAt: true,
      credentials: {
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: { id: true, agentId: true, status: true, expiresAt: true, revokedAt: true, createdAt: true,
          grantCeiling: { select: { applicationServiceId: true, operation: true } } }
      }
    }
  });
  return agents.map(toOwnedAgentSummary);
}

async listUsersWithGrants(): Promise<UserGrantSummary[]> {
  const users = await this.prisma.userAccount.findMany({
    orderBy: [{ login: "asc" }, { id: "asc" }],
    select: { id: true, login: true, displayName: true, status: true, isAdministrator: true,
      grants: { select: { applicationServiceId: true, operation: true } } }
  });
  return users.map(toUserGrantSummary);
}
```

- [ ] **Step 5: Run identity tests and typecheck**

Run: `pnpm exec vitest run packages/identity/src/service-read.test.ts packages/identity/src/policy.test.ts packages/identity/src/credentials.test.ts`

Expected: PASS with no secret fields in snapshots.

Run: `pnpm --filter @specforge/identity typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/identity/src/types.ts packages/identity/src/service.ts packages/identity/src/service-read.test.ts
git commit -m "feat: add safe identity control-plane reads"
```

### Task 2: Authenticated Control-Plane APIs

**Files:**
- Modify: `apps/web/app/api/agent-credentials/agents/route.ts`
- Modify: `apps/web/app/api/admin/users/route.ts`
- Modify: `apps/web/app/api/admin/grants/route.ts`
- Create: `apps/web/app/api/identity-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 read methods and existing `requireWebUser`, `requireMutationUser`.
- Produces: `GET /api/agent-credentials/agents`, `GET /api/admin/users`, and `DELETE /api/admin/grants`.

- [ ] **Step 1: Write failing route tests**

Test these exact outcomes: unauthenticated reads return 401, an owner receives only safe Agent metadata, non-administrator user listing returns 403, administrator listing returns safe users/grants, and grant deletion requires Origin/CSRF plus `reason`.

```ts
expect(await GET_AGENTS(new Request("http://localhost/api/agent-credentials/agents"))).toMatchObject({ status: 401 });
expect(await GET_USERS(new Request("http://localhost/api/admin/users"))).toMatchObject({ status: 403 });
expect(await DELETE_GRANT(validMutationRequest({ userId: "u1", applicationServiceId: "svc", operation: "asset:read", reason: "role change" }))).toMatchObject({ status: 200 });
```

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `pnpm exec vitest run apps/web/app/api/identity-routes.test.ts`

Expected: FAIL because the GET and DELETE handlers are absent.

- [ ] **Step 3: Add the safe GET handlers**

Use a shared response helper in the test file or route-local function so authentication errors become 401 and authorization errors become 403 without returning stack traces:

```ts
export async function GET() {
  try {
    const actor = await requireWebUser();
    return NextResponse.json({ agents: await identity().listOwnedAgents(actor.id) });
  } catch (error) {
    return identityErrorResponse(error);
  }
}
```

The users route checks `actor.isAdministrator` before calling `listUsersWithGrants()` and returns `{ users }`.

- [ ] **Step 4: Add exact grant deletion**

Implement `DELETE` in `apps/web/app/api/admin/grants/route.ts`:

```ts
export async function DELETE(request: Request) {
  try {
    const actor = await requireMutationUser(request);
    if (!actor.isAdministrator) throw new Error("OPERATION_DENIED");
    const input = await request.json() as { userId: string; applicationServiceId: string; operation: Permission; reason: string };
    if (!input.reason?.trim()) throw new Error("REASON_REQUIRED");
    await identity().revokeOperation({ ...input, reason: input.reason.trim(), actorId: actor.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return identityErrorResponse(error);
  }
}
```

- [ ] **Step 5: Run API tests and Web typecheck**

Run: `pnpm exec vitest run apps/web/app/api/identity-routes.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/web typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/web/app/api/agent-credentials/agents/route.ts apps/web/app/api/admin/users/route.ts apps/web/app/api/admin/grants/route.ts apps/web/app/api/identity-routes.test.ts
git commit -m "feat: expose bounded identity management APIs"
```

### Task 3: Deterministic Settings State And Localization

**Files:**
- Create: `apps/web/components/settings/settings-state.ts`
- Create: `apps/web/components/settings/settings-state.test.ts`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: `MessageKey`, current `scope`, and safe server error codes.
- Produces: `SettingsSection`, `resolveSettingsSection`, `settingsHref`, `safeIdentityMessageKey`, and one-time-secret reducer.

- [ ] **Step 1: Write failing pure-state tests**

```ts
expect(resolveSettingsSection(undefined)).toBe("agents");
expect(resolveSettingsSection("unknown")).toBe("agents");
expect(settingsHref("permissions", "com.huawei.celon.desiner")).toBe("/settings?scope=com.huawei.celon.desiner&section=permissions");
expect(secretReducer({ kind: "shown", value: "secret" }, { type: "dismiss" })).toEqual({ kind: "hidden" });
expect(safeIdentityMessageKey("PrismaClientKnownRequestError")).toBe("settings.error.unavailable");
```

- [ ] **Step 2: Run the focused state test and confirm failure**

Run: `pnpm exec vitest run apps/web/components/settings/settings-state.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the state helpers**

```ts
export type SettingsSection = "agents" | "permissions" | "runtime";
export type SecretState = { kind: "hidden" } | { kind: "shown"; value: string };

export function resolveSettingsSection(value?: string | null): SettingsSection {
  return value === "permissions" || value === "runtime" ? value : "agents";
}

export function secretReducer(_state: SecretState, action: { type: "show"; value: string } | { type: "dismiss" }): SecretState {
  return action.type === "show" ? { kind: "shown", value: action.value } : { kind: "hidden" };
}
```

Map only recognized public error codes such as `AUTHENTICATION_REQUIRED`, `OPERATION_DENIED`, `CSRF_TOKEN_REJECTED`, `INVALID_CREDENTIAL_EXPIRY`, and `REASON_REQUIRED`; all unknown errors map to `settings.error.unavailable`.

- [ ] **Step 4: Add complete bilingual keys**

Add matching keys to both locale maps for section labels, Agent/user/grant forms, credential metadata, empty states, loading, success, denial, session expiry, unavailable service, secret one-time warning, copy, dismiss, rotate, revoke, and runtime labels. Replace the stale MVP description with copy that describes the deployment identity control plane.

- [ ] **Step 5: Run localization and state tests**

Run: `pnpm exec vitest run apps/web/components/settings/settings-state.test.ts apps/web/lib/__tests__/locale.test.ts`

Expected: PASS and both locale maps satisfy the existing `MessageKey` type.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/web/components/settings/settings-state.ts apps/web/components/settings/settings-state.test.ts apps/web/lib/i18n.ts
git commit -m "feat: define bilingual settings control state"
```

### Task 4: Settings Workspace And Identity Workflows

**Files:**
- Replace: `apps/web/app/settings/page.tsx`
- Create: `apps/web/components/settings/settings-workspace.tsx`
- Create: `apps/web/components/settings/agents-panel.tsx`
- Create: `apps/web/components/settings/users-panel.tsx`
- Create: `apps/web/components/settings/runtime-panel.tsx`
- Create: `apps/web/lib/__tests__/settings-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 API shapes, Task 3 state helpers and translations, current `scope` query.
- Produces: one Settings workspace with URL-addressable sections and safe mutation feedback.

- [ ] **Step 1: Write failing server-render and interaction-boundary tests**

Assert the default Agents section, preserved Scope links, redacted runtime URL, semantic tab selected state, no secret in initial markup, and static-auth warning:

```ts
const html = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({ scope: "com.huawei.celon.desiner" }) }));
expect(html).toContain("section=agents");
expect(html).toContain("com.huawei.celon.desiner");
expect(html).not.toContain("admin:admin");
expect(html).not.toContain("secretDigest");
```

- [ ] **Step 2: Run the page test and confirm failure**

Run: `pnpm exec vitest run apps/web/lib/__tests__/settings-page.test.tsx`

Expected: FAIL because the workspace components do not exist.

- [ ] **Step 3: Implement the server Settings shell**

Parse `scope` and `section`, redact the database URL, and pass only safe runtime metadata:

```tsx
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const query = await searchParams;
  return <SettingsWorkspace
    initialSection={resolveSettingsSection(query.section)}
    scope={query.scope}
    runtime={{
      databaseUrl: redactDatabaseUrl(process.env.DATABASE_URL ?? "unconfigured"),
      authMode: process.env.SPECFORGE_WEB_AUTH_MODE ?? "unconfigured",
      webOriginConfigured: Boolean(process.env.SPECFORGE_WEB_ORIGIN)
    }}
  />;
}
```

- [ ] **Step 4: Implement semantic section navigation**

Use `<nav aria-label={t("settings.sections")}>` and links whose `aria-current` reflects `initialSection`. Keep the existing `scope` in every `settingsHref`. Render only the selected panel to avoid accidental secret retention in hidden DOM.

- [ ] **Step 5: Implement Agent and Token workflows**

The Agent panel loads `GET /api/agent-credentials/agents`, shows an empty state, and implements create, issue, rotate, and revoke with one shared mutation helper:

```ts
async function identityMutation<T>(path: string, method: "POST" | "DELETE", body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "x-csrf-token": readCookie("specforge_csrf") },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "REQUEST_REJECTED");
  return payload;
}
```

Parse the selected exact operations into `ScopedOperationGrant[]` using the current `scope`; never build a hidden fixed JSON ceiling. On issue or rotation, dispatch `{ type: "show", value: result.secret }`; on dismissal and component unmount, clear the secret state.

- [ ] **Step 6: Implement Users and Permissions workflows**

Load `GET /api/admin/users`; render creation and exact grant forms. Use current Scope as a visible, read-only application-service field. Add revoke controls only for grants returned by the API and require a non-empty reason. An authorization denial renders the translated generic denied state without attempting another user's resources.

- [ ] **Step 7: Implement Runtime as read-only signals**

Render database URL, authentication mode, Web origin status, and a warning when `authMode === "static"`: the identity controls are visible for configuration but mutations require a local authenticated Web session. Do not perform a database mutation or reveal environment secrets.

- [ ] **Step 8: Add loading and accessibility behavior**

Each submit button uses its own `busyAction`, `disabled={busyAction !== null}`, and `LoaderCircle` spinner. Use `aria-live="polite"` for success/error results, labels for every input, and icon tooltips for copy, rotate, revoke, and dismiss commands.

- [ ] **Step 9: Run focused tests and typecheck**

Run: `pnpm exec vitest run apps/web/lib/__tests__/settings-page.test.tsx apps/web/components/settings/settings-state.test.ts apps/web/app/api/identity-routes.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/web typecheck`

Expected: exit 0.

- [ ] **Step 10: Commit Task 4**

```bash
git add apps/web/app/settings/page.tsx apps/web/components/settings apps/web/lib/__tests__/settings-page.test.tsx
git commit -m "feat: build settings identity workspace"
```

### Task 5: Compatibility Redirect And Consolidated Verification

**Files:**
- Modify: `apps/web/app/(admin)/identity/page.tsx`
- Modify: `apps/web/lib/__tests__/settings-page.test.tsx`

**Interfaces:**
- Consumes: Settings section URL contract from Task 3.
- Produces: compatibility redirect from `/identity` to `/settings?section=agents` with optional exact Scope.

- [ ] **Step 1: Add failing redirect tests**

Test both cases:

```ts
expect(identityDestination(undefined)).toBe("/settings?section=agents");
expect(identityDestination("com.huawei.celon.desiner")).toBe("/settings?scope=com.huawei.celon.desiner&section=agents");
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm exec vitest run apps/web/lib/__tests__/settings-page.test.tsx`

Expected: FAIL because the old form page still renders.

- [ ] **Step 3: Replace the duplicate page with a server redirect**

```tsx
import { redirect } from "next/navigation";
import { settingsHref } from "../../../components/settings/settings-state";

export default async function IdentityPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  redirect(settingsHref("agents", scope));
}
```

- [ ] **Step 4: Run the consolidated local verification once**

Run:

```bash
pnpm exec vitest run packages/identity/src/service-read.test.ts packages/identity/src/policy.test.ts packages/identity/src/credentials.test.ts apps/web/app/api/identity-routes.test.ts apps/web/components/settings/settings-state.test.ts apps/web/lib/__tests__/settings-page.test.tsx apps/web/lib/__tests__/locale.test.ts
pnpm --filter @specforge/identity typecheck
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/web build
```

Expected: all focused tests PASS, both typechecks exit 0, and the production Web build includes `/settings` and `/identity`.

- [ ] **Step 5: Commit Task 5**

```bash
git add 'apps/web/app/(admin)/identity/page.tsx' apps/web/lib/__tests__/settings-page.test.tsx
git commit -m "refactor: consolidate identity controls under settings"
```

### Task 6: Docker 3010 Acceptance And Design-Fact Closure

**Files:**
- Modify: `docs/adr/0046-self-managed-identity.md`
- Modify: `docs/superpowers/specs/2026-09-01-settings-identity-control-plane-design.md`

**Interfaces:**
- Consumes: verified production build and open design session.
- Produces: deployed Settings workspace, matching bilingual design facts, evidence, and `CONVERGED` closure.

- [ ] **Step 1: Rebuild and update only the application services**

Run: `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build web`

Expected: PostgreSQL data and volumes remain intact; one-shot bootstrap jobs complete; Web reports `running` with `0.0.0.0:3010->3000/tcp`.

- [ ] **Step 2: Perform one consolidated operational check**

Run:

```powershell
$healthResponse = Invoke-WebRequest http://127.0.0.1:3010/healthz -UseBasicParsing -TimeoutSec 15
$settingsResponse = Invoke-WebRequest 'http://127.0.0.1:3010/settings?scope=com.huawei.celon.desiner&section=agents' -UseBasicParsing -TimeoutSec 15
"health=$($healthResponse.StatusCode) settings=$($settingsResponse.StatusCode)"
```

Expected: `health=200 settings=200`.

- [ ] **Step 3: Verify the visible Settings experience**

Using the in-app browser at port 3010, verify Chinese and English section labels, default Agent section, loading feedback, static-auth warning when applicable, Runtime redaction, Scope preservation, no horizontal overflow at desktop/mobile widths, and the `/identity` redirect. Do not issue a live Token unless the test account and exact ceiling are explicitly designated for acceptance.

- [ ] **Step 4: Update repository and MCP design records**

Append the exact test, build, Docker, health, and visual results to ADR-0046 and the approved Spec. Through MCP in the exact Designer Scope, update `proposal-self-managed-identity` and `context-pack-self-managed-identity`, link them to `adr-self-managed-identity`, and read back the canonical English plus complete Chinese overlay. Record any blocked live-Token acceptance as an owned backlog fact rather than claiming it passed.

- [ ] **Step 5: Close the same design session**

Run:

```bash
pnpm design-context:close -- --session design-change-session:004276c3-4549-41d9-8e92-eb09acf06503 --status CONVERGED --evidence "focused identity/settings tests=PASS; identity and web typecheck=PASS; web production build=PASS; Docker 3010 health and settings=HTTP 200; bilingual browser verification=PASS"
```

Expected: the session returns `status: CONVERGED` with exact Designer Scope. If MCP synchronization or read-back fails, close as `BLOCKED` with the failure reason and retry trigger and do not claim completion.

- [ ] **Step 6: Commit final evidence**

```bash
git add docs/adr/0046-self-managed-identity.md docs/superpowers/specs/2026-09-01-settings-identity-control-plane-design.md
git commit -m "docs: record settings identity acceptance"
```

## Plan Self-Review

- Spec coverage: all information architecture, API reuse, secret lifecycle, localization, empty/error states, Scope isolation, redirect, testing, Docker 3010, and dual-record requirements map to Tasks 1-6.
- Completeness scan: every step names its concrete files, interfaces, command, and expected result.
- Type consistency: `OwnedAgentSummary`, `UserGrantSummary`, `SettingsSection`, `settingsHref`, and the API response shapes are introduced before their consumers.
- Scope check: this is one cohesive Web control-plane increment; production identity cutover and CodeHub remain outside this plan.
