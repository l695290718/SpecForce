import { huaweiArchitectureScopes } from "./mock";
import type { ArchitectureScope, ArchitectureScopeRef, ScopeAction, ScopedActor } from "./types";

export function scopeById(scopeId: string): ArchitectureScope | undefined {
  return huaweiArchitectureScopes.find((scope) => scope.id === scopeId);
}

export function isDescendantScope(ancestor: ArchitectureScope, descendant: ArchitectureScope): boolean {
  return descendant.scopePath === ancestor.scopePath || descendant.scopePath.startsWith(`${ancestor.scopePath}/`);
}

export function hasScopeAccess(actor: ScopedActor, requestedScope: ArchitectureScope, action: ScopeAction): boolean {
  return actor.grants.some((grant) => {
    if (grant.action !== action) return false;
    const grantedScope = scopeById(grant.scopeId);
    return grantedScope ? isDescendantScope(grantedScope, requestedScope) : false;
  });
}

export function filterByReadableScope<T extends { architectureScope?: ArchitectureScopeRef }>(actor: ScopedActor, items: T[]): T[] {
  return items.filter((item) => {
    if (!item.architectureScope) return true;
    const scope = scopeById(item.architectureScope.applicationServiceId);
    return scope?.scopePath === item.architectureScope.scopePath && hasScopeAccess(actor, scope, "read");
  });
}

export function assertWritableApplicationService(actor: ScopedActor, scope: ArchitectureScope): ArchitectureScopeRef {
  if (scope.level !== "applicationService") {
    throw new Error("Writable scope target must be an application service.");
  }
  if (!hasScopeAccess(actor, scope, "write")) {
    throw new Error(`Actor ${actor.actorId} does not have write access to ${scope.id}.`);
  }
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}
