import type { ArchitectureScopeRef, ArchitectureScopeRegistry } from "@specforge/core";
import type { Permission } from "@specforge/core";

export interface ScopedOperationGrant {
  applicationServiceId: string;
  operation: Permission;
}

export interface AuthorizationSubject {
  subjectId: string;
  actorType: "user" | "agent";
  ownerUserId?: string;
  authorizationVersion: bigint;
  credentialVersion?: bigint;
}

export interface ExactOperationRequest extends ArchitectureScopeRef {
  operation: Permission;
}

export interface ExactOperationInput {
  requested: ExactOperationRequest;
  ownerGrants: ScopedOperationGrant[];
  credentialCeiling?: ScopedOperationGrant[];
  registry: ArchitectureScopeRegistry;
}

export type AuthorizationDecision =
  | { allowed: true; scope: ArchitectureScopeRef }
  | { allowed: false; code: "SCOPE_ACCESS_DENIED" | "OPERATION_DENIED" | "CREDENTIAL_INACTIVE" };

export interface IssuedOpaqueCredential {
  secret: string;
  digest: string;
}

/** Safe control-plane metadata. It deliberately excludes every secret and digest. */
export interface CredentialSummary {
  id: string;
  agentId: string;
  status: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  ceiling: ScopedOperationGrant[];
}

export interface OwnedAgentSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  credentials: CredentialSummary[];
}

export interface UserGrantSummary {
  id: string;
  login: string;
  displayName: string;
  status: string;
  isAdministrator: boolean;
  grants: ScopedOperationGrant[];
}
