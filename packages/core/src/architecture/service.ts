import { huaweiArchitectureScopes } from "./mock";
import type { ArchitectureScope, ArchitectureScopeRef, ArchitectureScopeRegistry, ScopeAction, ScopedActor } from "./types";

const defaultRegistry: ArchitectureScopeRegistry = { scopes: huaweiArchitectureScopes, minimumWriteLevel: "applicationService" };

export function scopeById(scopeId: string, registry: ArchitectureScopeRegistry = defaultRegistry): ArchitectureScope | undefined {
  return registry.scopes.find((scope) => scope.id === scopeId);
}

export function isDescendantScope(ancestor: ArchitectureScope, descendant: ArchitectureScope): boolean {
  return descendant.scopePath === ancestor.scopePath || descendant.scopePath.startsWith(`${ancestor.scopePath}/`);
}

export function hasScopeAccess(actor: ScopedActor, requestedScope: ArchitectureScope, action: ScopeAction, registry: ArchitectureScopeRegistry = defaultRegistry): boolean {
  return actor.grants.some((grant) => {
    if (grant.action !== action) return false;
    const grantedScope = scopeById(grant.scopeId, registry);
    return grantedScope ? isDescendantScope(grantedScope, requestedScope) : false;
  });
}

export function filterByReadableScope<T extends { architectureScope?: ArchitectureScopeRef }>(actor: ScopedActor, items: T[], registry: ArchitectureScopeRegistry = defaultRegistry): T[] {
  return items.filter((item) => {
    if (!item.architectureScope) return true;
    const scope = scopeById(item.architectureScope.applicationServiceId, registry);
    return scope?.scopePath === item.architectureScope.scopePath && hasScopeAccess(actor, scope, "read", registry);
  });
}

export function assertWritableApplicationService(actor: ScopedActor, scope: ArchitectureScope, registry: ArchitectureScopeRegistry = defaultRegistry): ArchitectureScopeRef {
  const minimumWriteLevel = registry.minimumWriteLevel ?? "applicationService";
  if (scope.level !== minimumWriteLevel) {
    const label = minimumWriteLevel === "applicationService" ? "application service" : minimumWriteLevel;
    throw new Error(`Writable scope target must be a ${label}.`);
  }
  if (!hasScopeAccess(actor, scope, "write", registry)) {
    throw new Error(`Actor ${actor.actorId} does not have write access to ${scope.id}.`);
  }
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}
