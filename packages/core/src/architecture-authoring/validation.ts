import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import { ArchitectureUnitKind } from "../architecture-map/types";
import { type ArchitectureFactBatchSubmission, type ArchitectureFactResolution, type ValidatedArchitectureFactBatch } from "./types";

export const ARCHITECTURE_FACT_BATCH_LIMITS = {
  maxUnits: 100,
  maxMemberships: 1_000,
  maxMappings: 500,
  maxCanonicalBytes: 4 * 1024 * 1024
} as const;

const unitKindsByLayer: Record<"BIZ" | "SYS" | "TECH", readonly ArchitectureUnitKind[]> = {
  BIZ: ["CAPABILITY", "PROCESS", "BUSINESS_OBJECT"],
  SYS: ["APPLICATION", "SERVICE", "COMPONENT", "DATA_DOMAIN"],
  TECH: ["PLATFORM", "RUNTIME", "INFRASTRUCTURE", "TECHNOLOGY_SERVICE"]
};

export function validateArchitectureFactBatch(
  submission: ArchitectureFactBatchSubmission,
  resolved: ArchitectureFactResolution
): ValidatedArchitectureFactBatch {
  assertScope(submission.architectureScope);
  required(submission.id, "ARCHITECTURE_FACT_BATCH_ID_REQUIRED");
  required(submission.idempotencyKey, "ARCHITECTURE_FACT_IDEMPOTENCY_KEY_REQUIRED");
  required(submission.designChangeSessionId, "ARCHITECTURE_FACT_DESIGN_SESSION_REQUIRED");
  required(submission.provenance.actor, "ARCHITECTURE_FACT_ACTOR_REQUIRED");
  nonEmptyStrings(submission.evidenceRefs, "ARCHITECTURE_FACT_EVIDENCE_REQUIRED");
  if (submission.units.length > ARCHITECTURE_FACT_BATCH_LIMITS.maxUnits) throw new Error("ARCHITECTURE_FACT_UNIT_BATCH_LIMIT_EXCEEDED");
  if (submission.memberships.length > ARCHITECTURE_FACT_BATCH_LIMITS.maxMemberships) throw new Error("ARCHITECTURE_FACT_MEMBERSHIP_BATCH_LIMIT_EXCEEDED");
  if (submission.mappings.length > ARCHITECTURE_FACT_BATCH_LIMITS.maxMappings) throw new Error("ARCHITECTURE_FACT_MAPPING_BATCH_LIMIT_EXCEEDED");

  const unitIds = new Set<string>();
  for (const unit of submission.units) {
    required(unit.id, "ARCHITECTURE_UNIT_REVISION_ID_REQUIRED");
    required(unit.unitIdentity, "ARCHITECTURE_UNIT_IDENTITY_REQUIRED");
    if (!unit.unitIdentity.startsWith("unit:")) throw new Error("ARCHITECTURE_UNIT_IDENTITY_INVALID");
    if (unitIds.has(unit.unitIdentity)) throw new Error("ARCHITECTURE_UNIT_IDENTITY_DUPLICATE");
    unitIds.add(unit.unitIdentity);
    if (!Number.isInteger(unit.revision) || unit.revision < 1) throw new Error("ARCHITECTURE_UNIT_REVISION_INVALID");
    if (!unitKindsByLayer[unit.layer].includes(unit.kind)) throw new Error("ARCHITECTURE_UNIT_KIND_LAYER_MISMATCH");
    required(unit.canonicalName, "ARCHITECTURE_UNIT_ENGLISH_NAME_REQUIRED");
    required(unit.canonicalDescription, "ARCHITECTURE_UNIT_ENGLISH_DESCRIPTION_REQUIRED");
    required(unit.localizedContent?.zh?.name, "ARCHITECTURE_UNIT_CHINESE_NAME_REQUIRED");
    required(unit.localizedContent?.zh?.description, "ARCHITECTURE_UNIT_CHINESE_DESCRIPTION_REQUIRED");
    nonEmptyStrings(unit.aliases, "ARCHITECTURE_UNIT_ALIASES_INVALID");
    bounded(unit.criticality, "ARCHITECTURE_UNIT_CRITICALITY_INVALID");
    nonEmptyStrings(unit.evidenceRefs, "ARCHITECTURE_UNIT_EVIDENCE_REQUIRED");
  }
  for (const unit of submission.units) {
    if (unit.parentUnitIdentity && (!unit.parentUnitIdentity.startsWith("unit:") || (!unitIds.has(unit.parentUnitIdentity) && !resolved.unitIdentities.has(unit.parentUnitIdentity)))) throw new Error("ARCHITECTURE_UNIT_PARENT_UNRESOLVED");
  }

  const membershipIds = new Set<string>();
  for (const member of submission.memberships) {
    required(member.id, "ARCHITECTURE_MEMBERSHIP_REVISION_ID_REQUIRED");
    required(member.membershipIdentity, "ARCHITECTURE_MEMBERSHIP_IDENTITY_REQUIRED");
    if (membershipIds.has(member.membershipIdentity)) throw new Error("ARCHITECTURE_MEMBERSHIP_IDENTITY_DUPLICATE");
    membershipIds.add(member.membershipIdentity);
    if (!unitIds.has(member.unitIdentity) && !resolved.unitIdentities.has(member.unitIdentity)) throw new Error("ARCHITECTURE_MEMBERSHIP_UNIT_UNRESOLVED");
    if (Boolean(member.assertionId) === Boolean(member.assetType && member.assetId)) throw new Error("ARCHITECTURE_MEMBERSHIP_SELECTOR_INVALID");
    if (member.assertionId && !resolved.assertionIds.has(member.assertionId)) throw new Error("ARCHITECTURE_MEMBERSHIP_ASSERTION_UNRESOLVED");
    if (member.assetType && member.assetId && !resolved.assetKeys.has(`${member.assetType}:${member.assetId}`)) throw new Error("ARCHITECTURE_MEMBERSHIP_ASSET_UNRESOLVED");
    required(member.semanticIdentity, "ARCHITECTURE_MEMBERSHIP_SEMANTIC_IDENTITY_REQUIRED");
    bounded(member.confidence, "ARCHITECTURE_MEMBERSHIP_CONFIDENCE_INVALID");
    nonEmptyStrings(member.evidenceRefs, "ARCHITECTURE_MEMBERSHIP_EVIDENCE_REQUIRED");
  }

  const mappingIds = new Set<string>();
  for (const mapping of submission.mappings) {
    required(mapping.id, "ARCHITECTURE_MAPPING_REVISION_ID_REQUIRED");
    required(mapping.mappingIdentity, "ARCHITECTURE_MAPPING_IDENTITY_REQUIRED");
    if (mappingIds.has(mapping.mappingIdentity)) throw new Error("ARCHITECTURE_MAPPING_IDENTITY_DUPLICATE");
    mappingIds.add(mapping.mappingIdentity);
    const source = submission.units.find((unit) => unit.unitIdentity === mapping.sourceUnitIdentity);
    const target = submission.units.find((unit) => unit.unitIdentity === mapping.targetUnitIdentity);
    const sourceLayer = source?.layer ?? resolvedLayer(mapping.sourceUnitIdentity, resolved);
    const targetLayer = target?.layer ?? resolvedLayer(mapping.targetUnitIdentity, resolved);
    if (!sourceLayer || !targetLayer) throw new Error("ARCHITECTURE_MAPPING_ENDPOINT_UNRESOLVED");
    if (sourceLayer === targetLayer) throw new Error("ARCHITECTURE_MAPPING_MUST_CROSS_LAYERS");
    if (!((sourceLayer === "BIZ" && targetLayer === "SYS") || (sourceLayer === "SYS" && targetLayer === "TECH"))) throw new Error("ARCHITECTURE_MAPPING_DIRECTION_INVALID");
    required(mapping.mappingFamily, "ARCHITECTURE_MAPPING_FAMILY_REQUIRED");
    bounded(mapping.confidence, "ARCHITECTURE_MAPPING_CONFIDENCE_INVALID");
    nonEmptyStrings(mapping.relationshipIdentities, "ARCHITECTURE_MAPPING_RELATIONSHIP_REQUIRED");
    if (mapping.relationshipIdentities.some((id) => !resolved.relationshipIdentities.has(id))) throw new Error("ARCHITECTURE_MAPPING_RELATIONSHIP_UNRESOLVED");
    nonEmptyStrings(mapping.evidenceRefs, "ARCHITECTURE_MAPPING_EVIDENCE_REQUIRED");
  }

  const normalized = normalize(submission);
  const canonicalBytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (canonicalBytes > ARCHITECTURE_FACT_BATCH_LIMITS.maxCanonicalBytes) throw new Error("ARCHITECTURE_FACT_CANONICAL_BYTES_LIMIT_EXCEEDED");
  return { ...normalized, canonicalBytes, contentDigest: contentDigest(normalized) };
}

