import type { ArchitectureScopeRef } from "../architecture/types";
import type { ArchitectureLayer } from "../knowledge/types";

export type ArchitectureUnitKind =
  | "CAPABILITY"
  | "PROCESS"
  | "BUSINESS_OBJECT"
  | "APPLICATION"
  | "SERVICE"
  | "COMPONENT"
  | "DATA_DOMAIN"
  | "PLATFORM"
  | "RUNTIME"
  | "INFRASTRUCTURE"
  | "TECHNOLOGY_SERVICE";

const unitKindsByLayer: Record<ArchitectureLayer, readonly ArchitectureUnitKind[]> = {
  BIZ: ["CAPABILITY", "PROCESS", "BUSINESS_OBJECT"],
  SYS: ["APPLICATION", "SERVICE", "COMPONENT", "DATA_DOMAIN"],
  TECH: ["PLATFORM", "RUNTIME", "INFRASTRUCTURE", "TECHNOLOGY_SERVICE"]
};

export interface ArchitectureUnitProjection extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  unitIdentity: string;
  layer: ArchitectureLayer;
  kind: ArchitectureUnitKind;
  parentUnitIdentity?: string;
  canonicalName: string;
  localizedName?: string;
  aliases: string[];
  memberCount: number;
  criticality: number;
  completeness: number;
  evidenceCount: number;
  unclassifiedMemberCount: number;
  contentDigest: string;
}

export interface ArchitectureUnitMemberProjection extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  unitIdentity: string;
  assertionId: string;
  assetType?: string;
  semanticIdentity: string;
  contentDigest: string;
}

export interface ArchitectureUnitMappingProjection extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  mappingIdentity: string;
  sourceUnitIdentity: string;
  targetUnitIdentity: string;
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  mappingFamily: string;
  relationshipCount: number;
  evidenceCount: number;
  confidence: number;
  contentDigest: string;
}

export interface ArchitectureMapIdentity extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
}

export interface ArchitectureUnitFilter {
  layers?: ArchitectureLayer[];
  kinds?: ArchitectureUnitKind[];
  mappingFamilies?: string[];
  minCriticality?: number;
  minCompleteness?: number;
  includeUnclassified?: boolean;
  query?: string;
}

export interface ArchitectureUnitProjectionPage {
  units: ArchitectureUnitProjection[];
  totalByLayer: Record<ArchitectureLayer, number>;
  unclassifiedCount: number;
  nextContinuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export type ThreeAPartialReason =
  | "UNIT_BUDGET_EXCEEDED"
  | "MEMBER_BUDGET_EXCEEDED"
  | "MEMBER_RELATION_BUDGET_EXCEEDED"
  | "MAPPING_BUDGET_EXCEEDED"
  | "QUERY_TIMEOUT"
  | "PAYLOAD_BUDGET_EXCEEDED"
  | "CONTINUATION_REQUIRED";

export interface ArchitectureMapBudget {
  maxUnitsPerLayer: number;
  maxMappings: number;
  timeoutMs: number;
  maxPayloadBytes: number;
}

export const DEFAULT_ARCHITECTURE_MAP_BUDGET: Readonly<ArchitectureMapBudget> = {
  maxUnitsPerLayer: 12,
  maxMappings: 60,
  timeoutMs: 2_000,
  maxPayloadBytes: 512_000
};

export interface UnitGraphBudget extends ArchitectureMapBudget {
  maxMembers: number;
  maxMemberRelations: number;
}

export const DEFAULT_UNIT_GRAPH_BUDGET: Readonly<UnitGraphBudget> = {
  ...DEFAULT_ARCHITECTURE_MAP_BUDGET,
  maxMembers: 500,
  maxMemberRelations: 120,
  maxPayloadBytes: 524_288
};

export interface ArchitectureUnitMappingEndpoints {
  source?: Pick<ArchitectureUnitProjection, "applicationServiceId" | "scopePath" | "generationId" | "unitIdentity" | "layer">;
  target?: Pick<ArchitectureUnitProjection, "applicationServiceId" | "scopePath" | "generationId" | "unitIdentity" | "layer">;
}

export class ArchitectureMapValidationError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "ArchitectureMapValidationError";
  }
}

