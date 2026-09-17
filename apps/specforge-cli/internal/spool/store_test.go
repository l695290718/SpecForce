package spool

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestStoreAppendsAndResumesExactCheckpoint(t *testing.T) {
	base := t.TempDir()
	store, err := Open(base, "scan-session:test")
	if err != nil {
		t.Fatal(err)
	}

	first := Batch{Sequence: 0, BatchDigest: digestOf("first"), Payload: json.RawMessage(`{"sequence":0}`)}
	if err := store.Append(first); err != nil {
		t.Fatal(err)
	}
	second := Batch{Sequence: 1, PreviousBatchDigest: first.BatchDigest, BatchDigest: digestOf("second"), Payload: json.RawMessage(`{"sequence":1}`)}
	if err := store.Append(second); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(base, "scan-session:test")
	if err != nil {
		t.Fatal(err)
	}
	checkpoint, err := reopened.Checkpoint()
	if err != nil {
		t.Fatal(err)
	}
	if checkpoint.AcceptedSequence != 1 || checkpoint.AcceptedBatchDigest != second.BatchDigest {
		t.Fatalf("checkpoint=%+v", checkpoint)
	}
	if _, err := os.Stat(filepath.Join(store.Root(), "00000001-"+second.BatchDigest+".json")); err != nil {
		t.Fatal(err)
	}
}

func TestStoreRejectsSequenceAndDigestChainConflicts(t *testing.T) {
	store, err := Open(t.TempDir(), "scan-session:test")
	if err != nil {
		t.Fatal(err)
	}
	first := Batch{Sequence: 0, BatchDigest: digestOf("first"), Payload: json.RawMessage(`{}`)}
	if err := store.Append(first); err != nil {
		t.Fatal(err)
	}

	if err := store.Append(Batch{Sequence: 2, PreviousBatchDigest: first.BatchDigest, BatchDigest: digestOf("gap"), Payload: json.RawMessage(`{}`)}); !errors.Is(err, ErrSequenceGap) {
		t.Fatalf("expected ErrSequenceGap, got %v", err)
	}
	if err := store.Append(Batch{Sequence: 1, PreviousBatchDigest: digestOf("wrong"), BatchDigest: digestOf("second"), Payload: json.RawMessage(`{}`)}); !errors.Is(err, ErrDigestChainMismatch) {
		t.Fatalf("expected ErrDigestChainMismatch, got %v", err)
	}
	if err := store.Append(Batch{Sequence: 0, BatchDigest: digestOf("conflict"), Payload: json.RawMessage(`{}`)}); !errors.Is(err, ErrSequenceConflict) {
		t.Fatalf("expected ErrSequenceConflict, got %v", err)
	}
	if err := store.Append(first); err != nil {
		t.Fatalf("identical retry must be idempotent: %v", err)
	}
}

func TestOpenRejectsUnsafeSessionID(t *testing.T) {
	for _, id := range []string{"", "../escape", `scan\\escape`, "scan/escape"} {
		if _, err := Open(t.TempDir(), id); !errors.Is(err, ErrInvalidSessionID) {
			t.Fatalf("id=%q err=%v", id, err)
		}
	}
}

func TestStorePinsAndRejectsResumeContextChanges(t *testing.T) {
	store, err := Open(t.TempDir(), "scan-session:test")
	if err != nil {
		t.Fatal(err)
	}
	context := ScanContext{SessionID: "scan-session:test", SnapshotDigest: digestOf("snapshot"), EffectivePolicyDigest: digestOf("policy"), CatalogDigest: digestOf("catalog"), TechnologyDigest: digestOf("technology")}
	if err := store.WriteContext(context); err != nil {
		t.Fatal(err)
	}
	if err := store.WriteContext(context); err != nil {
		t.Fatalf("identical context must be idempotent: %v", err)
	}
	changed := context
	changed.SnapshotDigest = digestOf("different-snapshot")
	if err := store.WriteContext(changed); !errors.Is(err, ErrContextMismatch) {
		t.Fatalf("expected context mismatch, got %v", err)
	}
}

func TestAppendKnowledgeBatchPersistsCanonicalEnvelope(t *testing.T) {
	store, err := Open(t.TempDir(), "scan-session:test")
	if err != nil {
		t.Fatal(err)
	}
	batch := scancontract.KnowledgeScanBatch{Sequence: 0, BatchDigest: scancontract.Sha256(digestOf("typed"))}
	if err := store.AppendKnowledgeBatch(batch); err != nil {
		t.Fatal(err)
	}
	checkpoint, err := store.Checkpoint()
	if err != nil || checkpoint.AcceptedSequence != 0 || checkpoint.AcceptedBatchDigest != string(batch.BatchDigest) {
		t.Fatalf("checkpoint=%+v err=%v", checkpoint, err)
	}
}
