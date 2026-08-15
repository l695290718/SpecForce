import type { ArchitectureScopeRef } from "../architecture/types";
import type { ArchitectureLayer } from "../knowledge/types";
import type { ArchitectureUnitKind } from "../architecture-map/types";

export type ArchitectureFactStatus = "CANDIDATE" | "ACCEPTED" | "REJECTED";

export interface ArchitectureLocalizedContent {
  zh: {
    name: string;
    description: string;
  };
}

export interface ArchitectureFactProvenance {
  actor: string;
  model?: string;
  tool?: string;
  runId?: string;
}

export interface ArchitectureUnitRevisionInput {
  id: string;
  unitIdentity: string;
  revision: number;
  layer: ArchitectureLayer;
  kind: ArchitectureUnitKind;
  parentUnitIdentity?: string;
  canonicalName: string;
  canonicalDescription: string;
  localizedContent: ArchitectureLocalizedContent;
  aliases: string[];
  criticality: number;
  evidenceRefs: string[];
}

export interface ArchitectureUnitMembershipRevisionInput {
  id: string;
  membershipIdentity: string;
  revision: number;
  unitIdentity: string;
  assertionId?: string;
  assetType?: string;
  assetId?: string;
  semanticIdentity: string;
  confidence: number;
  evidenceRefs: string[];
}

export interface ArchitectureUnitMappingRevisionInput {
  id: string;
  mappingIdentity: string;
  revision: number;
  sourceUnitIdentity: string;
  targetUnitIdentity: string;
  mappingFamily: string;
  confidence: number;
  relationshipIdentities: string[];
  evidenceRefs: string[];
}

export interface ArchitectureFactBatchSubmission {
  id: string;
  idempotencyKey: string;
  designChangeSessionId: string;
  architectureScope: ArchitectureScopeRef;
  provenance: ArchitectureFactProvenance;
  evidenceRefs: string[];
  units: ArchitectureUnitRevisionInput[];
  memberships: ArchitectureUnitMembershipRevisionInput[];
  mappings: ArchitectureUnitMappingRevisionInput[];
}

export interface ArchitectureFactResolution {
  unitIdentities: ReadonlySet<string>;
  assertionIds: ReadonlySet<string>;
  assetKeys: ReadonlySet<string>;
  relationshipIdentities: ReadonlySet<string>;
}

export interface ValidatedArchitectureFactBatch extends ArchitectureFactBatchSubmission {
  canonicalBytes: number;
  contentDigest: string;
}

export interface ArchitectureFactBatchReceipt {
  id: string;
  idempotencyKey: string;
  architectureScope: ArchitectureScopeRef;
  designChangeSessionId: string;
  status: ArchitectureFactStatus | "REJECTED";
  unitRevisionIds: string[];
  membershipRevisionIds: string[];
  mappingRevisionIds: string[];
  evidenceRefs: string[];
  contentDigest: string;
  idempotent: boolean;
  createdAt: string;
}

export interface ArchitectureFactPromotionReceipt {
  id: string;
  architectureScope: ArchitectureScopeRef;
  promotionDecisionId: string;
  architectureFactBatchId: string;
  architectureFactRevisionIds: string[];
  changeSetId: string;
  changeSetSequence: number;
  sourceDigest: string;
  idempotent: boolean;
  createdAt: string;
}
