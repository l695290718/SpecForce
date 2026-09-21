package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/batch"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

func TestParseLocalScanOptionsRequiresSignedInputs(t *testing.T) {
	root := t.TempDir()
	options, err := parseLocalScanOptions(root, []string{"--repository-id", "repo:test", "--release", "release.json", "--session", "session.json", "--trust", "trust.json", "--artifact", "specforge.exe"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if options.spoolBase != filepath.Join(root, ".specforge", "scan-spool") || options.artifact != "specforge.exe" || options.repositoryID != "repo:test" {
		t.Fatalf("options=%+v", options)
	}
	if _, err := parseLocalScanOptions(root, []string{"--session", "session.json"}, true); err == nil {
		t.Fatal("expected missing release/trust to fail")
	}
}

func TestParseLocalScanOptionsRejectsDuplicatesAndUnknowns(t *testing.T) {
	root := t.TempDir()
	if _, err := parseLocalScanOptions(root, []string{"--session", "a", "--session", "b"}, false); err == nil {
		t.Fatalf("duplicate err=%v", err)
	}
	if _, err := parseLocalScanOptions(root, []string{"--session", "a", "--network", "on"}, false); err == nil {
		t.Fatal("expected unsupported network option to fail")
	}
}

func TestMergeInventoryCoveragePreservesSkippedFiles(t *testing.T) {
	coverage := scancontract.ScanCoverageDelta{IndexedFiles: 2, ObservationCount: 3, CoverageGaps: []string{"README.md:UNSUPPORTED_SOURCE_TYPE"}}
	inventory := scanner.InventoryResult{Gaps: []scanner.CoverageGap{{Path: "large.md", Reason: "SOURCE_FILE_TOO_LARGE"}}}
	got := mergeInventoryCoverage(coverage, inventory)
	if got.SkippedFiles != 1 || len(got.CoverageGaps) != 2 || got.CoverageGaps[0] != "README.md:UNSUPPORTED_SOURCE_TYPE" {
		t.Fatalf("coverage=%+v", got)
	}
}

func TestBuildScanBatchesHonorsCountAndByteBudgets(t *testing.T) {
	descriptor := testScanDescriptor()
	descriptor.Limits.MaxObservationsPerBatch = 2
	observations := []scancontract.SourceObservationV2{
		testObservation("one", strings.Repeat("a", 200)),
		testObservation("two", strings.Repeat("b", 200)),
		testObservation("three", strings.Repeat("c", 200)),
	}
	one, err := batch.Build(descriptor, 0, nil, observations[:1], scancontract.ScanCoverageDelta{ObservationCount: 1, CoverageGaps: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	two, err := batch.Build(descriptor, 0, nil, observations[:2], scancontract.ScanCoverageDelta{ObservationCount: 2, CoverageGaps: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	oneBytes, _ := batch.Marshal(one)
	twoBytes, _ := batch.Marshal(two)
	descriptor.Limits.MaxBatchBytes = (len(oneBytes) + len(twoBytes)) / 2
	batches, err := buildScanBatches(descriptor, observations, scancontract.ScanCoverageDelta{ObservationCount: len(observations), CoverageGaps: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	if len(batches) != 3 {
		t.Fatalf("batch count=%d", len(batches))
	}
	for _, built := range batches {
		encoded, marshalErr := batch.Marshal(built)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		if len(encoded) > descriptor.Limits.MaxBatchBytes {
			t.Fatalf("batch bytes=%d limit=%d", len(encoded), descriptor.Limits.MaxBatchBytes)
		}
	}
}

func TestBuildScanBatchesRejectsSessionOverflow(t *testing.T) {
	descriptor := testScanDescriptor()
	descriptor.Limits.MaxObservationsPerSession = 1
	_, err := buildScanBatches(descriptor, []scancontract.SourceObservationV2{testObservation("one", "a"), testObservation("two", "b")}, scancontract.ScanCoverageDelta{ObservationCount: 2})
	if err == nil || err.Error() != "SCAN_SESSION_OBSERVATION_LIMIT_EXCEEDED" {
		t.Fatalf("err=%v", err)
	}
}

func testScanDescriptor() scancontract.ScanSessionDescriptor {
	return scancontract.ScanSessionDescriptor{
		ContractVersion: "2.0.0", SessionId: "scan-session-test", SessionNonce: "nonce",
		ArchitectureScope: scancontract.ArchitectureScope{ApplicationServiceId: "com.huawei.celon.desiner", ScopePath: "designer"},
		Limits:            scancontract.ScanLimits{MaxObservationsPerBatch: 500, MaxBatchBytes: scancontract.MaxBatchBytes, MaxExcerptBytes: scancontract.MaxExcerptBytes, MaxSourceFileBytes: scancontract.MaxSourceFileBytes, MaxObservationsPerSession: scancontract.MaxObservationsPerSession},
	}
}

func testObservation(id, text string) scancontract.SourceObservationV2 {
	return scancontract.SourceObservationV2{Id: id, ObservationType: "DOCUMENTATION", Payload: map[string]any{"text": text}}
}
