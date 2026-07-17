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
}

export const RELATIONSHIP_ONTOLOGY_VERSION = "specforge.relationships.v2" as const;
