import type { ArchitectureScopeRef } from "../architecture/types";
import { sha256Hex } from "../federation/digest";

export interface ProjectionIdentity extends ArchitectureScopeRef {
  baselineId: string;
  manifestId: string;
  generationId: string;
  schemaVersion: string;
}

export function createProjectionIdentity(input: ProjectionIdentity): ProjectionIdentity {
  const values = [
    input.applicationServiceId,
    input.scopePath,
    input.baselineId,
    input.manifestId,
    input.generationId,
    input.schemaVersion
  ];
  if (values.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new Error("PROJECTION_IDENTITY_REQUIRED");
  }
  return {
    applicationServiceId: input.applicationServiceId.trim(),
    scopePath: input.scopePath.trim(),
    baselineId: input.baselineId.trim(),
    manifestId: input.manifestId.trim(),
    generationId: input.generationId.trim(),
    schemaVersion: input.schemaVersion.trim()
  };
}

export function assertSameProjectionIdentity(left: ProjectionIdentity, right: ProjectionIdentity): void {
  const normalizedLeft = createProjectionIdentity(left);
  const normalizedRight = createProjectionIdentity(right);
  if (projectionIdentityKey(normalizedLeft) !== projectionIdentityKey(normalizedRight)) {
    throw new Error("PROJECTION_IDENTITY_MISMATCH");
  }
}

export function generationQualifiedVertexId(identity: ProjectionIdentity, entityType: string, logicalId: string): string {
  const normalized = createProjectionIdentity(identity);
  if (!entityType.trim() || !logicalId.trim()) throw new Error("PROJECTION_VERTEX_ID_REQUIRED");
  return `n:${sha256Hex(canonicalTuple([
    "vertex",
    projectionIdentityKey(normalized),
    entityType.trim(),
    logicalId.trim()
  ]))}`;
}

export function generationQualifiedEdgeRank(projectionOrdinal: bigint): bigint {
  if (projectionOrdinal <= 0n || projectionOrdinal > 9_223_372_036_854_775_807n) {
    throw new Error("PROJECTION_ORDINAL_INVALID");
  }
  return projectionOrdinal;
}

export function projectionIdentityKey(identity: ProjectionIdentity): string {
  const normalized = createProjectionIdentityWithoutRecursion(identity);
  return canonicalTuple([
    normalized.applicationServiceId,
    normalized.scopePath,
    normalized.baselineId,
    normalized.manifestId,
    normalized.generationId,
    normalized.schemaVersion
  ]);
}

function createProjectionIdentityWithoutRecursion(input: ProjectionIdentity): ProjectionIdentity {
  const values = [
    input.applicationServiceId,
    input.scopePath,
    input.baselineId,
    input.manifestId,
    input.generationId,
    input.schemaVersion
  ];
  if (values.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new Error("PROJECTION_IDENTITY_REQUIRED");
  }
  return {
    applicationServiceId: input.applicationServiceId.trim(),
    scopePath: input.scopePath.trim(),
    baselineId: input.baselineId.trim(),
    manifestId: input.manifestId.trim(),
    generationId: input.generationId.trim(),
    schemaVersion: input.schemaVersion.trim()
  };
}

function canonicalTuple(values: string[]): string {
  return values.map((value) => `${value.length}:${value}`).join("|");
}
