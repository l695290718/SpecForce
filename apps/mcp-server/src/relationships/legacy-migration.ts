import type { ArchitectureScopeRef, RelationshipCode } from "@specforge/core";

export const LEGACY_RELATION_MIGRATION_VERSION = "specforge.legacy-asset-links.v1" as const;

export type LegacyCallRole = "consuming" | "providing";

export interface LegacyAssetLink {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description?: string;
  architectureScope?: ArchitectureScopeRef;
  metadata?: {
    legacyCallRole?: LegacyCallRole | string;
  };
}

export interface CanonicalAssetLink {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: RelationshipCode;
  description?: string;
  architectureScope?: ArchitectureScopeRef;
}

export type LegacyRelationMigrationErrorCode =
  | "LEGACY_RELATION_UNKNOWN"
  | "LEGACY_RELATION_AMBIGUOUS";

export class LegacyRelationMigrationError extends Error {
  constructor(
    public readonly code: LegacyRelationMigrationErrorCode,
    public readonly relationType: string
  ) {
    super(`${code}: ${relationType}`);
    this.name = "LegacyRelationMigrationError";
  }
}

interface DirectMigrationRule {
  readonly kind: "direct";
  readonly relationTypes: readonly RelationshipCode[];
}

interface CallsMigrationRule {
  readonly kind: "calls";
  readonly relationTypesByRole: Readonly<Record<LegacyCallRole, RelationshipCode>>;
}

type LegacyRelationMigrationRule = DirectMigrationRule | CallsMigrationRule;

type RegisteredLegacyRelationCode = RelationshipCode | "READS-WRITES" | "CALLS";

export interface LegacyRelationMigrationRegistry {
  readonly version: typeof LEGACY_RELATION_MIGRATION_VERSION;
  readonly mappings: Readonly<Record<RegisteredLegacyRelationCode, LegacyRelationMigrationRule>>;
}

const direct = (...relationTypes: readonly RelationshipCode[]): DirectMigrationRule => ({ kind: "direct", relationTypes });

export const legacyRelationMigrationRegistry: LegacyRelationMigrationRegistry = {
  version: LEGACY_RELATION_MIGRATION_VERSION,
  mappings: {
    OWNS: direct("OWNS"),
    PROVIDES: direct("PROVIDES"),
    CONSUMES: direct("CONSUMES"),
    READS: direct("READS"),
    WRITES: direct("WRITES"),
    REFERENCES: direct("REFERENCES"),
    CONTAINS: direct("CONTAINS"),
    EMITS: direct("EMITS"),
    SUBSCRIBES: direct("SUBSCRIBES"),
    CARRIES: direct("CARRIES"),
    GOVERNS: direct("GOVERNS"),
    CONTROLS: direct("CONTROLS"),
    VERIFIES: direct("VERIFIES"),
    OBSERVES: direct("OBSERVES"),
    DECIDES: direct("DECIDES"),
    IMPACTS: direct("IMPACTS"),
    GENERATES: direct("GENERATES"),
    "READS-WRITES": direct("READS", "WRITES"),
    CALLS: {
      kind: "calls",
      relationTypesByRole: {
        consuming: "CONSUMES",
        providing: "PROVIDES"
      }
    }
  }
};

export function normalizeLegacyAssetLink(link: LegacyAssetLink): CanonicalAssetLink[] {
  const legacyCode = link.relationType.trim().toUpperCase();
  const rule = legacyRelationMigrationRegistry.mappings[legacyCode as RegisteredLegacyRelationCode];
  if (!rule) throw new LegacyRelationMigrationError("LEGACY_RELATION_UNKNOWN", link.relationType);

  const relationTypes = rule.kind === "direct"
    ? rule.relationTypes
    : [relationTypeForCallRole(link, rule)];

  return relationTypes.map((relationType) => canonicalAssetLink(link, relationType));
}

function relationTypeForCallRole(link: LegacyAssetLink, rule: CallsMigrationRule): RelationshipCode {
  const role = link.metadata?.legacyCallRole;
  if (role !== "consuming" && role !== "providing") {
    throw new LegacyRelationMigrationError("LEGACY_RELATION_AMBIGUOUS", link.relationType);
  }
  return rule.relationTypesByRole[role];
}

function canonicalAssetLink(link: LegacyAssetLink, relationType: RelationshipCode): CanonicalAssetLink {
  return {
    sourceType: link.sourceType,
    sourceId: link.sourceId,
    targetType: link.targetType,
    targetId: link.targetId,
    relationType,
    ...(link.description === undefined ? {} : { description: link.description }),
    ...(link.architectureScope === undefined ? {} : { architectureScope: link.architectureScope })
  };
}
