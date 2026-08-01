import type { ArchitectureScopeRef } from "../architecture/types";

export type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
export type ArchitectureAspect = "structure" | "behavior" | "information" | "contract" | "constraint";
export type KnowledgeAssertionStatus = "DRAFT" | "CANDIDATE" | "ACCEPTED" | "REJECTED" | "CONFLICTED" | "SUPERSEDED";
export type IdentityCandidateDecision = "UNDECIDED" | "ACCEPTED" | "REJECTED" | "CONFLICTED";
export type ChangeSetStatus = "OPEN" | "COMMITTED" | "REJECTED";
export type WorkingStreamStatus = "ACTIVE" | "FROZEN" | "ARCHIVED";
export type BaselineStatus = "PUBLISHED" | "SUPERSEDED" | "BLOCKED";

export interface LocalePolicy {
  canonicalLocale: string;
  requiredLocales: string[];
  supportedLocales: string[];
}

export interface AnalysisProfile {
  id: string;
  name: string;
  supportedLayers: ArchitectureLayer[];
  supportedAspects: ArchitectureAspect[];
  requiresDdd: boolean;
  extractorKinds: string[];
  version: string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  scopeLevels: string[];
  minimumWriteLevel: string;
  localePolicy: LocalePolicy;
  aliases: Record<string, string[]>;
  extensions: Record<string, unknown>;
}

export interface KnowledgeAssertion {
  id: string;
  semanticIdentity: string;
  factType: string;
  layer: ArchitectureLayer;
  aspect: ArchitectureAspect;
  value: Record<string, unknown>;
  architectureScope: ArchitectureScopeRef;
  status: KnowledgeAssertionStatus;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
  unresolvedQuestions: string[];
  evidenceRefs: string[];
  sourceObservationIds: string[];
  extractorId: string;
  revision: number;
  changeSetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityCandidate {
  id: string;
  semanticIdentity: string;
  sourceObservationId: string;
  targetAssetType: string;
  targetAssetId?: string;
  architectureScope: ArchitectureScopeRef;
  confidence: number;
  matchingEvidence: string[];
  counterEvidence: string[];
  decision: IdentityCandidateDecision;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeSet {
  id: string;
  architectureScope: ArchitectureScopeRef;
  streamId: string;
  sequence: number;
  status: ChangeSetStatus;
  assetRevisionIds: string[];
  relationshipRevisionIds: string[];
  evidenceRefs: string[];
  digest: string;
  createdAt: string;
  committedAt?: string;
}

export interface WorkingStream {
  id: string;
  architectureScope: ArchitectureScopeRef;
  name: string;
  status: WorkingStreamStatus;
  headChangeSetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaselineManifest {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  changeSetId: string;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  publishedAt: string;
}

export interface Baseline {
  id: string;
  architectureScope: ArchitectureScopeRef;
  streamId: string;
  changeSetId: string;
  status: BaselineStatus;
  manifest: BaselineManifest;
  createdAt: string;
  publishedAt?: string;
}

export interface ProjectionManifest {
  id: string;
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  projectionType: "BIZ_KL" | "SYS_KL" | "TECH_KL" | "DIAGRAM" | "CATALOG" | "ALIGNMENT" | "DRIFT" | "CONTEXT_PACK";
  projectionSchemaVersion: string;
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  digest: string;
  generatedAt: string;
}
