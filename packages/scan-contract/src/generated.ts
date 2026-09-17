// Code generated from schema/scan-contract-v2.schema.json. DO NOT EDIT.

export interface ArchitectureScope {
  applicationServiceId: string;
  scopePath: string;
}

export interface ScanLimits {
  maxObservationsPerBatch: number;
  maxBatchBytes: number;
  maxExcerptBytes: number;
  maxSourceFileBytes: number;
  maxObservationsPerSession: number;
}

export type CapabilityCoverageState = "FULL" | "PARTIAL" | "DISCOVERY_ONLY" | "SEMANTIC_REVIEW_REQUIRED" | "UNSUPPORTED" | "NOT_APPLICABLE";

export interface TechnologyDetection {
  ecosystem: string;
  framework: string;
  versionRange: string;
  confidence: number;
  evidenceRefs: Array<string>;
  conflicts: Array<string>;
}

export interface TechnologyProfile {
  detections: Array<TechnologyDetection>;
  conflicts: Array<string>;
  digest: Sha256;
}

export interface AssetCapability {
  assetFamily: string;
  framework: string;
  state: CapabilityCoverageState;
  required: boolean;
  reasonCodes: Array<string>;
  extractorIds: Array<string>;
}

export interface AssetCoveragePlan {
  assetFamilies: Array<string>;
  capabilities: Array<AssetCapability>;
  complete: boolean;
  digest: Sha256;
}

export interface ScanPolicyReceipt {
  systemGovernanceDigest: Sha256;
  extractorCatalogDigest: Sha256;
  semanticPromptPackDigest: Sha256;
  scopeRuntimeProfileDigest: Sha256;
  effectivePolicyDigest: Sha256;
}

export interface RepositoryPolicy {
  allowDirtyWorktree: boolean;
  ignorePatterns: Array<string>;
}

export interface ScannerArtifact {
  uri: string;
  sha256: Sha256;
  sizeBytes: number;
}

export interface ExtractorDescriptor {
  id: string;
  version: string;
}

export type ScannerReleaseStatus = "ACTIVE" | "REVOKED" | "RETIRED";

export interface ScannerReleaseManifest {
  contractVersion: "2.0";
  releaseId: string;
  scannerVersion: string;
  platform: string;
  artifact: ScannerArtifact;
  schemaVersions: Array<string>;
  extractors: Array<ExtractorDescriptor>;
  signingKeyId: string;
  algorithm: "Ed25519";
  issuedAt: string;
  expiresAt: string;
  status: ScannerReleaseStatus;
  signature: string;
}

export interface ScanSessionDescriptor {
  contractVersion: "2.0";
  sessionId: string;
  architectureScope: ArchitectureScope;
  actorId: string;
  connectorId: string;
  scannerReleaseId: string;
  sessionNonce: string;
  expiresAt: string;
  repositoryPolicy: RepositoryPolicy;
  limits: ScanLimits;
  policyReceipt: ScanPolicyReceipt;
  technologyProfile: TechnologyProfile;
  coveragePlan: AssetCoveragePlan;
  expectedPreviousBatchDigest: Sha256 | null;
}

export type ArchitectureLayer = "BIZ" | "SYS" | "TECH" | "UNKNOWN";

export type RepositorySnapshotKind = "COMMIT" | "DIRTY_MANIFEST";

export interface RepositoryIdentity {
  repositoryId: string;
  snapshotKind: RepositorySnapshotKind;
  snapshotDigest: Sha256;
  commit: string | null;
}

export interface SourceLocation {
  path: string;
  symbol: string | null;
  lineStart: number | null;
  lineEnd: number | null;
}

export interface ParserDescriptor {
  id: string;
  version: string;
}

export type SensitivityClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export type RedactionStatus = "NONE" | "REDACTED" | "BLOCKED";

export interface RedactionResult {
  status: RedactionStatus;
  reasons: Array<string>;
}

export type EvidenceKind = "SOURCE_EXCERPT" | "CONTENT_ADDRESS" | "MANIFEST_ENTRY";

export interface ObservationEvidenceRef {
  id: string;
  kind: EvidenceKind;
  digest: Sha256;
  excerpt?: string;
}

export interface SourceObservationV2 {
  id: string;
  observationType: string;
  architectureLayer: ArchitectureLayer;
  aspectHint: string | null;
  repository: RepositoryIdentity;
  source: SourceLocation;
  parser: ParserDescriptor;
  payload: Record<string, unknown>;
  sensitivity: SensitivityClassification;
  redaction: RedactionResult;
  evidenceRefs: Array<ObservationEvidenceRef>;
  normalizedDigest: Sha256;
  warnings: Array<string>;
  coverageGaps: Array<string>;
}

export interface ScanCoverageDelta {
  indexedFiles: number;
  skippedFiles: number;
  observationCount: number;
  coverageGaps: Array<string>;
}

export interface KnowledgeScanBatch {
  contractVersion: "2.0";
  sessionId: string;
  sequence: number;
  previousBatchDigest: Sha256 | null;
  sessionNonceDigest: Sha256;
  architectureScope: ArchitectureScope;
  observations: Array<SourceObservationV2>;
  coverageDelta: ScanCoverageDelta;
  batchDigest: Sha256;
}

export type ScanSessionStatus = "OPEN" | "RECEIVING" | "FINALIZING" | "READY_FOR_ANALYSIS" | "BLOCKED" | "PUBLISHED" | "EXPIRED";

export interface ScanCheckpoint {
  contractVersion: "2.0";
  sessionId: string;
  architectureScope: ArchitectureScope;
  latestAcceptedSequence: number;
  cumulativeDigest: Sha256 | null;
  observationCount: number;
  status: ScanSessionStatus;
}

export interface ScanFinalization {
  contractVersion: "2.0";
  sessionId: string;
  architectureScope: ArchitectureScope;
  repositorySnapshotDigest: Sha256;
  manifestDigest: Sha256;
  finalBatchDigest: Sha256;
  batchCount: number;
  observationCount: number;
  coverage: ScanCoverageDelta;
  coveragePlan: AssetCoveragePlan;
  policyReceipt: ScanPolicyReceipt;
  generatedAt: string;
}

export type Sha256 = string;
