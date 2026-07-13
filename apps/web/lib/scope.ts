import { defaultHuaweiActor, hasScopeAccess, huaweiArchitectureScopes, scopeById, type ArchitectureScope } from "@specforge/core";

export type ResolvedApplicationServiceScope = ArchitectureScope & {
  level: "applicationService";
};

export function requireReadableApplicationService(scopeId: string): ResolvedApplicationServiceScope {
  const scope = scopeById(scopeId);
  if (!scope) throw new Error("Application-service scope is required or unknown.");
  if (scope.level !== "applicationService") throw new Error("Scope must be an application service.");
  if (!hasScopeAccess(defaultHuaweiActor, scope, "read")) throw new Error("Scope read is not authorized.");
  return scope as ResolvedApplicationServiceScope;
}

export function listReadableApplicationServices(): ResolvedApplicationServiceScope[] {
  return huaweiArchitectureScopes.filter(
    (scope): scope is ResolvedApplicationServiceScope => scope.level === "applicationService" && hasScopeAccess(defaultHuaweiActor, scope, "read")
  );
}

export function scopeDatabaseWhere(scope: ResolvedApplicationServiceScope) {
  return {
    applicationServiceId: scope.id,
    scopePath: scope.scopePath
  };
}

export function buildScopedHref(href: string, scopeId: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}scope=${encodeURIComponent(scopeId)}`;
}
