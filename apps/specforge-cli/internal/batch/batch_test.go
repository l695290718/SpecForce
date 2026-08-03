package batch

import (
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestBuildCreatesServerCompatibleDigestChain(t *testing.T) {
	session := scancontract.ScanSessionDescriptor{
		ContractVersion: "2.0",
		SessionId:       "scan-session:test",
		SessionNonce:    "0123456789abcdef",
		ArchitectureScope: scancontract.ArchitectureScope{
			ApplicationServiceId: "com.huawei.celon.desiner",
			ScopePath:            "pf/product/service",
		},
	}
	observation := scancontract.SourceObservationV2{
		Id: "observation:test", ObservationType: "repository-manifest", ArchitectureLayer: scancontract.ArchitectureLayerUnknown,
		Repository: scancontract.RepositoryIdentity{RepositoryId: "repo:test", SnapshotKind: scancontract.RepositorySnapshotKindCommit, SnapshotDigest: scancontract.Sha256(hex64("1"))},
		Source:     scancontract.SourceLocation{Path: "go.mod"}, Parser: scancontract.ParserDescriptor{Id: "repository-manifest", Version: "1.0.0"}, Payload: map[string]any{"module": "example"},
		Sensitivity: scancontract.SensitivityClassificationInternal, Redaction: scancontract.RedactionResult{Status: scancontract.RedactionStatusNone, Reasons: []string{}},
		EvidenceRefs:     []scancontract.ObservationEvidenceRef{{Id: "evidence:test", Kind: scancontract.EvidenceKindContentAddress, Digest: scancontract.Sha256(hex64("2"))}},
		NormalizedDigest: scancontract.Sha256(hex64("3")), Warnings: []string{}, CoverageGaps: []string{},
	}
	first, err := Build(session, 0, nil, []scancontract.SourceObservationV2{observation}, scancontract.ScanCoverageDelta{IndexedFiles: 1, ObservationCount: 1, CoverageGaps: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := first.Validate(session.ArchitectureScope); err != nil {
		t.Fatal(err)
	}
	if first.PreviousBatchDigest != nil || len(first.BatchDigest) != 64 || len(first.SessionNonceDigest) != 64 {
		t.Fatalf("first=%+v", first)
	}
	second, err := Build(session, 1, &first.BatchDigest, []scancontract.SourceObservationV2{observation}, scancontract.ScanCoverageDelta{IndexedFiles: 1, ObservationCount: 1, CoverageGaps: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	if second.PreviousBatchDigest == nil || *second.PreviousBatchDigest != first.BatchDigest || second.BatchDigest == first.BatchDigest {
		t.Fatalf("second=%+v", second)
	}
}

func hex64(character string) string {
	result := ""
	for len(result) < 64 {
		result += character
	}
	return result[:64]
}
