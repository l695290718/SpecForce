import { authorizePrincipalScope, defaultHuaweiActor, normalizePrincipalClaims, scopeById, seedHuaweiActor, type ArchitectureScopeRef, type ScopedPrincipal } from "@specforge/core";

export type WebAuthMode = "seed" | "production";

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
  if (!input.provider) throw new Error("WEB_PRINCIPAL_RESOLVER_REQUIRED");
  return input.provider.resolve({ headers: input.headers, cookies: input.cookies });
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
