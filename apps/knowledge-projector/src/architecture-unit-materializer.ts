import {
  contentDigest,
  validateArchitectureUnit,
  validateArchitectureUnitMember,
  validateArchitectureUnitMapping,
  type ArchitectureMapIdentity,
  type ArchitectureUnitMappingEndpoints,
  type ArchitectureUnitMappingProjection,
  type ArchitectureUnitMemberProjection,
  type ArchitectureUnitProjection,
  type ArchitectureScopeRef
} from "@specforge/core";

export interface ArchitectureUnitSourceFact extends ArchitectureUnitProjection {
  sourceType: "architecture-unit";
}

export interface ArchitectureUnitMemberSourceFact extends ArchitectureUnitMemberProjection {
  sourceType: "architecture-unit-member";
}

export interface ArchitectureUnitMappingSourceFact extends ArchitectureUnitMappingProjection {
  sourceType: "architecture-unit-mapping";
  sourceEndpoints?: ArchitectureUnitMappingEndpoints;
}

export interface ArchitectureUnitMaterializationInput extends ArchitectureMapIdentity {
  units: readonly ArchitectureUnitSourceFact[];
  members: readonly ArchitectureUnitMemberSourceFact[];
  mappings: readonly ArchitectureUnitMappingSourceFact[];
}

export interface ArchitectureUnitMaterialization {
  architectureScope: ArchitectureScopeRef;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  units: ArchitectureUnitProjection[];
  members: ArchitectureUnitMemberProjection[];
  mappings: ArchitectureUnitMappingProjection[];
  contentDigest: string;
}

export function materializeArchitectureUnits(input: ArchitectureUnitMaterializationInput): ArchitectureUnitMaterialization {
  const identity: ArchitectureMapIdentity = {
    applicationServiceId: input.applicationServiceId,
    scopePath: input.scopePath,
    generationId: input.generationId,
    baselineId: input.baselineId,
    projectionManifestId: input.projectionManifestId
  };

  const units = input.units.map((source) => validateUnit(source, identity));
  const unitByIdentity = new Map(units.map((unit) => [unit.unitIdentity, unit]));
  const members = input.members.map((source) => validateMember(source, identity, unitByIdentity));
  const mappings = input.mappings.map((source) => validateMapping(source, identity, unitByIdentity));

  const orderedUnits = [...units].sort(compareUnits);
  const orderedMembers = [...members].sort(compareMembers);
  const orderedMappings = [...mappings].sort(compareMappings);
  const result = {
    architectureScope: { applicationServiceId: identity.applicationServiceId, scopePath: identity.scopePath },
    generationId: identity.generationId,
    baselineId: identity.baselineId,
    projectionManifestId: identity.projectionManifestId,
    units: orderedUnits,
    members: orderedMembers,
    mappings: orderedMappings
  };

  return { ...result, contentDigest: contentDigest(result) };
}

function validateUnit(source: ArchitectureUnitSourceFact, identity: ArchitectureMapIdentity): ArchitectureUnitProjection {
  assertFactType(source.sourceType, "ARCHITECTURE_UNIT_SOURCE_TYPE_INVALID");
  assertIdentity(source, identity);
  try {
    return validateArchitectureUnit(stripSourceType(source));
  } catch (error) {
    throw normalizeValidationError(error);
  }
}

function validateMember(
  source: ArchitectureUnitMemberSourceFact,
  identity: ArchitectureMapIdentity,
  units: ReadonlyMap<string, ArchitectureUnitProjection>
): ArchitectureUnitMemberProjection {
  assertFactType(source.sourceType, "ARCHITECTURE_UNIT_MEMBER_SOURCE_TYPE_INVALID");
  assertIdentity(source, identity);
  try {
    const member = validateArchitectureUnitMember(stripSourceType(source));
    if (!units.has(member.unitIdentity)) throw new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_ENDPOINT_UNRESOLVED");
    return member;
  } catch (error) {
    throw normalizeValidationError(error);
  }
}

