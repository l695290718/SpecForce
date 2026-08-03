package scanner

import (
	"errors"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestResolveRepositoryIdentityUsesCleanCommit(t *testing.T) {
	git := func(args ...string) (string, error) {
		switch args[0] {
		case "status":
			return "", nil
		case "rev-parse":
			return "0123456789abcdef", nil
		default:
			return "", errors.New("unexpected git command")
		}
	}
	identity, _, err := ResolveRepositoryIdentity(t.TempDir(), "repo:test", false, 1024, git)
	if err != nil {
		t.Fatal(err)
	}
	if identity.SnapshotKind != scancontract.RepositorySnapshotKindCommit || identity.Commit == nil || *identity.Commit != "0123456789abcdef" {
		t.Fatalf("identity=%+v", identity)
	}
}

func TestResolveRepositoryIdentityRejectsOrHashesDirtyManifest(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "src/orders.go", []byte("package orders"))
	git := func(args ...string) (string, error) {
		if args[0] == "status" {
			return " M src/orders.go", nil
		}
		return "0123456789abcdef", nil
	}
	if _, _, err := ResolveRepositoryIdentity(root, "repo:test", false, 1024, git); !errors.Is(err, ErrDirtyWorktreeForbidden) {
		t.Fatalf("dirty policy err=%v", err)
	}
	identity, inventory, err := ResolveRepositoryIdentity(root, "repo:test", true, 1024, git)
	if err != nil {
		t.Fatal(err)
	}
	if identity.SnapshotKind != scancontract.RepositorySnapshotKindDirtyManifest || identity.Commit != nil || len(inventory.Files) != 1 {
		t.Fatalf("identity=%+v inventory=%+v", identity, inventory)
	}
	if err := VerifyDirtySnapshot(root, identity, 1024); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, root, "src/orders.go", []byte("package changed"))
	if err := VerifyDirtySnapshot(root, identity, 1024); !errors.Is(err, ErrSnapshotChanged) {
		t.Fatalf("snapshot change err=%v", err)
	}
}
