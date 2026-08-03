package extractors

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

func TestRegistryIsStaticAndDeterministic(t *testing.T) {
	want := []string{
		"repository-build-metadata", "openapi-asyncapi-contracts", "prisma-sql-schema", "go-ast",
		"java-spring-conservative", "typescript-node-conservative", "test-evidence",
		"configuration-structured", "deployment-metadata", "documentation-sections",
	}
	first := DefaultRegistry().IDs()
	second := DefaultRegistry().IDs()
	if !slices.Equal(first, second) || !slices.Equal(first, want) {
		t.Fatalf("registry order changed: got=%v want=%v", first, want)
	}
	if slices.Contains(first, "repository-plugin") {
		t.Fatal("dynamic plugin loaded")
	}
}

func TestExtractAllIsInventoryBoundAndOrderIndependent(t *testing.T) {
	root := fixtureRoot(t, "go-service")
	inventory, err := scanner.Inventory(root, DefaultMaxSourceFileBytes)
	if err != nil {
		t.Fatal(err)
	}
	reversed := append([]scanner.FileMeta(nil), inventory.Files...)
	slices.Reverse(reversed)
	registry := DefaultRegistry()
	first, firstCoverage, err := registry.ExtractAll(context.Background(), root, testRepository(), reversed, 4096)
	if err != nil {
		t.Fatal(err)
	}
	second, secondCoverage, err := registry.ExtractAll(context.Background(), root, testRepository(), inventory.Files, 4096)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) || !reflect.DeepEqual(firstCoverage, secondCoverage) {
		t.Fatal("inventory ordering changed deterministic extraction")
	}
	if len(first) == 0 || firstCoverage.ObservationCount != len(first) {
		t.Fatalf("unexpected observations=%d coverage=%+v", len(first), firstCoverage)
	}
}

func TestExtractAllRejectsFilesChangedAfterInventory(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "README.md")
	if err := os.WriteFile(path, []byte("# Before\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	inventory, err := scanner.Inventory(root, DefaultMaxSourceFileBytes)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("# After changed\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	observations, coverage, err := DefaultRegistry().ExtractAll(context.Background(), root, testRepository(), inventory.Files, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if len(observations) != 0 || !slices.Contains(coverage.CoverageGaps, "README.md:SOURCE_FILE_CHANGED") {
		t.Fatalf("changed file was not rejected: observations=%v coverage=%+v", observations, coverage)
	}
}

func TestExtractAllZeroExcerptOmitsEvidenceText(t *testing.T) {
	root := fixtureRoot(t, "go-service")
	inventory, err := scanner.Inventory(root, DefaultMaxSourceFileBytes)
	if err != nil {
		t.Fatal(err)
	}
	observations, _, err := DefaultRegistry().ExtractAll(context.Background(), root, testRepository(), inventory.Files, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(observations) == 0 {
		t.Fatal("expected observations")
	}
	for _, observation := range observations {
		for _, evidence := range observation.EvidenceRefs {
			if evidence.Excerpt != nil {
				t.Fatalf("zero excerpt policy leaked evidence text for %s", observation.Id)
			}
			if evidence.Kind != scancontract.EvidenceKindContentAddress {
				t.Fatalf("zero excerpt policy must use content-address evidence: %+v", evidence)
			}
		}
		if observation.Redaction.Status != scancontract.RedactionStatusBlocked || !slices.Contains(observation.Redaction.Reasons, "EXCERPT_DISABLED_BY_POLICY") {
			t.Fatalf("zero excerpt policy was not recorded: %+v", observation.Redaction)
		}
	}
}

func TestWorkspaceSafetyAndFailClosedCoverage(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, ".env"), "TOKEN=raw-secret")
	mustWrite(t, filepath.Join(root, "README.md"), "# Safe\n")
	mustWriteBytes(t, filepath.Join(root, "binary.dat"), []byte{'a', 0, 'b'})
	mustWrite(t, filepath.Join(root, "large.md"), strings.Repeat("x", 128))
	outside := filepath.Join(t.TempDir(), "outside.md")
	mustWrite(t, outside, "# Outside\n")
	if err := os.Symlink(outside, filepath.Join(root, "escape.md")); err != nil {
		t.Logf("symlink creation unavailable; escape behavior remains covered by path-bound ExtractAll tests: %v", err)
	}
	_, coverage, err := DefaultRegistry().ScanWorkspace(context.Background(), root, testRepository(), 64)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		".env:CREDENTIAL_FILE_BLOCKED", "binary.dat:BINARY_SOURCE_SKIPPED", "large.md:SOURCE_FILE_TOO_LARGE",
	} {
		if !slices.Contains(coverage.CoverageGaps, want) {
			t.Errorf("missing fail-closed gap %q in %v", want, coverage.CoverageGaps)
		}
	}
	if _, err := os.Lstat(filepath.Join(root, "escape.md")); err == nil && !slices.Contains(coverage.CoverageGaps, "escape.md:SYMLINK_ESCAPES_ROOT") {
		t.Errorf("missing symlink escape gap in %v", coverage.CoverageGaps)
	}
}

func testRepository() scancontract.RepositoryIdentity {
	commit := "0123456789abcdef0123456789abcdef01234567"
	return scancontract.RepositoryIdentity{
		RepositoryId: "repository:golden", SnapshotKind: scancontract.RepositorySnapshotKindCommit,
		SnapshotDigest: scancontract.Sha256("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), Commit: &commit,
	}
}

func fixtureRoot(t *testing.T, name string) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "fixtures", "legacy-scan", name))
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func mustWrite(t *testing.T, path, value string) { t.Helper(); mustWriteBytes(t, path, []byte(value)) }
func mustWriteBytes(t *testing.T, path string, value []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, value, 0o600); err != nil {
		t.Fatal(err)
	}
}
