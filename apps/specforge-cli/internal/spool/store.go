package spool

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

var (
	ErrInvalidSessionID    = errors.New("SPOOL_SESSION_ID_INVALID")
	ErrSequenceGap         = errors.New("SPOOL_SEQUENCE_GAP")
	ErrSequenceConflict    = errors.New("SPOOL_SEQUENCE_CONFLICT")
	ErrDigestChainMismatch = errors.New("SPOOL_DIGEST_CHAIN_MISMATCH")
	ErrContextMismatch     = errors.New("SCAN_RESUME_CONTEXT_MISMATCH")
)

var safeSessionID = regexp.MustCompile(`^[A-Za-z0-9._:-]+$`)

type Batch struct {
	Sequence            int
	PreviousBatchDigest string
	BatchDigest         string
	Payload             json.RawMessage
}

type Checkpoint struct {
	AcceptedSequence    int    `json:"acceptedSequence"`
	AcceptedBatchDigest string `json:"acceptedBatchDigest"`
}

type ScanContext struct {
	SessionID             string `json:"sessionId"`
	SnapshotDigest        string `json:"snapshotDigest"`
	EffectivePolicyDigest string `json:"effectivePolicyDigest"`
	CatalogDigest         string `json:"catalogDigest"`
	TechnologyDigest      string `json:"technologyDigest"`
}

type Store struct {
	root string
}

func Open(base, sessionID string) (*Store, error) {
	if !safeSessionID.MatchString(sessionID) {
		return nil, ErrInvalidSessionID
	}
	root := filepath.Join(base, sessionDirectoryName(sessionID))
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("SPOOL_CREATE_FAILED: %w", err)
	}
	return &Store{root: root}, nil
}

func sessionDirectoryName(sessionID string) string {
	prefix := strings.NewReplacer(":", "_", ".", "_", "-", "_").Replace(sessionID)
	if len(prefix) > 48 {
		prefix = prefix[:48]
	}
	sum := sha256.Sum256([]byte(sessionID))
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(sum[:6]))
}

func (store *Store) Root() string {
	return store.root
}

func (store *Store) Checkpoint() (Checkpoint, error) {
	contents, err := os.ReadFile(filepath.Join(store.root, "checkpoint.json"))
	if errors.Is(err, os.ErrNotExist) {
		return Checkpoint{AcceptedSequence: -1}, nil
	}
	if err != nil {
		return Checkpoint{}, fmt.Errorf("SPOOL_CHECKPOINT_READ_FAILED: %w", err)
	}
	var checkpoint Checkpoint
	if err := json.Unmarshal(contents, &checkpoint); err != nil {
		return Checkpoint{}, fmt.Errorf("SPOOL_CHECKPOINT_INVALID: %w", err)
	}
	return checkpoint, nil
}

func (store *Store) WriteContext(context ScanContext) error {
	if context.SessionID == "" || !isDigest(context.SnapshotDigest) || !isDigest(context.EffectivePolicyDigest) || !isDigest(context.CatalogDigest) || !isDigest(context.TechnologyDigest) {
		return errors.New("SPOOL_CONTEXT_INVALID")
	}
	path := filepath.Join(store.root, "context.json")
	contents, err := os.ReadFile(path)
	if err == nil {
		var existing ScanContext
		if json.Unmarshal(contents, &existing) != nil || existing != context {
			return ErrContextMismatch
		}
		return nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("SPOOL_CONTEXT_READ_FAILED: %w", err)
	}
	encoded, err := json.Marshal(context)
	if err != nil {
		return err
	}
	return atomicWrite(path, append(encoded, '\n'), 0o600)
}

func (store *Store) Append(batch Batch) error {
	if batch.Sequence < 0 || !isDigest(batch.BatchDigest) || !json.Valid(batch.Payload) {
		return errors.New("SPOOL_BATCH_INVALID")
	}
	checkpoint, err := store.Checkpoint()
	if err != nil {
		return err
	}
	if batch.Sequence <= checkpoint.AcceptedSequence {
		if batch.Sequence == checkpoint.AcceptedSequence && batch.BatchDigest == checkpoint.AcceptedBatchDigest {
			return nil
		}
		return ErrSequenceConflict
	}
	if batch.Sequence != checkpoint.AcceptedSequence+1 {
		return ErrSequenceGap
	}
	if checkpoint.AcceptedSequence >= 0 && batch.PreviousBatchDigest != checkpoint.AcceptedBatchDigest {
		return ErrDigestChainMismatch
	}
	if checkpoint.AcceptedSequence < 0 && batch.PreviousBatchDigest != "" {
		return ErrDigestChainMismatch
	}

	batchPath := filepath.Join(store.root, fmt.Sprintf("%08d-%s.json", batch.Sequence, batch.BatchDigest))
	if err := atomicWrite(batchPath, batch.Payload, 0o600); err != nil {
		return err
	}
	checkpoint = Checkpoint{AcceptedSequence: batch.Sequence, AcceptedBatchDigest: batch.BatchDigest}
	contents, err := json.Marshal(checkpoint)
	if err != nil {
		return err
	}
	if err := atomicWrite(filepath.Join(store.root, "checkpoint.json"), append(contents, '\n'), 0o600); err != nil {
		return err
	}
	return nil
}

func (store *Store) AppendKnowledgeBatch(batch scancontract.KnowledgeScanBatch) error {
	payload, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("SPOOL_BATCH_INVALID: %w", err)
	}
	previous := ""
	if batch.PreviousBatchDigest != nil {
		previous = string(*batch.PreviousBatchDigest)
	}
	return store.Append(Batch{Sequence: batch.Sequence, PreviousBatchDigest: previous, BatchDigest: string(batch.BatchDigest), Payload: payload})
}

func (store *Store) WriteFinalization(finalization scancontract.ScanFinalization) error {
	contents, err := json.Marshal(finalization)
	if err != nil {
		return fmt.Errorf("SPOOL_FINALIZATION_INVALID: %w", err)
	}
	return atomicWrite(filepath.Join(store.root, "finalization.json"), append(contents, '\n'), 0o600)
}

func atomicWrite(path string, contents []byte, mode os.FileMode) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".specforge-spool-*")
	if err != nil {
		return fmt.Errorf("SPOOL_TEMP_CREATE_FAILED: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(mode); err != nil {
		temporary.Close()
		return fmt.Errorf("SPOOL_PERMISSION_FAILED: %w", err)
	}
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return fmt.Errorf("SPOOL_WRITE_FAILED: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("SPOOL_SYNC_FAILED: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("SPOOL_CLOSE_FAILED: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("SPOOL_RENAME_FAILED: %w", err)
	}
	return nil
}

func isDigest(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func digestOf(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
