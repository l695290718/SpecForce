package connector

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestLocalRepositorySourceResumesBySnapshotCursor(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "api"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "api", "openapi.yaml"), []byte("openapi: 3.0.0\ninfo:\n  title: Orders\n  version: 1.0.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200':\n          description: OK\n  /returns:\n    get:\n      responses:\n        '200':\n          description: OK\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	source := LocalRepositorySource{
		Root: root, RepositoryID: "repo-1", ArchitectureScope: testScope(), AllowDirtyWorktree: true,
		MaxSourceFileBytes: 1024 * 1024, MaxExcerptBytes: 1024,
		Git: func(args ...string) (string, error) {
			if len(args) > 0 && args[0] == "status" {
				return " M api/openapi.yaml", nil
			}
			return "", errors.New("unused git command")
		},
	}
	first, err := source.Poll(context.Background(), nil, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Observations) != 1 || first.SourceCursor == nil {
		t.Fatalf("first=%+v", first)
	}
	second, err := source.Poll(context.Background(), first.SourceCursor, 1)
	if err != nil {
		t.Fatal(err)
	}
	if second.SourceCursor == nil || *second.SourceCursor == *first.SourceCursor || second.SourceVersion != first.SourceVersion {
		t.Fatalf("second=%+v first=%+v", second, first)
	}
}

func TestBuildBatchIsIdempotentForIdenticalPage(t *testing.T) {
	page := ObservationPage{SourceCursor: Cursor("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 2), SourceVersion: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", ObservedAt: StableObservedAt("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), Observations: []Observation{{ID: "one", ExternalAssetType: "data-model", ExternalID: "schema:one", Payload: map[string]any{"name": "Order"}, SourceVersion: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}, Coverage: map[string]any{"complete": true}}
	one, err := BuildBatch(testScope(), "local-repository", "local-repository-v1", Checkpoint{AcceptedSequence: -1}, page)
	if err != nil {
		t.Fatal(err)
	}
	two, err := BuildBatch(testScope(), "local-repository", "local-repository-v1", Checkpoint{AcceptedSequence: -1}, page)
	if err != nil {
		t.Fatal(err)
	}
	if one.BatchDigest != two.BatchDigest || one.PayloadDigest != two.PayloadDigest {
		t.Fatalf("one=%+v two=%+v", one, two)
	}
}

func TestBatchRejectsCrossScopeAndDigestTampering(t *testing.T) {
	page := ObservationPage{SourceCursor: Cursor("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", 1), SourceVersion: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", ObservedAt: StableObservedAt("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"), Observations: []Observation{{ID: "one", ExternalAssetType: "api", ExternalID: "api:one", Payload: map[string]any{"method": "GET"}, SourceVersion: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}}, Coverage: map[string]any{"complete": true}}
	batch, err := BuildBatch(testScope(), "local-repository", "local-repository-v1", Checkpoint{AcceptedSequence: -1}, page)
	if err != nil {
		t.Fatal(err)
	}
	if err := batch.Validate(scancontract.ArchitectureScope{ApplicationServiceId: "com.huawei.celon.policyhub", ScopePath: "policy"}); err == nil || err.Error() != "SCOPE_MISMATCH" {
		t.Fatalf("err=%v", err)
	}
	batch.BatchDigest = "tampered"
	if err := batch.Validate(testScope()); err == nil || err.Error() != "OBSERVATION_BATCH_DIGEST_MISMATCH" {
		t.Fatalf("err=%v", err)
	}
}

func testScope() scancontract.ArchitectureScope {
	return scancontract.ArchitectureScope{ApplicationServiceId: "com.huawei.celon.desiner", ScopePath: "designer"}
}
