import { contentDigest } from "../federation/digest";
import { validateRelationshipEndpoints } from "../relationships/ontology";
import type { AssetNodeIdentity, RelationshipCode } from "../relationships/types";
import type { ArchitectureScopeRef } from "../architecture/types";
import type { FeatureAsset, FeatureAssetType } from "./types";
import { assertValidFeatureAsset, FeatureValidationError } from "./validation";

export const FEATURE_CHANGE_SET_LIMITS = Object.freeze({
  assets: 100,
  relationships: 1_000,
  canonicalBytes: 4 * 1024 * 1024
});

export interface FeatureAssetMutation {
  assetType: FeatureAssetType;
  asset: FeatureAsset;
  expectedVersion?: string;
}

export interface FeatureRelationshipMutation {
  relationType: RelationshipCode;
  source: AssetNodeIdentity;
  target: AssetNodeIdentity;
  confidence?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface FeatureChangeSetRequest {
  architectureScope: ArchitectureScopeRef;
  designChangeSessionId: string;
  correlationId: string;
  idempotencyKey: string;
  dryRun?: boolean;
  assets: FeatureAssetMutation[];
  relationships: FeatureRelationshipMutation[];
}

export interface FeatureChangeSetCatalog {
  assets: Array<{ id: string; assetType: string; version: string }>;
  endpoints: AssetNodeIdentity[];
}

export interface ValidatedFeatureChangeSet extends FeatureChangeSetRequest {
  requestDigest: string;
}

export class FeatureChangeSetError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: Array<{ index?: number; assetId?: string; path?: string; reason?: string }> = []
  ) {
    super(code);
    this.name = "FeatureChangeSetError";
  }
}

export function validateFeatureChangeSet(
  request: FeatureChangeSetRequest,
  catalog: FeatureChangeSetCatalog
): ValidatedFeatureChangeSet {
  requireText(request.designChangeSessionId, "designChangeSessionId");
  requireText(request.correlationId, "correlationId");
  requireText(request.idempotencyKey, "idempotencyKey");
  requireScope(request.architectureScope);
  if (!request.assets.length && !request.relationships.length) fail("FEATURE_CHANGE_SET_EMPTY");
  if (request.assets.length > FEATURE_CHANGE_SET_LIMITS.assets || request.relationships.length > FEATURE_CHANGE_SET_LIMITS.relationships) {
    fail("FEATURE_BUDGET_EXCEEDED");
  }
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > FEATURE_CHANGE_SET_LIMITS.canonicalBytes) {
    fail("FEATURE_BUDGET_EXCEEDED");
  }

  const existingById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const submittedIds = new Set<string>();
  for (const [index, mutation] of request.assets.entries()) {
    const assetId = mutation.asset.id;
    if (submittedIds.has(assetId)) fail("FEATURE_ID_COLLISION", [{ index, assetId }]);
    submittedIds.add(assetId);
    assertExactScope(request.architectureScope, mutation.asset.architectureScope, index, assetId);
    try {
      assertValidFeatureAsset(mutation.assetType, mutation.asset as never);
    } catch (error) {
      if (error instanceof FeatureValidationError) {
        fail(error.code === "FEATURE_LOCALIZATION_INVALID" ? error.code : "FEATURE_VALIDATION_FAILED", [{ index, assetId, path: error.path }]);
      }
      throw error;
    }
    const existing = existingById.get(assetId);
    if (existing && existing.assetType !== mutation.assetType) {
      fail("FEATURE_ID_COLLISION", [{ index, assetId }]);
    }
    if (existing && (!mutation.expectedVersion || mutation.expectedVersion !== existing.version)) {
      fail("FEATURE_VERSION_CONFLICT", [{ index, assetId }]);
    }
    if (!existing && mutation.expectedVersion !== undefined) {
      fail("FEATURE_VERSION_CONFLICT", [{ index, assetId }]);
    }
  }

  const endpoints = new Set(catalog.endpoints.map(endpointKey));
  for (const mutation of request.assets) {
    endpoints.add(endpointKey({
      ...request.architectureScope,
      nodeType: mutation.assetType,
      logicalId: mutation.asset.id,
      rootAssetType: mutation.assetType,
      rootAssetId: mutation.asset.id
    }));
  }
  const relationshipKeys = new Set<string>();
  for (const [index, relationship] of request.relationships.entries()) {
    assertExactScope(request.architectureScope, relationship.source, index);
    assertExactScope(request.architectureScope, relationship.target, index);
    const sourceKey = endpointKey(relationship.source);
    const targetKey = endpointKey(relationship.target);
    if (sourceKey === targetKey) fail("FEATURE_SELF_RELATIONSHIP", [{ index }]);
    if (!endpoints.has(sourceKey) || !endpoints.has(targetKey)) {
      fail("FEATURE_ENDPOINT_NOT_FOUND", [{ index }]);
    }
    try {
      validateRelationshipEndpoints(relationship.relationType, relationship.source.nodeType, relationship.target.nodeType);
    } catch (error) {
      fail("FEATURE_RELATIONSHIP_INVALID", [{ index, reason: error instanceof Error ? error.message : "invalid endpoints" }]);
    }
    const relationshipKey = `${relationship.relationType}:${sourceKey}:${targetKey}`;
    if (relationshipKeys.has(relationshipKey)) fail("FEATURE_DUPLICATE_RELATIONSHIP", [{ index }]);
    relationshipKeys.add(relationshipKey);
  }

  return { ...request, requestDigest: contentDigest(request) };
}

function requireScope(scope: ArchitectureScopeRef): void {
  if (!scope.applicationServiceId?.trim() || !scope.scopePath?.trim()) fail("FEATURE_SCOPE_REQUIRED");
}

function requireText(value: string, path: string): void {
  if (!value?.trim()) fail("FEATURE_VALIDATION_FAILED", [{ path }]);
}

function assertExactScope(
  expected: ArchitectureScopeRef,
  actual: ArchitectureScopeRef | undefined,
  index: number,
  assetId?: string
): void {
  if (!actual || actual.applicationServiceId !== expected.applicationServiceId || actual.scopePath !== expected.scopePath) {
    fail("FEATURE_SCOPE_MISMATCH", [{ index, assetId }]);
  }
}

function endpointKey(endpoint: AssetNodeIdentity): string {
  return `${endpoint.applicationServiceId}:${endpoint.scopePath}:${endpoint.nodeType}:${endpoint.logicalId}:${endpoint.rootAssetType}:${endpoint.rootAssetId}:${endpoint.parentLogicalId ?? ""}`;
}

function fail(code: string, details?: FeatureChangeSetError["details"]): never {
  throw new FeatureChangeSetError(code, details);
}