export function validateArchitectureUnit(unit: ArchitectureUnitProjection): ArchitectureUnitProjection {
  assertScopeFields(unit);
  assertGenerationFields(unit);
  assertRequiredText(unit.unitIdentity, "ARCHITECTURE_UNIT_IDENTITY_REQUIRED");
  if (!unit.unitIdentity.startsWith("unit:")) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_IDENTITY_INVALID");
  assertLayerKind(unit.layer, unit.kind);
  assertRequiredText(unit.canonicalName, "ARCHITECTURE_UNIT_CANONICAL_NAME_REQUIRED");
  assertOptionalText(unit.localizedName, "ARCHITECTURE_UNIT_LOCALIZED_NAME_INVALID");
  assertStringArray(unit.aliases, "ARCHITECTURE_UNIT_ALIASES_INVALID");
  assertNonNegativeInteger(unit.memberCount, "ARCHITECTURE_UNIT_MEMBER_COUNT_INVALID");
  assertBoundedNumber(unit.criticality, "ARCHITECTURE_UNIT_CRITICALITY_INVALID");
  assertBoundedNumber(unit.completeness, "ARCHITECTURE_UNIT_COMPLETENESS_INVALID");
  assertNonNegativeInteger(unit.evidenceCount, "ARCHITECTURE_UNIT_EVIDENCE_COUNT_INVALID");
  assertNonNegativeInteger(unit.unclassifiedMemberCount, "ARCHITECTURE_UNIT_UNCLASSIFIED_COUNT_INVALID");
  assertRequiredText(unit.contentDigest, "ARCHITECTURE_UNIT_CONTENT_DIGEST_REQUIRED");
  if (unit.parentUnitIdentity !== undefined) {
    assertRequiredText(unit.parentUnitIdentity, "ARCHITECTURE_UNIT_PARENT_IDENTITY_INVALID");
    if (!unit.parentUnitIdentity.startsWith("unit:")) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_PARENT_IDENTITY_INVALID");
  }
  return unit;
}

export function validateArchitectureUnitMember(member: ArchitectureUnitMemberProjection): ArchitectureUnitMemberProjection {
  assertScopeFields(member);
  assertGenerationFields(member);
  assertUnitIdentity(member.unitIdentity, "ARCHITECTURE_UNIT_MEMBER_UNIT_REQUIRED");
  assertRequiredText(member.assertionId, "ARCHITECTURE_UNIT_MEMBER_ASSERTION_REQUIRED");
  assertOptionalText(member.assetType, "ARCHITECTURE_UNIT_MEMBER_ASSET_TYPE_INVALID");
  assertRequiredText(member.semanticIdentity, "ARCHITECTURE_UNIT_MEMBER_SEMANTIC_IDENTITY_REQUIRED");
  assertRequiredText(member.contentDigest, "ARCHITECTURE_UNIT_MEMBER_CONTENT_DIGEST_REQUIRED");
  return member;
}

export function validateArchitectureUnitMapping(
  mapping: ArchitectureUnitMappingProjection,
  endpoints: ArchitectureUnitMappingEndpoints = {}
): ArchitectureUnitMappingProjection {
  assertScopeFields(mapping);
  assertGenerationFields(mapping);
  assertRequiredText(mapping.mappingIdentity, "ARCHITECTURE_UNIT_MAPPING_IDENTITY_REQUIRED");
  assertUnitIdentity(mapping.sourceUnitIdentity, "ARCHITECTURE_UNIT_MAPPING_SOURCE_REQUIRED");
  assertUnitIdentity(mapping.targetUnitIdentity, "ARCHITECTURE_UNIT_MAPPING_TARGET_REQUIRED");
  if (mapping.sourceUnitIdentity === mapping.targetUnitIdentity) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_MAPPING_SELF_REFERENCE");
  assertLayer(mapping.sourceLayer);
  assertLayer(mapping.targetLayer);
  if (mapping.sourceLayer === mapping.targetLayer) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_MAPPING_MUST_CROSS_LAYERS");
  assertRequiredText(mapping.mappingFamily, "ARCHITECTURE_UNIT_MAPPING_FAMILY_REQUIRED");
  assertNonNegativeInteger(mapping.relationshipCount, "ARCHITECTURE_UNIT_MAPPING_RELATIONSHIP_COUNT_INVALID");
  assertNonNegativeInteger(mapping.evidenceCount, "ARCHITECTURE_UNIT_MAPPING_EVIDENCE_COUNT_INVALID");
  assertBoundedNumber(mapping.confidence, "ARCHITECTURE_UNIT_MAPPING_CONFIDENCE_INVALID");
  assertRequiredText(mapping.contentDigest, "ARCHITECTURE_UNIT_MAPPING_CONTENT_DIGEST_REQUIRED");
  assertEndpoint(mapping, endpoints.source, "source");
  assertEndpoint(mapping, endpoints.target, "target");
  return mapping;
}

