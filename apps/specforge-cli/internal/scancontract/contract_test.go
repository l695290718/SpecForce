package scancontract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSharedSessionAndBatchFixtures(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "packages", "scan-contract", "fixtures")
	var session ScanSessionDescriptor
	readFixture(t, filepath.Join(root, "valid-session.json"), &session)
	if err := session.Validate(); err != nil {
		t.Fatal(err)
	}

	var batch KnowledgeScanBatch
	readFixture(t, filepath.Join(root, "valid-batch.json"), &batch)
	if err := batch.Validate(session.ArchitectureScope); err != nil {
		t.Fatal(err)
	}
	if batch.ContractVersion != "2.0" || batch.Sequence != 0 {
		t.Fatalf("batch=%+v", batch)
	}
	if len(batch.Observations) > MaxObservationsPerBatch {
		t.Fatal("fixture exceeds production limit")
	}
}

func TestCrossScopeBatchFixtureIsRejected(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..", "packages", "scan-contract", "fixtures")
	var fixture struct {
		ExpectedArchitectureScope ArchitectureScope `json:"expectedArchitectureScope"`
		Batch                     KnowledgeScanBatch `json:"batch"`
	}
	readFixture(t, filepath.Join(root, "invalid-cross-scope-batch.json"), &fixture)
	if err := fixture.Batch.Validate(fixture.ExpectedArchitectureScope); err == nil || err.Error() != "SCOPE_MISMATCH" {
		t.Fatalf("expected SCOPE_MISMATCH, got %v", err)
	}
}

func TestProductionLimitsMatchContract(t *testing.T) {
	if MaxObservationsPerBatch != 500 || MaxBatchBytes != 4_194_304 || MaxExcerptBytes != 8_192 || MaxSourceFileBytes != 10_485_760 || MaxObservationsPerSession != 100_000 {
		t.Fatal("production limits drifted")
	}
}

func readFixture(t *testing.T, path string, target any) {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(contents, target); err != nil {
		t.Fatal(err)
	}
}
