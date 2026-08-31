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
