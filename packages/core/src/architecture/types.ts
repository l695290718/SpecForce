export type ArchitectureScopeLevel = "productFamily" | "product" | "subProduct" | "module" | "applicationService" | (string & {});
export type ScopeAction = "read" | "write";
export type ArchitectureScopePurpose = "product" | "verification";

export interface ArchitectureScope {
  id: string;
  code: string;
  name: string;
  description: string;
  owner: string;
  level: ArchitectureScopeLevel;
  parentId?: string;
  scopePath: string;
  purpose?: ArchitectureScopePurpose;
}

export interface ArchitectureScopeRef {
  applicationServiceId: string;
  scopePath: string;
}

export interface ArchitectureScopeRegistry {
  scopes: ArchitectureScope[];
  minimumWriteLevel?: string;
}

export interface ScopeGrant {
  scopeId: string;
  action: ScopeAction;
}

export interface PrincipalOperationGrant {
  scopeId: string;
  operation: import("../types").Permission;
}

export interface ScopedActor {
  actorType: "agent" | "user" | "system";
  actorId: string;
  grants: ScopeGrant[];
}

export type PrincipalAuthSource = "seed" | "static-bearer" | "managed-token" | "web-session" | "oidc" | "system";

export interface ScopedPrincipal extends ScopedActor {
  subject: string;
  tenantId: string;
  authSource: PrincipalAuthSource;
  permissions: import("../types").Permission[];
  /** Present for managed identities; binds each operation to one exact application-service Scope. */
  operationGrants?: PrincipalOperationGrant[];
  decisionRef: string;
}
