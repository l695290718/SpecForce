package release

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

const fixturePublicKey = "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg="

func TestVerifyAcceptsTrustedSharedFixture(t *testing.T) {
	manifest := readManifestFixture(t)
	publicKey, err := base64.StdEncoding.DecodeString(fixturePublicKey)
	if err != nil {
		t.Fatal(err)
	}
	trust := TrustStore{
		Keys:                  map[string]ed25519.PublicKey{manifest.SigningKeyId: publicKey},
		RevokedReleaseIDs:     map[string]bool{},
		MinimumScannerVersion: "2.0.0",
	}
	if err := Verify(manifest, trust, time.Date(2026, 8, 4, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyRejectsUnknownKeyRevocationRollbackAndExpiry(t *testing.T) {
	manifest := readManifestFixture(t)
	publicKey, _ := base64.StdEncoding.DecodeString(fixturePublicKey)
	now := time.Date(2026, 8, 4, 0, 0, 0, 0, time.UTC)

	if err := Verify(manifest, TrustStore{Keys: map[string]ed25519.PublicKey{}}, now); !errors.Is(err, ErrUntrustedKey) {
		t.Fatalf("unknown key err=%v", err)
	}
	if err := Verify(manifest, TrustStore{Keys: map[string]ed25519.PublicKey{manifest.SigningKeyId: publicKey}, RevokedReleaseIDs: map[string]bool{manifest.ReleaseId: true}}, now); !errors.Is(err, ErrRevokedRelease) {
		t.Fatalf("revoked release err=%v", err)
	}
	if err := Verify(manifest, TrustStore{Keys: map[string]ed25519.PublicKey{manifest.SigningKeyId: publicKey}, MinimumScannerVersion: "2.0.1"}, now); !errors.Is(err, ErrReleaseRollback) {
		t.Fatalf("rollback err=%v", err)
	}
	if err := Verify(manifest, TrustStore{Keys: map[string]ed25519.PublicKey{manifest.SigningKeyId: publicKey}}, time.Date(2027, 8, 4, 0, 0, 0, 0, time.UTC)); !errors.Is(err, ErrReleaseExpired) {
		t.Fatalf("expiry err=%v", err)
	}
}

func TestCanonicalUnsignedManifestMatchesSharedFixture(t *testing.T) {
	manifest := readManifestFixture(t)
	canonical, err := CanonicalUnsignedManifest(manifest)
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(fixturePath("signed-release.canonical.json"))
	if err != nil {
		t.Fatal(err)
	}
	wantCanonical := strings.TrimSpace(string(want))
	if string(canonical) != wantCanonical {
		t.Fatalf("canonical mismatch\nwant=%s\ngot=%s", want, canonical)
	}
}

func TestLoadTrustStoreRequiresPinnedRawKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "trust.json")
	contents := []byte(`{"keys":{"scanner-release-fixture-key-1":"` + fixturePublicKey + `"},"revokedReleaseIds":["scanner-release:old"],"minimumScannerVersion":"2.0.0"}`)
	if err := os.WriteFile(path, contents, 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := LoadTrustStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Keys["scanner-release-fixture-key-1"]) != ed25519.PublicKeySize || !store.RevokedReleaseIDs["scanner-release:old"] {
		t.Fatalf("store=%+v", store)
	}
	if err := os.WriteFile(path, []byte(`{"keys":{"bad":"not-base64"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadTrustStore(path); !errors.Is(err, ErrInvalidTrustStore) {
		t.Fatalf("invalid trust store err=%v", err)
	}
}

func TestVerifyArtifactAndPlatformFailClosed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "specforge")
	contents := []byte("scanner-binary")
	if err := os.WriteFile(path, contents, 0o700); err != nil {
		t.Fatal(err)
	}
	artifact := scancontract.ScannerArtifact{SizeBytes: len(contents), Sha256: scancontract.Sha256(digestBytes(contents))}
	if err := VerifyArtifact(path, artifact); err != nil {
		t.Fatal(err)
	}
	artifact.Sha256 = scancontract.Sha256(strings.Repeat("0", 64))
	if err := VerifyArtifact(path, artifact); !errors.Is(err, ErrArtifactMismatch) {
		t.Fatalf("artifact mismatch err=%v", err)
	}
	manifest := readManifestFixture(t)
	if err := VerifyPlatform(manifest, "linux", "amd64"); !errors.Is(err, ErrPlatformMismatch) {
		t.Fatalf("platform mismatch err=%v", err)
	}
}

func digestBytes(contents []byte) string {
	sum := sha256.Sum256(contents)
	return hex.EncodeToString(sum[:])
}

func readManifestFixture(t *testing.T) scancontract.ScannerReleaseManifest {
	t.Helper()
	contents, err := os.ReadFile(fixturePath("signed-release.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest scancontract.ScannerReleaseManifest
	if err := json.Unmarshal(contents, &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest
}

func fixturePath(name string) string {
	return filepath.Join("..", "..", "..", "..", "packages", "scan-contract", "fixtures", name)
}
