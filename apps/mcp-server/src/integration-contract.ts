import type { ArchitectureScopeRef } from "@specforge/core";

const V1_FIELDS = ["contractSchemaVersion", "integrationCallKey", "consumerScopeId", "targetKind", "protocolKind", "protocolLocator", "lifecycle", "targetResolution"] as const;
const PROTOCOL_KINDS = new Set(["REST_API", "GRPC", "MESSAGE_EVENT", "FILE", "UNNORMALIZED"]);
const LIFECYCLES = new Set(["ACTIVE", "DEPRECATED", "RETIRED"]);

export interface IntegrationContractProjection {
  integrationCallKey: string;
  integrationSortKey: string;
  integrationTargetBinding: string;
  integrationProtocolKind: string;
  integrationProtocolLocator: string;
  integrationResolutionStatus: "RESOLVED" | "EXTERNAL" | "UNRESOLVED";
  providerScopeId?: string;
  targetType?: string;
  targetId?: string;
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

export function isGovernedIntegrationContract(asset: Record<string, unknown>): boolean {
  return V1_FIELDS.some((field) => asset[field] !== undefined);
}

/**
 * Validates the consumer-owned V1 envelope and returns only fields that may be
 * copied into PostgreSQL's derived query projection. Undefined denotes legacy.
 */
export function validateIntegrationContractV1(asset: Record<string, unknown>, architectureScope?: ArchitectureScopeRef): IntegrationContractProjection | undefined {
  if (!isGovernedIntegrationContract(asset)) return undefined;
  if (asset.contractSchemaVersion !== 1) throw new Error("INTEGRATION_CONTRACT_V1_MARKER_REQUIRED");

  const consumerScopeId = requiredString(asset.consumerScopeId, "INTEGRATION_CONTRACT_CONSUMER_REQUIRED");
  if (architectureScope && consumerScopeId !== architectureScope.applicationServiceId) throw new Error("INTEGRATION_CONTRACT_CONSUMER_SCOPE_MISMATCH");
  if (requiredString(asset.sourceSystem, "INTEGRATION_CONTRACT_SOURCE_REQUIRED") !== consumerScopeId) throw new Error("INTEGRATION_CONTRACT_SOURCE_SCOPE_MISMATCH");

  const targetKind = requiredString(asset.targetKind, "INTEGRATION_CONTRACT_TARGET_KIND_REQUIRED");
  if (targetKind !== "SPEC_FORGE_SCOPE" && targetKind !== "EXTERNAL") throw new Error("INTEGRATION_CONTRACT_TARGET_KIND_INVALID");
  const protocolKind = requiredString(asset.protocolKind, "INTEGRATION_CONTRACT_PROTOCOL_KIND_REQUIRED");
  if (!PROTOCOL_KINDS.has(protocolKind)) throw new Error("INTEGRATION_CONTRACT_PROTOCOL_KIND_INVALID");
  const protocolLocator = requiredString(asset.protocolLocator, "INTEGRATION_CONTRACT_LOCATOR_REQUIRED");
  const lifecycle = requiredString(asset.lifecycle, "INTEGRATION_CONTRACT_LIFECYCLE_REQUIRED");
  if (!LIFECYCLES.has(lifecycle)) throw new Error("INTEGRATION_CONTRACT_LIFECYCLE_INVALID");

  const resolution = record(asset.targetResolution, "INTEGRATION_CONTRACT_RESOLUTION_REQUIRED");
  const status = requiredString(resolution.status, "INTEGRATION_CONTRACT_RESOLUTION_STATUS_REQUIRED") as IntegrationContractProjection["integrationResolutionStatus"];
  let targetBinding: string;
  let providerScopeId: string | undefined;
  let targetType: string | undefined;
  let targetId: string | undefined;

  if (targetKind === "SPEC_FORGE_SCOPE") {
    if (status === "RESOLVED") {
      providerScopeId = requiredString(resolution.providerScopeId, "INTEGRATION_CONTRACT_PROVIDER_SCOPE_REQUIRED");
      targetType = requiredString(resolution.targetType, "INTEGRATION_CONTRACT_TARGET_TYPE_REQUIRED");
      targetId = requiredString(resolution.targetId, "INTEGRATION_CONTRACT_TARGET_ID_REQUIRED");
      requiredString(resolution.revisionLabel, "INTEGRATION_CONTRACT_TARGET_REVISION_REQUIRED");
      if (requiredString(asset.targetSystem, "INTEGRATION_CONTRACT_TARGET_SYSTEM_REQUIRED") !== providerScopeId) throw new Error("INTEGRATION_CONTRACT_TARGET_SYSTEM_MISMATCH");
      targetBinding = `SPEC_FORGE_SCOPE:${providerScopeId}:${targetType}:${targetId}`;
    } else if (status === "UNRESOLVED") {
      targetBinding = `UNRESOLVED:${requiredString(asset.targetSystem, "INTEGRATION_CONTRACT_TARGET_SYSTEM_REQUIRED")}`;
    } else {
      throw new Error("INTEGRATION_CONTRACT_RESOLUTION_TUPLE_INVALID");
    }
  } else {
    if (status !== "EXTERNAL") throw new Error("INTEGRATION_CONTRACT_RESOLUTION_TUPLE_INVALID");
    const externalName = requiredString(resolution.externalName ?? asset.targetSystem, "INTEGRATION_CONTRACT_EXTERNAL_NAME_REQUIRED");
    if (requiredString(asset.targetSystem, "INTEGRATION_CONTRACT_TARGET_SYSTEM_REQUIRED") !== externalName) throw new Error("INTEGRATION_CONTRACT_TARGET_SYSTEM_MISMATCH");
    targetBinding = `EXTERNAL:${externalName}`;
  }

  const canonicalCallKey = [consumerScopeId, targetBinding, protocolKind, protocolLocator].join("|");
  if (requiredString(asset.integrationCallKey, "INTEGRATION_CONTRACT_CALL_KEY_REQUIRED") !== canonicalCallKey) throw new Error("INTEGRATION_CONTRACT_CALL_KEY_MISMATCH");
  const contractId = optionalString(asset.id) ?? "new";
  return {
    integrationCallKey: canonicalCallKey,
    integrationSortKey: [consumerScopeId, targetBinding, protocolKind, protocolLocator, contractId].join("\u001f"),
    integrationTargetBinding: targetBinding,
    integrationProtocolKind: protocolKind,
    integrationProtocolLocator: protocolLocator,
    integrationResolutionStatus: status,
    ...(providerScopeId ? { providerScopeId, targetType, targetId } : {})
  };
}
