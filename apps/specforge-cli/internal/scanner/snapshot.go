package scanner

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

var (
	ErrDirtyWorktreeForbidden = errors.New("DIRTY_WORKTREE_FORBIDDEN")
	ErrSnapshotChanged        = errors.New("SNAPSHOT_CHANGED")
)

type GitCommand func(args ...string) (string, error)

func ResolveRepositoryIdentity(root, repositoryID string, allowDirty bool, maxSourceFileBytes int64, git GitCommand) (scancontract.RepositoryIdentity, InventoryResult, error) {
	status, err := git("status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return scancontract.RepositoryIdentity{}, InventoryResult{}, errors.New("GIT_STATUS_UNAVAILABLE")
	}
	if strings.TrimSpace(status) == "" {
		commit, commitErr := git("rev-parse", "HEAD")
		if commitErr != nil || strings.TrimSpace(commit) == "" {
			return scancontract.RepositoryIdentity{}, InventoryResult{}, errors.New("GIT_COMMIT_UNAVAILABLE")
		}
		commit = strings.TrimSpace(commit)
		digest := sha256Hex([]byte(commit))
		return scancontract.RepositoryIdentity{RepositoryId: repositoryID, SnapshotKind: scancontract.RepositorySnapshotKindCommit, SnapshotDigest: scancontract.Sha256(digest), Commit: &commit}, InventoryResult{}, nil
	}
	if !allowDirty {
		return scancontract.RepositoryIdentity{}, InventoryResult{}, ErrDirtyWorktreeForbidden
	}
	inventory, err := Inventory(root, maxSourceFileBytes)
	if err != nil {
		return scancontract.RepositoryIdentity{}, InventoryResult{}, err
	}
	digest, err := inventoryDigest(inventory)
	if err != nil {
		return scancontract.RepositoryIdentity{}, InventoryResult{}, err
	}
	return scancontract.RepositoryIdentity{RepositoryId: repositoryID, SnapshotKind: scancontract.RepositorySnapshotKindDirtyManifest, SnapshotDigest: scancontract.Sha256(digest)}, inventory, nil
}

func VerifyDirtySnapshot(root string, expected scancontract.RepositoryIdentity, maxSourceFileBytes int64) error {
	if expected.SnapshotKind != scancontract.RepositorySnapshotKindDirtyManifest {
		return nil
	}
	inventory, err := Inventory(root, maxSourceFileBytes)
	if err != nil {
		return err
	}
	digest, err := inventoryDigest(inventory)
	if err != nil {
		return err
	}
	if string(expected.SnapshotDigest) != digest {
		return ErrSnapshotChanged
	}
	return nil
}

func inventoryDigest(inventory InventoryResult) (string, error) {
	encoded, err := json.Marshal(inventory)
	if err != nil {
		return "", err
	}
	return sha256Hex(encoded), nil
}

func InventoryDigest(inventory InventoryResult) (scancontract.Sha256, error) {
	digest, err := inventoryDigest(inventory)
	return scancontract.Sha256(digest), err
}

func sha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}