function normalize(submission: ArchitectureFactBatchSubmission): ArchitectureFactBatchSubmission {
  const sortedStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()))].sort();
  return {
    ...submission,
    evidenceRefs: sortedStrings(submission.evidenceRefs),
    provenance: { ...submission.provenance, actor: submission.provenance.actor.trim() },
    units: [...submission.units].map((unit) => ({ ...unit, aliases: sortedStrings(unit.aliases), evidenceRefs: sortedStrings(unit.evidenceRefs) })).sort((a, b) => a.unitIdentity.localeCompare(b.unitIdentity)),
    memberships: [...submission.memberships].map((member) => ({ ...member, evidenceRefs: sortedStrings(member.evidenceRefs) })).sort((a, b) => a.membershipIdentity.localeCompare(b.membershipIdentity)),
    mappings: [...submission.mappings].map((mapping) => ({ ...mapping, relationshipIdentities: sortedStrings(mapping.relationshipIdentities), evidenceRefs: sortedStrings(mapping.evidenceRefs) })).sort((a, b) => a.mappingIdentity.localeCompare(b.mappingIdentity))
  };
}

function resolvedLayer(identity: string, resolved: ArchitectureFactResolution): "BIZ" | "SYS" | "TECH" | undefined {
  return identity.startsWith("unit:biz:") ? "BIZ" : identity.startsWith("unit:sys:") ? "SYS" : identity.startsWith("unit:tech:") ? "TECH" : undefined;
}

function assertScope(scope: ArchitectureScopeRef): void {
  required(scope.applicationServiceId, "ARCHITECTURE_SCOPE_APPLICATION_SERVICE_REQUIRED");
  required(scope.scopePath, "ARCHITECTURE_SCOPE_PATH_REQUIRED");
}

function required(value: unknown, code: string): asserts value {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
}

function nonEmptyStrings(values: string[], code: string): void {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim().length === 0)) throw new Error(code);
}

function bounded(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(code);
}
