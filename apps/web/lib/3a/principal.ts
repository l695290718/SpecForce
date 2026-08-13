import { authorizePrincipalScope, defaultHuaweiActor, normalizePrincipalClaims, scopeById, seedHuaweiActor, type ArchitectureScopeRef, type ScopedPrincipal } from "@specforge/core";

export type WebAuthMode = "seed" | "production" | "static";

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
  if (!input.provider) throw new Error("WEB_PRINCIPAL_RESOLVER_REQUIRED");
  return input.provider.resolve({ headers: input.headers, cookies: input.cookies });
}

export function resolveWebAuthMode(): WebAuthMode {
  const configured = process.env.SPECFORGE_WEB_AUTH_MODE?.trim().toLowerCase();
  if (configured === "static") return "static";
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

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
