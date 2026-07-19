import type { AssetType } from "../types";
import type { ArchitectureScopeRef } from "../architecture/types";

export type ConnectorCapability = "DISCOVER" | "OBSERVE" | "PROPOSE" | "APPLY";
export type ConnectorStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type CandidateFactStatus = "CANDIDATE" | "PROMOTED" | "REJECTED" | "CONFLICTED" | "TOMBSTONED";
export type FactAuthority = "EXTERNAL" | "SPECFORGE" | "SHARED";
export type DesignChangeSessionStatus =
  | "OPEN"
  | "WAITING_FOR_DELIVERY"
  | "WAITING_FOR_REVIEW"
  | "CONFLICTED"
  | "CONVERGED"
  | "BLOCKED"
  | "CLOSED";
export type ReconciliationIssueCode =
  | "UNDECLARED_CHANGE"
  | "MISSING_FACT"
  | "CONTENT_DRIFT"
  | "LOCALIZATION_DRIFT"
  | "RELATIONSHIP_DRIFT"
  | "EVIDENCE_DRIFT"
  | "SCOPE_DRIFT"
  | "IDENTITY_CONFLICT"
  | "DELIVERY_BLOCKED"
  | "SOURCE_UNREACHABLE";

export interface FactProvenance {
  sourceSystem: string;
  connectorInstanceId: string;
  externalIdentity?: string;
  externalVersion?: string;
  sourceTimestamp?: string;
  observedAt: string;
  repositoryCommit?: string;
}

export interface FederatedFactEnvelope {
  id: string;
  architectureScope: ArchitectureScopeRef;
  assetType: AssetType | string;
  schemaVersion: string;
  payload: Record<string, unknown>;
  localizedContent?: { en?: Record<string, unknown>; zh?: Record<string, unknown> };
  normalizedDigest: string;
  provenance: FactProvenance;
  authority: FactAuthority;
  confidence: number;
  status: CandidateFactStatus;
  relationshipRefs?: string[];
  evidenceRefs?: string[];
  designChangeSessionId?: string;
}

export interface SourceObservation {
  id: string;
  architectureScope: ArchitectureScopeRef;
  connectorInstanceId: string;
  sourceNamespace: string;
  externalAssetType: string;
  externalId: string;
  payload: Record<string, unknown>;
  normalizedDigest: string;
  sourceVersion: string;
  observedAt: string;
  status: CandidateFactStatus;
  provenance: FactProvenance;
}

export type IdentityMatchStatus = "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS";

export interface ExternalIdentityMapping {
  id: string;
  architectureScope: ArchitectureScopeRef;
  connectorInstanceId: string;
  sourceNamespace: string;
  externalAssetType: string;
  externalId: string;
  assetType: AssetType | string;
  assetId?: string;
  matchStatus: IdentityMatchStatus;
  normalizedDigest: string;
}

export type PromotionMode = "AUTO" | "REVIEW" | "DISABLED";

export interface AuthorityPolicy {
  id: string;
  architectureScope: ArchitectureScopeRef;
  assetType: AssetType | string;
  fieldPath: string;
  authority: FactAuthority;
  promotionMode: PromotionMode;
  policyVersion: string;
}

export interface DesignChangeSession {
  id: string;
  architectureScope: ArchitectureScopeRef;
  actorId: string;
  intent: string;
  affectedFactIds: string[];
  expectedEvidenceRefs: string[];
  status: DesignChangeSessionStatus;
  openedAt: string;
  updatedAt: string;
}

export interface ReconciliationIssue {
  code: ReconciliationIssueCode;
  message: string;
  factId?: string;
  externalId?: string;
}

export interface ReconciliationInput {
  architectureScope: ArchitectureScopeRef;
  acceptedFacts: FederatedFactEnvelope[];
  observations: SourceObservation[];
  identityMappings: ExternalIdentityMapping[];
  relationshipDrift?: boolean;
  evidenceDrift?: boolean;
  localizationDrift?: boolean;
}

export interface ReconciliationReport {
  architectureScope: ArchitectureScopeRef;
  root: string;
  status: "CONVERGED" | "DRIFTED" | "BLOCKED";
  issues: ReconciliationIssue[];
  factDigests: Array<{ factId: string; digest: string }>;
}
