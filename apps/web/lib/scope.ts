import { defaultHuaweiActor, hasScopeAccess, huaweiArchitectureScopes, scopeById, type ArchitectureScope, type ScopedPrincipal } from "@specforge/core";

export type ResolvedApplicationServiceScope = ArchitectureScope & {
  level: "applicationService";
};

export function requireReadableApplicationService(scopeId: string, principal: ScopedPrincipal = localDevelopmentPrincipal()): ResolvedApplicationServiceScope {
  const scope = scopeById(scopeId);
  if (!scope) throw new Error("Application-service scope is required or unknown.");
  if (scope.level !== "applicationService") throw new Error("Scope must be an application service.");
  if (!hasScopeAccess(principal, scope, "read")) throw new Error("Scope read is not authorized.");
  return scope as ResolvedApplicationServiceScope;
}

export function listReadableApplicationServices(principal: ScopedPrincipal = localDevelopmentPrincipal()): ResolvedApplicationServiceScope[] {
  return huaweiArchitectureScopes.filter(
    (scope): scope is ResolvedApplicationServiceScope => scope.level === "applicationService" && scope.purpose !== "verification" && hasScopeAccess(principal, scope, "read")
  );
}

export function scopeDatabaseWhere(scope: ResolvedApplicationServiceScope) {
  return {
    applicationServiceId: scope.id,
    scopePath: scope.scopePath
  };
}

export function buildScopedHref(href: string, scopeId: string): string {
  const url = new URL(href, "http://specforge.local");
  url.searchParams.set("scope", scopeId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function localDevelopmentPrincipal(): ScopedPrincipal {
  return {
    ...defaultHuaweiActor,
    subject: defaultHuaweiActor.actorId,
    tenantId: "local-development",
    authSource: "seed",
    permissions: ["asset:read", "proposal:read", "context-pack:generate", "governance:run", "graph:read", "knowledge:read"],
    decisionRef: "local-development-scope-helper"
  };
}
