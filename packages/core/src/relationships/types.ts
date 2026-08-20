import type { ArchitectureScopeRef } from "../architecture/types";
import type { AssetType } from "../types";

export type RelationshipCode =
  | "OWNS"
  | "PROVIDES"
  | "CONSUMES"
  | "READS"
  | "WRITES"
  | "REFERENCES"
  | "CONTAINS"
  | "EMITS"
  | "SUBSCRIBES"
  | "CARRIES"
  | "GOVERNS"
  | "CONTROLS"
  | "VERIFIES"
  | "OBSERVES"
  | "DECIDES"
  | "IMPACTS"
  | "GENERATES"
  | "CALLS"
  | "RECORDS"
  | "EMITTED_BY"
  | "CONNECTS_TO"
  | "REQUIRES"
  | "USES"
  | "IMPLEMENTS_CONTEXT_FOR"
  | "IMPLEMENTS_DECISION"
  | "VALIDATES";

export type AssetNodeType = AssetType | "applicationService" | "dataEntity" | "dataField" | "apiOperation";

export type RelationshipStrength = "strong" | "medium" | "weak";

export interface RelationshipTypeDefinition {
  code: RelationshipCode;
  allowedSourceTypes: readonly AssetNodeType[];
  allowedTargetTypes: readonly AssetNodeType[];
  forwardPropagation: boolean;
  reversePropagation: boolean;
  strength: RelationshipStrength;
  defaultConfidence: number;
  terminal: boolean;
  description: string;
  version: typeof RELATIONSHIP_ONTOLOGY_VERSION;
}

export interface AssetNodeIdentity extends ArchitectureScopeRef {
  nodeType: AssetNodeType;
  logicalId: string;
  rootAssetType: AssetType;
  rootAssetId: string;
  parentLogicalId?: string;
  /** External endpoint references are resolved by the owning MCP command. */
  external?: boolean;
}

export interface RelationshipCardinalityMetadata {
  min: 0 | 1;
  max: 1 | "many";
}

export interface ExtractedRelationshipMetadata {
  relationId?: string;
  mappingIndex?: number;
  mappingCount?: number;
  sourceCardinality?: RelationshipCardinalityMetadata;
  targetCardinality?: RelationshipCardinalityMetadata;
  identifying?: boolean;
  constraintName?: string;
  onUpdate?: string;
  onDelete?: string;
  evidenceRefs?: string[];
  externalTarget?: {
    modelId: string;
    entityId: string;
    fieldId?: string;
  };
}

export const RELATIONSHIP_ONTOLOGY_VERSION = "specforge.relationships.v2" as const;