function validateMapping(
  source: ArchitectureUnitMappingSourceFact,
  identity: ArchitectureMapIdentity,
  units: ReadonlyMap<string, ArchitectureUnitProjection>
): ArchitectureUnitMappingProjection {
  assertFactType(source.sourceType, "ARCHITECTURE_UNIT_MAPPING_SOURCE_TYPE_INVALID");
  assertIdentity(source, identity);
  try {
    const mapping = validateArchitectureUnitMapping(stripSourceType(source), source.sourceEndpoints);
    const sourceUnit = units.get(mapping.sourceUnitIdentity);
    const targetUnit = units.get(mapping.targetUnitIdentity);
    if (!sourceUnit || !targetUnit) throw new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_ENDPOINT_UNRESOLVED");
    validateArchitectureUnitMapping(mapping, { source: sourceUnit, target: targetUnit });
    return mapping;
  } catch (error) {
    throw normalizeValidationError(error);
  }
}

function assertFactType(value: string, code: string): void {
  if (!value) throw new ArchitectureUnitMaterializationError(code);
}

function assertIdentity(value: ArchitectureScopeRef & { generationId: string; baselineId: string; projectionManifestId: string }, identity: ArchitectureMapIdentity): void {
  if (value.applicationServiceId !== identity.applicationServiceId || value.scopePath !== identity.scopePath) throw new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_SCOPE_MISMATCH");
  if (value.generationId !== identity.generationId || value.baselineId !== identity.baselineId || value.projectionManifestId !== identity.projectionManifestId) throw new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_PROJECTION_IDENTITY_MISMATCH");
}

function normalizeValidationError(error: unknown): ArchitectureUnitMaterializationError {
  if (error instanceof ArchitectureUnitMaterializationError) return error;
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "ARCHITECTURE_UNIT_INVALID";
  if (code === "ARCHITECTURE_UNIT_MAPPING_SCOPE_MISMATCH") return new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_SCOPE_MISMATCH");
  if (code === "ARCHITECTURE_UNIT_MAPPING_SOURCE_ENDPOINT_MISSING" || code === "ARCHITECTURE_UNIT_MAPPING_TARGET_ENDPOINT_MISSING" || code.includes("ENDPOINT")) return new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_ENDPOINT_UNRESOLVED");
  if (code === "ARCHITECTURE_UNIT_KIND_LAYER_MISMATCH") return new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_INVALID_KIND");
  if (code === "ARCHITECTURE_UNIT_CANONICAL_NAME_REQUIRED") return new ArchitectureUnitMaterializationError("ARCHITECTURE_UNIT_ENGLISH_REQUIRED");
  return new ArchitectureUnitMaterializationError(code);
}

function stripSourceType<T extends { sourceType: string }>(source: T): Omit<T, "sourceType" | "sourceEndpoints"> {
  const { sourceType: _sourceType, sourceEndpoints: _sourceEndpoints, ...projection } = source as T & { sourceEndpoints?: unknown };
  return projection as Omit<T, "sourceType" | "sourceEndpoints">;
}

function compareUnits(left: ArchitectureUnitProjection, right: ArchitectureUnitProjection): number {
  return compareText(left.parentUnitIdentity ?? "", right.parentUnitIdentity ?? "")
    || right.criticality - left.criticality
    || compareText(left.canonicalName, right.canonicalName)
    || compareText(left.unitIdentity, right.unitIdentity);
}

function compareMembers(left: ArchitectureUnitMemberProjection, right: ArchitectureUnitMemberProjection): number {
  return compareText(left.unitIdentity, right.unitIdentity)
    || compareText(left.semanticIdentity, right.semanticIdentity)
    || compareText(left.assertionId, right.assertionId);
}

function compareMappings(left: ArchitectureUnitMappingProjection, right: ArchitectureUnitMappingProjection): number {
  return compareText(left.sourceUnitIdentity, right.sourceUnitIdentity)
    || compareText(left.targetUnitIdentity, right.targetUnitIdentity)
    || compareText(left.mappingFamily, right.mappingFamily)
    || compareText(left.mappingIdentity, right.mappingIdentity);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "variant" });
}

export class ArchitectureUnitMaterializationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ArchitectureUnitMaterializationError";
  }
}
