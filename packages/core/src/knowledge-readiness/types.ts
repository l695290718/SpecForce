export type KnowledgeDimension = "DESIGN_INTENT" | "IMPLEMENTATION" | "RUNTIME";
export type KnowledgeProfileId = "DESIGN_CATALOG_CURATION" | "ARCHITECTURE_OVERVIEW" | "CHANGE_ASSESSMENT" | "RUNTIME_DIAGNOSIS";
export type KnowledgeTrustStatus = "SELF_CONTAINED" | "SOURCE_CHECK_REQUIRED" | "BLOCKED";
export type KnowledgeSourceRole =
  | "DESIGN_CATALOG"
  | "SOURCE_CODE"
  | "API_SCHEMA"
  | "DATA_SCHEMA"
  | "TEST_EVIDENCE"
  | "DEPLOYMENT"
  | "RUNTIME_TELEMETRY";

export type KnowledgeReasonCode =
  | "KNOWLEDGE_SOURCE_NOT_CONFIGURED"
  | "KNOWLEDGE_COVERAGE_INCOMPLETE"
  | "KNOWLEDGE_STALE"
  | "KNOWLEDGE_FULL_SNAPSHOT_REQUIRED"
  | "KNOWLEDGE_PENDING_PROMOTION"
  | "KNOWLEDGE_RECONCILIATION_BLOCKED"
  | "KNOWLEDGE_CONFLICT_UNRESOLVED"
  | "KNOWLEDGE_RECEIPT_STALE"
  | "KNOWLEDGE_POLICY_VIOLATION"
  | "KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED"
  | "KNOWLEDGE_SCOPE_ACCESS_DENIED";

export type KnowledgeRemediationAction =
  | "START_FULL_SCAN"
  | "RESUME_CONNECTOR"
  | "REVIEW_CANDIDATES"
  | "RESOLVE_CONFLICT"
  | "RUN_RECONCILIATION";

export interface KnowledgeSourceRequirement {
  role: KnowledgeSourceRole;
  dimension: KnowledgeDimension;
  maximumFreshnessSeconds: number;
  maximumClockSkewSeconds: number;
  requireFullSnapshot: boolean;
}

export interface KnowledgeReadinessPolicy {
  id: string;
  version: number;
  profileRequirements: Record<KnowledgeProfileId, readonly KnowledgeSourceRequirement[]>;
  profileGuards: Record<KnowledgeProfileId, {
    requirePublishedBaseline: boolean;
    reconciliation: "CONVERGED" | "NOT_BLOCKED";
  }>;
  blockOnUnresolvedConflict: boolean;
  blockOnNonConvergedReconciliation: boolean;
  responseBudget: {
    assets: number;
    relationships: number;
    bytes: number;
    executionMilliseconds: number;
  };
  receiptTtlSeconds: number;
  retentionDays: number;
}

export interface KnowledgeReadinessPolicyOverlay {
  id: string;
  version: number;
  profileId: KnowledgeProfileId;
  additionalSources?: readonly KnowledgeSourceRequirement[];
  maximumFreshnessSeconds?: Partial<Record<KnowledgeSourceRole, number>>;
  maximumClockSkewSeconds?: Partial<Record<KnowledgeSourceRole, number>>;
  responseBudget?: Partial<KnowledgeReadinessPolicy["responseBudget"]>;
  receiptTtlSeconds?: number;
  retentionDays?: number;
}

export interface KnowledgeEvidenceSource {
  role: KnowledgeSourceRole;
  authority: "SPECFORGE" | "EXTERNAL";
  fullSnapshotCompleted: boolean;
  snapshotId: string | null;
  waterline: string;
  observedAt: Date;
  receivedAt: Date;
  pendingCount: number;
  openTombstoneCount: number;
}

export interface KnowledgeEvidenceSnapshot {
  baseline: { id: string; digest: string; publishedAt: Date } | null;
  catalogWaterline: string;
  relationshipWaterline: string;
  reconciliation: { id: string; status: string; digest: string; createdAt: Date } | null;
  sources: readonly KnowledgeEvidenceSource[];
  unresolvedConflictCount: number;
  pendingCandidateCount: number;
}

export interface KnowledgeDimensionStatus {
  dimension: KnowledgeDimension;
  status: KnowledgeTrustStatus;
  reasonCodes: readonly KnowledgeReasonCode[];
}

export interface KnowledgeReadinessDecision {
  trustStatus: KnowledgeTrustStatus;
  dimensionStatuses: readonly KnowledgeDimensionStatus[];
  reasonCodes: readonly KnowledgeReasonCode[];
  remediationActions: readonly KnowledgeRemediationAction[];
  validUntil: Date;
}
