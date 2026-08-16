import type { ArchitectureScopeRef } from "../architecture/types";

export const COVERAGE_POLICY_ID = "generic-system" as const;
export const COVERAGE_POLICY_VERSION = "2" as const;
export const COVERAGE_SCHEMA_VERSION = "coverage.v1" as const;

export type CoverageRole = "MEMBERSHIP" | "TRACEABILITY" | "EXEMPTION";
export type CoverageStatus = "COVERED" | "BLOCKED" | "NOT_EVALUATED";

export type CoverageReasonCode =
  | "AMBIGUOUS_MEMBERSHIP"
  | "MISSING_TYPED_PATH"
  | "RELATION_DIRECTION_INVALID"
  | "ENDPOINT_SCOPE_MISMATCH"
  | "ENDPOINT_NOT_FOUND"
  | "UNSUPPORTED_PATH"
  | "MISSING_LOCALIZATION"
  | "SNAPSHOT_UNAVAILABLE";

export interface CoverageAssetRef {
  assetType: string;
  assetId: string;
}

export interface CoveragePathEdge {
  relationshipIdentity: string;
  relationCode: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  architectureScope?: ArchitectureScopeRef;
  scope?: ArchitectureScopeRef;
  sourceScope?: ArchitectureScopeRef;
  targetScope?: ArchitectureScopeRef;
  sourceExists?: boolean;
  targetExists?: boolean;
  [key: string]: unknown;
}

/** A bounded, ordered path of typed relationship evidence. */
export type CoveragePathEvidence = CoveragePathEdge[];

export interface CoverageMembershipCandidate {
  assetType: string;
  assetId: string;
  historical?: boolean;
}

export interface CoverageExemption {
  reason: string;
  owner: string;
  evidenceRefs: string[];
  policyVersion: string;
}

export interface CoverageCandidate {
  exactScope: ArchitectureScopeRef;
  source: CoverageAssetRef;
  generationId?: string;
  sourceDigest?: string;
  path?: CoveragePathEvidence;
  paths?: CoveragePathEvidence[];
  directMemberIds: string[];
  directMemberships?: CoverageMembershipCandidate[];
  historicalDirectMemberIds?: string[];
  knownAssetIds?: string[];
  knownRelationshipIdentities?: string[];
  localization?: { en?: unknown; zh?: unknown };
  snapshotAvailable?: boolean;
  exemption?: CoverageExemption;
}

export interface CoveragePathRule {
  id: string;
  sourceType: string;
  steps: readonly {
    relationCode: string;
    sourceType: string;
    targetType: string | readonly string[];
  }[];
  precedence: number;
}

export interface CoveragePolicy {
  id: string;
  version: string;
  schemaVersion: string;
  maxPathLength: number;
  membershipAssetTypes: readonly string[];
  traceabilityAssetTypes: readonly string[];
  requiresLocalization: boolean;
  requiresSnapshot: boolean;
  pathRules: readonly CoveragePathRule[];
}

export interface CoverageResult {
  exactScope: ArchitectureScopeRef;
  generationId?: string;
  source: CoverageAssetRef;
  sourceDigest?: string;
  role: CoverageRole;
  status: CoverageStatus;
  terminalMemberId?: string;
  path?: CoveragePathEvidence;
  reasonCode?: CoverageReasonCode;
  diagnosticRef?: string;
  rowDigest: string;
}

export interface CoverageBuildKeyInput {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  generationId: string;
  profileId: string;
  profileVersion: string;
  coverageSchemaVersion: string;
  catalogVersion: string;
  catalogDigest: string;
  relationshipVersion: string;
  relationshipDigest: string;
  query: Record<string, unknown>;
  attempt?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type CoverageInputDigest = CoverageBuildKeyInput | Record<string, unknown>;
