// Code generated from schema/scan-contract-v2.schema.json. DO NOT EDIT.

package scancontract

type ArchitectureScope struct {
	ApplicationServiceId string `json:"applicationServiceId"`
	ScopePath            string `json:"scopePath"`
}

type ScanLimits struct {
	MaxObservationsPerBatch   int `json:"maxObservationsPerBatch"`
	MaxBatchBytes             int `json:"maxBatchBytes"`
	MaxExcerptBytes           int `json:"maxExcerptBytes"`
	MaxSourceFileBytes        int `json:"maxSourceFileBytes"`
	MaxObservationsPerSession int `json:"maxObservationsPerSession"`
}

type RepositoryPolicy struct {
	AllowDirtyWorktree bool     `json:"allowDirtyWorktree"`
	IgnorePatterns     []string `json:"ignorePatterns"`
}

type ScannerArtifact struct {
	Uri       string `json:"uri"`
	Sha256    Sha256 `json:"sha256"`
	SizeBytes int    `json:"sizeBytes"`
}

type ExtractorDescriptor struct {
	Id      string `json:"id"`
	Version string `json:"version"`
}

type ScannerReleaseStatus string

const (
	ScannerReleaseStatusActive  ScannerReleaseStatus = "ACTIVE"
	ScannerReleaseStatusRevoked ScannerReleaseStatus = "REVOKED"
	ScannerReleaseStatusRetired ScannerReleaseStatus = "RETIRED"
)

type ScannerReleaseManifest struct {
	ContractVersion string                `json:"contractVersion"`
	ReleaseId       string                `json:"releaseId"`
	ScannerVersion  string                `json:"scannerVersion"`
	Platform        string                `json:"platform"`
	Artifact        ScannerArtifact       `json:"artifact"`
	SchemaVersions  []string              `json:"schemaVersions"`
	Extractors      []ExtractorDescriptor `json:"extractors"`
	SigningKeyId    string                `json:"signingKeyId"`
	Algorithm       string                `json:"algorithm"`
	IssuedAt        string                `json:"issuedAt"`
	ExpiresAt       string                `json:"expiresAt"`
	Status          ScannerReleaseStatus  `json:"status"`
	Signature       string                `json:"signature"`
}

type ScanSessionDescriptor struct {
	ContractVersion             string            `json:"contractVersion"`
	SessionId                   string            `json:"sessionId"`
	ArchitectureScope           ArchitectureScope `json:"architectureScope"`
	ActorId                     string            `json:"actorId"`
	ConnectorId                 string            `json:"connectorId"`
	ScannerReleaseId            string            `json:"scannerReleaseId"`
	SessionNonce                string            `json:"sessionNonce"`
	ExpiresAt                   string            `json:"expiresAt"`
	RepositoryPolicy            RepositoryPolicy  `json:"repositoryPolicy"`
	Limits                      ScanLimits        `json:"limits"`
	ExpectedPreviousBatchDigest *Sha256           `json:"expectedPreviousBatchDigest"`
}

type ArchitectureLayer string

const (
	ArchitectureLayerBiz     ArchitectureLayer = "BIZ"
	ArchitectureLayerSys     ArchitectureLayer = "SYS"
	ArchitectureLayerTech    ArchitectureLayer = "TECH"
	ArchitectureLayerUnknown ArchitectureLayer = "UNKNOWN"
)

type RepositorySnapshotKind string

const (
	RepositorySnapshotKindCommit        RepositorySnapshotKind = "COMMIT"
	RepositorySnapshotKindDirtyManifest RepositorySnapshotKind = "DIRTY_MANIFEST"
)

type RepositoryIdentity struct {
	RepositoryId   string                 `json:"repositoryId"`
	SnapshotKind   RepositorySnapshotKind `json:"snapshotKind"`
	SnapshotDigest Sha256                 `json:"snapshotDigest"`
	Commit         *string                `json:"commit"`
}

type SourceLocation struct {
	Path      string  `json:"path"`
	Symbol    *string `json:"symbol"`
	LineStart *int    `json:"lineStart"`
	LineEnd   *int    `json:"lineEnd"`
}

type ParserDescriptor struct {
	Id      string `json:"id"`
	Version string `json:"version"`
}

type SensitivityClassification string

const (
	SensitivityClassificationPublic       SensitivityClassification = "PUBLIC"
	SensitivityClassificationInternal     SensitivityClassification = "INTERNAL"
	SensitivityClassificationConfidential SensitivityClassification = "CONFIDENTIAL"
	SensitivityClassificationRestricted   SensitivityClassification = "RESTRICTED"
)

