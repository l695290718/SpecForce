import type { Permission } from "../types";
import type { ArchitectureScopeRef, PrincipalAuthSource, PrincipalOperationGrant, ScopeAction, ScopedPrincipal, ScopeGrant } from "./types";
import { scopeById } from "./service";

export interface PrincipalClaims {
  actorType?: unknown;
  subject?: unknown;
  clientId?: unknown;
  tenantId?: unknown;
  authSource?: unknown;
  grants?: unknown;
  permissions?: unknown;
  operationGrants?: unknown;
  decisionRef?: unknown;
}

const actorTypes = new Set(["agent", "user", "system"]);
const authSources = new Set<PrincipalAuthSource>(["seed", "static-bearer", "managed-token", "web-session", "oidc", "system"]);
const permissions = new Set<Permission>([
  "asset:read", "asset:write", "proposal:read", "proposal:write", "context-pack:generate",
  "governance:run", "adr:write", "graph:read", "knowledge:read", "knowledge:write", "knowledge:consume", "knowledge:diagnostic"
]);

export function normalizePrincipalClaims(claims: PrincipalClaims, options: { allowSeed?: boolean } = {}): ScopedPrincipal {
  const actorType = stringValue(claims.actorType);
  const subject = stringValue(claims.subject) || stringValue(claims.clientId);
  const tenantId = stringValue(claims.tenantId);
  const authSource = stringValue(claims.authSource) as PrincipalAuthSource;
  if (!actorTypes.has(actorType) || !subject || !tenantId || !authSources.has(authSource)) throw new Error("AUTHENTICATION_REQUIRED");
  if (authSource === "seed" && !options.allowSeed) throw new Error("SEED_IDENTITY_NOT_ALLOWED");

  const grants = normalizeGrants(claims.grants);
  const normalizedPermissions = normalizePermissions(claims.permissions);
  const operationGrants = normalizeOperationGrants(claims.operationGrants);
  const decisionRef = stringValue(claims.decisionRef) || `principal:${subject}:${tenantId}`;
  return { actorType: actorType as ScopedPrincipal["actorType"], actorId: subject, subject, tenantId, authSource, grants, permissions: normalizedPermissions, ...(operationGrants.length ? { operationGrants } : {}), decisionRef };
}

function normalizeOperationGrants(value: unknown): PrincipalOperationGrant[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("AUTHENTICATION_REQUIRED");
  const result: PrincipalOperationGrant[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.scopeId !== "string" || typeof item.operation !== "string" || !scopeById(item.scopeId) || !permissions.has(item.operation as Permission)) throw new Error("AUTHENTICATION_REQUIRED");
    if (!result.some((grant) => grant.scopeId === item.scopeId && grant.operation === item.operation)) result.push({ scopeId: item.scopeId, operation: item.operation as Permission });
  }
  return result;
}

export function authorizePrincipalScope(principal: ScopedPrincipal, requestedScope: ArchitectureScopeRef, action: ScopeAction): ArchitectureScopeRef {
  const scope = scopeById(requestedScope.applicationServiceId);
  if (!scope || scope.level !== "applicationService" || scope.scopePath !== requestedScope.scopePath) throw new Error("SCOPE_ACCESS_DENIED");
  if (!principal.grants.some((grant) => grant.scopeId === scope.id && grant.action === action)) throw new Error("SCOPE_ACCESS_DENIED");
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

function normalizeGrants(value: unknown): ScopeGrant[] {
  if (!Array.isArray(value)) throw new Error("AUTHENTICATION_REQUIRED");
  const result: ScopeGrant[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.scopeId !== "string" || (item.action !== "read" && item.action !== "write") || !scopeById(item.scopeId)) throw new Error("AUTHENTICATION_REQUIRED");
    if (!result.some((grant) => grant.scopeId === item.scopeId && grant.action === item.action)) result.push({ scopeId: item.scopeId, action: item.action });
  }
  return result;
}

function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !permissions.has(item as Permission))) throw new Error("AUTHENTICATION_REQUIRED");
  return [...new Set(value as Permission[])];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
