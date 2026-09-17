package scancontract

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	MaxObservationsPerBatch   = 500
	MaxBatchBytes             = 4_194_304
	MaxExcerptBytes           = 8_192
	MaxSourceFileBytes        = 10_485_760
	MaxObservationsPerSession = 100_000
)

func (session ScanSessionDescriptor) Validate() error {
	if session.ContractVersion != "2.0" {
		return errors.New("SCAN_CONTRACT_VERSION_UNSUPPORTED")
	}
	if session.SessionId == "" || session.ActorId == "" || session.ConnectorId == "" || session.ScannerReleaseId == "" || len(session.SessionNonce) < 16 {
		return errors.New("SCAN_SESSION_INVALID")
	}
	if err := session.ArchitectureScope.Validate(); err != nil {
		return err
	}
	limits := session.Limits
	if limits.MaxObservationsPerBatch < 1 || limits.MaxObservationsPerBatch > MaxObservationsPerBatch ||
		limits.MaxBatchBytes < 1 || limits.MaxBatchBytes > MaxBatchBytes ||
		limits.MaxExcerptBytes < 0 || limits.MaxExcerptBytes > MaxExcerptBytes ||
		limits.MaxSourceFileBytes < 1 || limits.MaxSourceFileBytes > MaxSourceFileBytes ||
		limits.MaxObservationsPerSession < 1 || limits.MaxObservationsPerSession > MaxObservationsPerSession {
		return errors.New("SCAN_LIMITS_EXCEEDED")
	}
	if err := validatePolicyReceipt(session.PolicyReceipt); err != nil {
		return err
	}
	if err := validateTechnologyProfile(session.TechnologyProfile); err != nil {
		return err
	}
	if err := validateCoveragePlan(session.CoveragePlan); err != nil {
		return err
	}
	return nil
}

func (finalization ScanFinalization) Validate(expectedScope ArchitectureScope) error {
	if finalization.ContractVersion != "2.0" || finalization.SessionId == "" || finalization.BatchCount < 0 || finalization.ObservationCount < 0 {
		return errors.New("SCAN_FINALIZATION_INVALID")
	}
	if finalization.ArchitectureScope != expectedScope {
		return errors.New("SCOPE_MISMATCH")
	}
	if !isSHA256(string(finalization.RepositorySnapshotDigest)) || !isSHA256(string(finalization.ManifestDigest)) || !isSHA256(string(finalization.FinalBatchDigest)) {
		return errors.New("SCAN_FINALIZATION_DIGEST_INVALID")
	}
	if err := validateCoverage(finalization.Coverage); err != nil {
		return err
	}
	if err := validateCoveragePlan(finalization.CoveragePlan); err != nil {
		return err
	}
	if err := validatePolicyReceipt(finalization.PolicyReceipt); err != nil {
		return err
	}
	if _, err := time.Parse(time.RFC3339Nano, finalization.GeneratedAt); err != nil {
		return errors.New("SCAN_FINALIZATION_INVALID")
	}
	return nil
}

func (batch KnowledgeScanBatch) Validate(expectedScope ArchitectureScope) error {
	if batch.ContractVersion != "2.0" {
		return errors.New("SCAN_CONTRACT_VERSION_UNSUPPORTED")
	}
	if batch.SessionId == "" || batch.Sequence < 0 || !isSHA256(string(batch.SessionNonceDigest)) || !isSHA256(string(batch.BatchDigest)) {
		return errors.New("SCAN_BATCH_INVALID")
	}
	if err := batch.ArchitectureScope.Validate(); err != nil {
		return err
	}
	if batch.ArchitectureScope != expectedScope {
		return errors.New("SCOPE_MISMATCH")
	}
	if len(batch.Observations) > MaxObservationsPerBatch {
		return errors.New("SCAN_BATCH_OBSERVATION_LIMIT_EXCEEDED")
	}
	if err := validateCoverage(batch.CoverageDelta); err != nil {
		return err
	}
	if batch.CoverageDelta.ObservationCount != len(batch.Observations) {
		return errors.New("SCAN_BATCH_COVERAGE_MISMATCH")
	}
	for _, observation := range batch.Observations {
		if err := observation.validate(); err != nil {
			return err
		}
	}
	encoded, err := json.Marshal(batch)
	if err != nil {
		return errors.New("SCAN_BATCH_INVALID")
	}
	if len(encoded) > MaxBatchBytes {
		return errors.New("SCAN_BATCH_BYTE_LIMIT_EXCEEDED")
	}
	return nil
}

func validateCoverage(coverage ScanCoverageDelta) error {
	if coverage.IndexedFiles < 0 || coverage.SkippedFiles < 0 || coverage.ObservationCount < 0 {
		return errors.New("SCAN_COVERAGE_INVALID")
	}
	return nil
}

func validatePolicyReceipt(receipt ScanPolicyReceipt) error {
	for _, digest := range []Sha256{receipt.SystemGovernanceDigest, receipt.ExtractorCatalogDigest, receipt.SemanticPromptPackDigest, receipt.ScopeRuntimeProfileDigest, receipt.EffectivePolicyDigest} {
		if !isSHA256(string(digest)) {
			return errors.New("SCAN_POLICY_RECEIPT_INVALID")
		}
	}
	return nil
}

func validateTechnologyProfile(profile TechnologyProfile) error {
	if !isSHA256(string(profile.Digest)) {
		return errors.New("SCAN_TECHNOLOGY_PROFILE_INVALID")
	}
	for _, detection := range profile.Detections {
		if detection.Ecosystem == "" || detection.Framework == "" || detection.VersionRange == "" || detection.Confidence < 0 || detection.Confidence > 1 {
			return errors.New("SCAN_TECHNOLOGY_DETECTION_INVALID")
		}
	}
	return nil
}

func validateCoveragePlan(plan AssetCoveragePlan) error {
	if !isSHA256(string(plan.Digest)) {
		return errors.New("SCAN_COVERAGE_PLAN_INVALID")
	}
	for _, capability := range plan.Capabilities {
		if capability.AssetFamily == "" || capability.Framework == "" || !validCoverageState(capability.State) {
			return errors.New("SCAN_CAPABILITY_INVALID")
		}
	}
	return nil
}

func validCoverageState(state CapabilityCoverageState) bool {
	switch state {
	case CapabilityCoverageStateFull, CapabilityCoverageStatePartial, CapabilityCoverageStateDiscoveryOnly, CapabilityCoverageStateSemanticReviewRequired, CapabilityCoverageStateUnsupported, CapabilityCoverageStateNotApplicable:
		return true
	default:
		return false
	}
}

func (scope ArchitectureScope) Validate() error {
	if scope.ApplicationServiceId == "" || scope.ScopePath == "" {
		return errors.New("SCOPE_REQUIRED")
	}
	return nil
}

func (observation SourceObservationV2) validate() error {
	if observation.Id == "" || observation.ObservationType == "" || !isSHA256(string(observation.NormalizedDigest)) || len(observation.EvidenceRefs) == 0 {
		return errors.New("SCAN_OBSERVATION_INVALID")
	}
	for _, evidence := range observation.EvidenceRefs {
		if evidence.Excerpt != nil && len([]byte(*evidence.Excerpt)) > MaxExcerptBytes {
			return errors.New("SCAN_EXCERPT_BYTE_LIMIT_EXCEEDED")
		}
	}
	return nil
}

func isSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, character := range value {
		if !strings.ContainsRune("0123456789abcdef", character) {
			return false
		}
	}
	return true
}