type RedactionStatus string

const (
	RedactionStatusNone     RedactionStatus = "NONE"
	RedactionStatusRedacted RedactionStatus = "REDACTED"
	RedactionStatusBlocked  RedactionStatus = "BLOCKED"
)

type RedactionResult struct {
	Status  RedactionStatus `json:"status"`
	Reasons []string        `json:"reasons"`
}

type EvidenceKind string

const (
	EvidenceKindSourceExcerpt  EvidenceKind = "SOURCE_EXCERPT"
	EvidenceKindContentAddress EvidenceKind = "CONTENT_ADDRESS"
	EvidenceKindManifestEntry  EvidenceKind = "MANIFEST_ENTRY"
)

type ObservationEvidenceRef struct {
	Id      string       `json:"id"`
	Kind    EvidenceKind `json:"kind"`
	Digest  Sha256       `json:"digest"`
	Excerpt *string      `json:"excerpt,omitempty"`
}

type SourceObservationV2 struct {
	Id                string                    `json:"id"`
	ObservationType   string                    `json:"observationType"`
	ArchitectureLayer ArchitectureLayer         `json:"architectureLayer"`
	AspectHint        *string                   `json:"aspectHint"`
	Repository        RepositoryIdentity        `json:"repository"`
	Source            SourceLocation            `json:"source"`
	Parser            ParserDescriptor          `json:"parser"`
	Payload           map[string]any            `json:"payload"`
	Sensitivity       SensitivityClassification `json:"sensitivity"`
	Redaction         RedactionResult           `json:"redaction"`
	EvidenceRefs      []ObservationEvidenceRef  `json:"evidenceRefs"`
	NormalizedDigest  Sha256                    `json:"normalizedDigest"`
	Warnings          []string                  `json:"warnings"`
	CoverageGaps      []string                  `json:"coverageGaps"`
}

type ScanCoverageDelta struct {
	IndexedFiles     int      `json:"indexedFiles"`
	SkippedFiles     int      `json:"skippedFiles"`
	ObservationCount int      `json:"observationCount"`
	CoverageGaps     []string `json:"coverageGaps"`
}

type KnowledgeScanBatch struct {
	ContractVersion     string                `json:"contractVersion"`
	SessionId           string                `json:"sessionId"`
	Sequence            int                   `json:"sequence"`
	PreviousBatchDigest *Sha256               `json:"previousBatchDigest"`
	SessionNonceDigest  Sha256                `json:"sessionNonceDigest"`
	ArchitectureScope   ArchitectureScope     `json:"architectureScope"`
	Observations        []SourceObservationV2 `json:"observations"`
	CoverageDelta       ScanCoverageDelta     `json:"coverageDelta"`
	BatchDigest         Sha256                `json:"batchDigest"`
}

type ScanSessionStatus string

const (
	ScanSessionStatusOpen             ScanSessionStatus = "OPEN"
	ScanSessionStatusReceiving        ScanSessionStatus = "RECEIVING"
	ScanSessionStatusFinalizing       ScanSessionStatus = "FINALIZING"
	ScanSessionStatusReadyForAnalysis ScanSessionStatus = "READY_FOR_ANALYSIS"
	ScanSessionStatusBlocked          ScanSessionStatus = "BLOCKED"
	ScanSessionStatusPublished        ScanSessionStatus = "PUBLISHED"
	ScanSessionStatusExpired          ScanSessionStatus = "EXPIRED"
)

type ScanCheckpoint struct {
	ContractVersion        string            `json:"contractVersion"`
	SessionId              string            `json:"sessionId"`
	ArchitectureScope      ArchitectureScope `json:"architectureScope"`
	LatestAcceptedSequence int               `json:"latestAcceptedSequence"`
	CumulativeDigest       *Sha256           `json:"cumulativeDigest"`
	ObservationCount       int               `json:"observationCount"`
	Status                 ScanSessionStatus `json:"status"`
}

type ScanFinalization struct {
	ContractVersion          string            `json:"contractVersion"`
	SessionId                string            `json:"sessionId"`
	ArchitectureScope        ArchitectureScope `json:"architectureScope"`
	RepositorySnapshotDigest Sha256            `json:"repositorySnapshotDigest"`
	ManifestDigest           Sha256            `json:"manifestDigest"`
	FinalBatchDigest         Sha256            `json:"finalBatchDigest"`
	BatchCount               int               `json:"batchCount"`
	ObservationCount         int               `json:"observationCount"`
	Coverage                 ScanCoverageDelta `json:"coverage"`
	GeneratedAt              string            `json:"generatedAt"`
}

type Sha256 string
