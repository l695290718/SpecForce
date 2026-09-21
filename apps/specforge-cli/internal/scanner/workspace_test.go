package scanner

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestInventorySkipsPrivateRuntimePathsAndLargeFiles(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "src/orders.go", []byte("package orders"))
	writeFixture(t, root, ".git/config", []byte("secret"))
	writeFixture(t, root, ".specforge/scan-spool/batch.json", []byte("secret"))
	writeFixture(t, root, ".specforge/design-context/session.json", []byte("private governance context"))
	writeFixture(t, root, ".specforge.yaml", []byte("repository: governed"))
	writeFixture(t, root, "large.bin", make([]byte, 33))

	result, err := Inventory(root, 32)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Files) != 1 || result.Files[0].Path != "src/orders.go" {
		t.Fatalf("files=%+v", result.Files)
	}
	assertGap(t, result.Gaps, "large.bin", "SOURCE_FILE_TOO_LARGE")
}

func TestInventoryDoesNotFollowEscapingSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows symlink creation requires an elevated developer-mode environment")
	}
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape.txt")); err != nil {
		t.Fatal(err)
	}
	result, err := Inventory(root, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Files) != 0 {
		t.Fatalf("files=%+v", result.Files)
	}
	assertGap(t, result.Gaps, "escape.txt", "SYMLINK_ESCAPES_ROOT")
}

func TestInventoryWithPolicySkipsConfiguredDirectories(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, "node_modules/dependency/index.js", []byte("ignored"))
	writeFixture(t, root, "apps/web/node_modules/dependency/index.js", []byte("ignored"))
	writeFixture(t, root, "main.go", []byte("package main"))

	result, err := InventoryWithPolicy(root, 1024, []string{"node_modules/**"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Files) != 1 || result.Files[0].Path != "main.go" {
		t.Fatalf("expected only main.go, got %#v", result.Files)
	}
}

func writeFixture(t *testing.T, root, path string, contents []byte) {
	t.Helper()
	fullPath := filepath.Join(root, filepath.FromSlash(path))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fullPath, contents, 0o600); err != nil {
		t.Fatal(err)
	}
}

func assertGap(t *testing.T, gaps []CoverageGap, path, reason string) {
	t.Helper()
	for _, gap := range gaps {
		if gap.Path == path && gap.Reason == reason {
			return
		}
	}
	t.Fatalf("missing gap %s:%s in %+v", path, reason, gaps)
}