export function validateArchitectureMapBudget(budget: ArchitectureMapBudget): ArchitectureMapBudget {
  assertPositiveInteger(budget.maxUnitsPerLayer, "ARCHITECTURE_MAP_UNIT_BUDGET_INVALID");
  assertPositiveInteger(budget.maxMappings, "ARCHITECTURE_MAP_MAPPING_BUDGET_INVALID");
  assertPositiveInteger(budget.timeoutMs, "ARCHITECTURE_MAP_TIMEOUT_INVALID");
  assertPositiveInteger(budget.maxPayloadBytes, "ARCHITECTURE_MAP_PAYLOAD_BUDGET_INVALID");
  return budget;
}

export function validateUnitGraphBudget(budget: UnitGraphBudget): UnitGraphBudget {
  validateArchitectureMapBudget(budget);
  assertPositiveInteger(budget.maxMembers, "UNIT_GRAPH_MEMBER_BUDGET_INVALID");
  assertPositiveInteger(budget.maxMemberRelations, "UNIT_GRAPH_MEMBER_RELATION_BUDGET_INVALID");
  return budget;
}

function assertEndpoint(
  mapping: ArchitectureUnitMappingProjection,
  endpoint: ArchitectureUnitMappingEndpoints["source"],
  side: "source" | "target"
): void {
  if (!endpoint) throw new ArchitectureMapValidationError(`ARCHITECTURE_UNIT_MAPPING_${side.toUpperCase()}_ENDPOINT_MISSING`);
  if (endpoint.applicationServiceId !== mapping.applicationServiceId || endpoint.scopePath !== mapping.scopePath) {
    throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_MAPPING_SCOPE_MISMATCH");
  }
  if (endpoint.generationId !== mapping.generationId) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_MAPPING_GENERATION_MISMATCH");
  const expectedIdentity = side === "source" ? mapping.sourceUnitIdentity : mapping.targetUnitIdentity;
  const expectedLayer = side === "source" ? mapping.sourceLayer : mapping.targetLayer;
  if (endpoint.unitIdentity !== expectedIdentity) throw new ArchitectureMapValidationError(`ARCHITECTURE_UNIT_MAPPING_${side.toUpperCase()}_ENDPOINT_MISMATCH`);
  if (endpoint.layer !== expectedLayer) throw new ArchitectureMapValidationError(`ARCHITECTURE_UNIT_MAPPING_${side.toUpperCase()}_LAYER_MISMATCH`);
}

function assertScopeFields(value: ArchitectureScopeRef): void {
  assertRequiredText(value.applicationServiceId, "ARCHITECTURE_SCOPE_APPLICATION_SERVICE_REQUIRED");
  assertRequiredText(value.scopePath, "ARCHITECTURE_SCOPE_PATH_REQUIRED");
}

function assertGenerationFields(value: Pick<ArchitectureUnitProjection, "generationId" | "baselineId" | "projectionManifestId">): void {
  assertRequiredText(value.generationId, "ARCHITECTURE_PROJECTION_GENERATION_REQUIRED");
  assertRequiredText(value.baselineId, "ARCHITECTURE_PROJECTION_BASELINE_REQUIRED");
  assertRequiredText(value.projectionManifestId, "ARCHITECTURE_PROJECTION_MANIFEST_REQUIRED");
}

function assertUnitIdentity(value: string, code: string): void {
  assertRequiredText(value, code);
  if (!value.startsWith("unit:")) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_IDENTITY_INVALID");
}

function assertLayer(value: ArchitectureLayer): void {
  if (value !== "BIZ" && value !== "SYS" && value !== "TECH") throw new ArchitectureMapValidationError("ARCHITECTURE_LAYER_INVALID");
}

function assertLayerKind(layer: ArchitectureLayer, kind: ArchitectureUnitKind): void {
  assertLayer(layer);
  if (!unitKindsByLayer[layer].includes(kind)) throw new ArchitectureMapValidationError("ARCHITECTURE_UNIT_KIND_LAYER_MISMATCH");
}

function assertRequiredText(value: string, code: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new ArchitectureMapValidationError(code);
}

function assertOptionalText(value: string | undefined, code: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) throw new ArchitectureMapValidationError(code);
}

function assertStringArray(value: string[], code: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) throw new ArchitectureMapValidationError(code);
}

function assertNonNegativeInteger(value: number, code: string): void {
  if (!Number.isInteger(value) || value < 0) throw new ArchitectureMapValidationError(code);
}

function assertPositiveInteger(value: number, code: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new ArchitectureMapValidationError(code);
}

function assertBoundedNumber(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new ArchitectureMapValidationError(code);
}
