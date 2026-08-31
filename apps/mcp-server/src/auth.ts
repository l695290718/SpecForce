import { normalizePrincipalClaims, type Permission, type PrincipalAuthSource, type ScopedPrincipal } from "@specforge/core";
import type { ResolvedAgentPrincipal } from "@specforge/identity";
import { AsyncLocalStorage } from "node:async_hooks";

export interface McpActor {
  actorType: "agent" | "user" | "system";
  actorId: string;
}

export interface AuthorizationPolicy {
  authorize(actor: McpActor, permissions: Permission[]): Promise<void>;
}

export interface McpAuthInfo {
  clientId: string;
  scopes?: string[];
  extra?: Record<string, unknown>;
  tenantId?: string;
  authSource?: PrincipalAuthSource;
}

const principalStorage = new AsyncLocalStorage<ScopedPrincipal>();

export const allowAllPolicy: AuthorizationPolicy = {
  async authorize() {
    return;
  }
};

export function getDefaultActor(): McpActor {
  return {
    actorType: "agent",
    actorId: process.env.SPECFORGE_MCP_ACTOR_ID ?? "local-mcp-agent"
  };
}

export function principalFromAuthInfo(authInfo: McpAuthInfo | undefined): ScopedPrincipal {
  if (!authInfo) throw new Error("AUTHENTICATION_REQUIRED");
  const rawClaims = authInfo.extra;
  const rawActor = isRecord(rawClaims?.actor) ? rawClaims.actor : rawClaims;
  const tenantId = stringValue(rawActor?.tenantId) || stringValue(rawClaims?.tenantId) || stringValue(authInfo.tenantId) || (process.env.NODE_ENV === "production" ? "" : "local-development");
  const authSource = stringValue(rawActor?.authSource) || stringValue(rawClaims?.authSource) || authInfo.authSource || (process.env.SPECFORGE_MCP_SEED === "1" ? "seed" : "static-bearer");
  const permissions = authInfo.scopes ?? (Array.isArray(rawActor?.permissions) ? rawActor.permissions : []);
  return normalizePrincipalClaims({
    actorType: rawActor?.actorType,
    subject: rawActor?.subject ?? rawActor?.actorId ?? rawClaims?.subject ?? authInfo.clientId,
    tenantId,
    authSource,
    grants: rawActor?.grants,
    permissions,
    decisionRef: rawActor?.decisionRef ?? rawClaims?.decisionRef
  }, { allowSeed: process.env.SPECFORGE_MCP_SEED === "1" });
}

export function principalFromManagedAgent(resolved: ResolvedAgentPrincipal): ScopedPrincipal {
  const operationGrants = resolved.ownerGrants.filter((owner) => resolved.credentialCeiling.some((ceiling) => ceiling.applicationServiceId === owner.applicationServiceId && ceiling.operation === owner.operation));
  const grants = uniqueScopeActions(operationGrants.map((grant) => ({ scopeId: grant.applicationServiceId, action: scopeActionForOperation(grant.operation) })));
  return normalizePrincipalClaims({
    actorType: "agent",
    subject: resolved.actorId,
    tenantId: process.env.SPECFORGE_MCP_TENANT_ID ?? "local-development",
    authSource: "managed-token",
    grants,
    permissions: [...new Set(operationGrants.map((grant) => grant.operation))],
    operationGrants: operationGrants.map((grant) => ({ scopeId: grant.applicationServiceId, operation: grant.operation })),
    decisionRef: `credential:${resolved.credentialId}:authorization:${resolved.authorizationVersion.toString()}`
  });
}

export function withRequestPrincipal<T>(principal: ScopedPrincipal, callback: () => Promise<T>): Promise<T> {
  return principalStorage.run(principal, callback);
}

export function currentRequestPrincipal(): ScopedPrincipal | undefined {
  return principalStorage.getStore();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scopeActionForOperation(permission: Permission): "read" | "write" {
  return permission === "asset:write" || permission === "proposal:write" || permission === "adr:write" || permission === "knowledge:write" ? "write" : "read";
}

function uniqueScopeActions(grants: Array<{ scopeId: string; action: "read" | "write" }>) {
  return grants.filter((grant, index) => grants.findIndex((other) => other.scopeId === grant.scopeId && other.action === grant.action) === index);
}
