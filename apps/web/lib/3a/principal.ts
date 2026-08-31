import { authorizePrincipalScope, defaultHuaweiActor, normalizePrincipalClaims, scopeById, seedHuaweiActor, type ArchitectureScopeRef, type Permission, type ScopedPrincipal } from "@specforge/core";
import { currentWebUser } from "../identity/server";

export type WebAuthMode = "seed" | "production" | "static" | "local-account";

export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface WebPrincipalResolver {
  resolve(input: { headers: Headers; cookies: CookieReader }): Promise<ScopedPrincipal>;
}

export interface WebPrincipalResolutionInput {
  authMode: WebAuthMode;
  headers: Headers;
  cookies: CookieReader;
  provider?: WebPrincipalResolver;
}

export interface ThreeARequestResolutionInput extends WebPrincipalResolutionInput {
  architectureScope: ArchitectureScopeRef;
}

export interface ResolvedThreeARequest {
  architectureScope: ArchitectureScopeRef;
  principal: ScopedPrincipal;
}

export async function resolveWebPrincipal(input: WebPrincipalResolutionInput): Promise<ScopedPrincipal> {
  if (input.authMode === "seed") return seedWebPrincipal();
  if (input.authMode === "static") return configuredWebPrincipal();
  if (input.authMode === "local-account") return localAccountWebPrincipal();
  if (!input.provider) throw new Error("WEB_PRINCIPAL_RESOLVER_REQUIRED");
  return input.provider.resolve({ headers: input.headers, cookies: input.cookies });
}

export function resolveWebAuthMode(): WebAuthMode {
  const configured = process.env.SPECFORGE_WEB_AUTH_MODE?.trim().toLowerCase();
  if (configured === "static") return "static";
  if (configured === "local-account") return "local-account";
  if (configured === "production") return "production";
  if (configured === "seed" && process.env.NODE_ENV !== "production") return "seed";
  return process.env.NODE_ENV === "production" ? "production" : "seed";
}

export async function resolveThreeARequest(input: ThreeARequestResolutionInput): Promise<ResolvedThreeARequest> {
  const scope = scopeById(input.architectureScope.applicationServiceId);
  if (!scope || scope.level !== "applicationService" || scope.scopePath !== input.architectureScope.scopePath) throw new Error("SCOPE_ACCESS_DENIED");
  const principal = await resolveWebPrincipal(input);
  try {
    authorizePrincipalScope(principal, input.architectureScope, "read");
  } catch {
    throw new Error("SCOPE_ACCESS_DENIED");
  }
  if (input.authMode === "local-account" && !principal.operationGrants?.some((grant) => grant.scopeId === input.architectureScope.applicationServiceId && grant.operation === "knowledge:read")) throw new Error("SCOPE_ACCESS_DENIED");
  return { architectureScope: input.architectureScope, principal };
}

export function seedWebPrincipal(): ScopedPrincipal {
  const actor = process.env.SPECFORGE_MCP_SEED === "1" ? seedHuaweiActor : defaultHuaweiActor;
  return normalizePrincipalClaims({
    actorType: actor.actorType,
    subject: actor.actorId,
    tenantId: "local-development",
    authSource: "seed",
    grants: actor.grants,
    permissions: ["knowledge:read"],
    decisionRef: "seed-web-principal"
  }, { allowSeed: true });
}

function configuredWebPrincipal(): ScopedPrincipal {
  const raw = process.env.SPECFORGE_WEB_PRINCIPAL_CLAIMS?.trim();
  if (!raw) throw new Error("WEB_PRINCIPAL_CLAIMS_REQUIRED");
  let claims: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    claims = parsed as Record<string, unknown>;
  } catch {
    throw new Error("WEB_PRINCIPAL_CLAIMS_INVALID");
  }
  const actor = isRecord(claims.actor) ? claims.actor : claims;
  return normalizePrincipalClaims({
    actorType: actor.actorType,
    subject: actor.subject ?? actor.actorId ?? claims.subject ?? claims.clientId,
    tenantId: actor.tenantId ?? claims.tenantId,
    authSource: actor.authSource ?? claims.authSource ?? "static-bearer",
    grants: actor.grants,
    permissions: actor.permissions ?? claims.permissions,
    decisionRef: actor.decisionRef ?? claims.decisionRef
  });
}

async function localAccountWebPrincipal(): Promise<ScopedPrincipal> {
  const user = await currentWebUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  const operations = user.grants.map((grant) => grant.operation as Permission);
  const scopeIds = [...new Set(user.grants.map((grant) => grant.applicationServiceId))];
  const readOperations = new Set<Permission>(["asset:read", "proposal:read", "graph:read", "knowledge:read", "knowledge:consume", "knowledge:diagnostic", "context-pack:generate", "governance:run"]);
  const writeOperations = new Set<Permission>(["asset:write", "proposal:write", "knowledge:write", "adr:write"]);
  return normalizePrincipalClaims({
    actorType: "user",
    subject: user.id,
    tenantId: process.env.SPECFORGE_TENANT_ID ?? "local-enterprise",
    authSource: "web-session",
    grants: scopeIds.flatMap((scopeId) => [
      ...(user.grants.some((grant) => grant.applicationServiceId === scopeId && readOperations.has(grant.operation as Permission)) ? [{ scopeId, action: "read" as const }] : []),
      ...(user.grants.some((grant) => grant.applicationServiceId === scopeId && writeOperations.has(grant.operation as Permission)) ? [{ scopeId, action: "write" as const }] : [])
    ]),
    permissions: [...new Set(operations)],
    operationGrants: user.grants.map((grant) => ({ scopeId: grant.applicationServiceId, operation: grant.operation })),
    decisionRef: `web-session:${user.sessionId}`
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
