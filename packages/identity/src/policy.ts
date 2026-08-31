import type { AuthorizationDecision, ExactOperationInput, ScopedOperationGrant } from "./types";

function includes(grants: ScopedOperationGrant[], applicationServiceId: string, operation: ExactOperationInput["requested"]["operation"]): boolean {
  return grants.some((grant) => grant.applicationServiceId === applicationServiceId && grant.operation === operation);
}

export function evaluateExactOperation(input: ExactOperationInput): AuthorizationDecision {
  const scope = input.registry.scopes.find((item) => item.id === input.requested.applicationServiceId);
  if (!scope || scope.level !== "applicationService" || scope.scopePath !== input.requested.scopePath) {
    return { allowed: false, code: "SCOPE_ACCESS_DENIED" };
  }
  if (!includes(input.ownerGrants, scope.id, input.requested.operation)) {
    return { allowed: false, code: "OPERATION_DENIED" };
  }
  if (input.credentialCeiling && !includes(input.credentialCeiling, scope.id, input.requested.operation)) {
    return { allowed: false, code: "OPERATION_DENIED" };
  }
  return { allowed: true, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } };
}
