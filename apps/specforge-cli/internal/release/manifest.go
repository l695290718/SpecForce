package release

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

var (
	ErrUntrustedKey      = errors.New("SCANNER_RELEASE_KEY_UNTRUSTED")
	ErrRevokedRelease    = errors.New("SCANNER_RELEASE_REVOKED")
	ErrReleaseRollback   = errors.New("SCANNER_RELEASE_ROLLBACK_BLOCKED")
	ErrReleaseExpired    = errors.New("SCANNER_RELEASE_EXPIRED")
	ErrInvalidSignature  = errors.New("SCANNER_RELEASE_SIGNATURE_INVALID")
	ErrInvalidTrustStore = errors.New("SCANNER_TRUST_STORE_INVALID")
	ErrArtifactMismatch  = errors.New("SCANNER_ARTIFACT_DIGEST_MISMATCH")
	ErrPlatformMismatch  = errors.New("SCANNER_RELEASE_PLATFORM_MISMATCH")
)

type TrustStore struct {
	Keys                  map[string]ed25519.PublicKey
	RevokedReleaseIDs     map[string]bool
	MinimumScannerVersion string
}

func VerifyPlatform(manifest scancontract.ScannerReleaseManifest, goos, goarch string) error {
	if manifest.Platform != goos+"-"+goarch {
		return ErrPlatformMismatch
	}
	return nil
}

func VerifyArtifact(path string, artifact scancontract.ScannerArtifact) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("SCANNER_ARTIFACT_READ_FAILED: %w", err)
	}
	defer file.Close()
	hash := sha256.New()
	written, err := io.Copy(hash, file)
	if err != nil {
		return fmt.Errorf("SCANNER_ARTIFACT_READ_FAILED: %w", err)
	}
	if written != int64(artifact.SizeBytes) || hex.EncodeToString(hash.Sum(nil)) != string(artifact.Sha256) {
		return ErrArtifactMismatch
	}
	return nil
}

type trustStoreFile struct {
	Keys                  map[string]string `json:"keys"`
	RevokedReleaseIDs     []string          `json:"revokedReleaseIds"`
	MinimumScannerVersion string            `json:"minimumScannerVersion"`
}

func LoadTrustStore(path string) (TrustStore, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return TrustStore{}, fmt.Errorf("SCANNER_TRUST_STORE_READ_FAILED: %w", err)
	}
	var file trustStoreFile
	if err := json.Unmarshal(contents, &file); err != nil || len(file.Keys) == 0 {
		return TrustStore{}, ErrInvalidTrustStore
	}
	store := TrustStore{Keys: map[string]ed25519.PublicKey{}, RevokedReleaseIDs: map[string]bool{}, MinimumScannerVersion: file.MinimumScannerVersion}
	for keyID, encoded := range file.Keys {
		decoded, decodeErr := base64.StdEncoding.DecodeString(encoded)
		if keyID == "" || decodeErr != nil || len(decoded) != ed25519.PublicKeySize {
			return TrustStore{}, ErrInvalidTrustStore
		}
		store.Keys[keyID] = ed25519.PublicKey(decoded)
	}
	for _, releaseID := range file.RevokedReleaseIDs {
		if releaseID == "" {
			return TrustStore{}, ErrInvalidTrustStore
		}
		store.RevokedReleaseIDs[releaseID] = true
	}
	return store, nil
}

func LoadManifest(path string) (scancontract.ScannerReleaseManifest, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return scancontract.ScannerReleaseManifest{}, fmt.Errorf("SCANNER_RELEASE_READ_FAILED: %w", err)
	}
	var manifest scancontract.ScannerReleaseManifest
	if err := json.Unmarshal(contents, &manifest); err != nil {
		return scancontract.ScannerReleaseManifest{}, errors.New("SCANNER_RELEASE_MANIFEST_INVALID")
	}
	return manifest, nil
}

func Verify(manifest scancontract.ScannerReleaseManifest, trust TrustStore, now time.Time) error {
	if manifest.Algorithm != "Ed25519" || manifest.ContractVersion != "2.0" {
		return ErrInvalidSignature
	}
	key, ok := trust.Keys[manifest.SigningKeyId]
	if !ok || len(key) != ed25519.PublicKeySize {
		return ErrUntrustedKey
	}
	if manifest.Status != scancontract.ScannerReleaseStatusActive || trust.RevokedReleaseIDs[manifest.ReleaseId] {
		return ErrRevokedRelease
	}
	if trust.MinimumScannerVersion != "" {
		comparison, err := compareVersions(manifest.ScannerVersion, trust.MinimumScannerVersion)
		if err != nil || comparison < 0 {
			return ErrReleaseRollback
		}
	}
	issuedAt, issuedErr := time.Parse(time.RFC3339, manifest.IssuedAt)
	expiresAt, expiresErr := time.Parse(time.RFC3339, manifest.ExpiresAt)
	if issuedErr != nil || expiresErr != nil || now.Before(issuedAt) || !now.Before(expiresAt) {
		return ErrReleaseExpired
	}
	canonical, err := CanonicalUnsignedManifest(manifest)
	if err != nil {
		return ErrInvalidSignature
	}
	signature, err := base64.StdEncoding.DecodeString(manifest.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize || !ed25519.Verify(key, canonical, signature) {
		return ErrInvalidSignature
	}
	return nil
}

func CanonicalUnsignedManifest(manifest scancontract.ScannerReleaseManifest) ([]byte, error) {
	encoded, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	var value map[string]any
	if err := json.Unmarshal(encoded, &value); err != nil {
		return nil, err
	}
	delete(value, "signature")
	return canonicalValue(value)
}

func canonicalValue(value any) ([]byte, error) {
	switch typed := value.(type) {
	case nil, bool, string, float64:
		return json.Marshal(typed)
	case []any:
		parts := make([]string, len(typed))
		for index, item := range typed {
			canonical, err := canonicalValue(item)
			if err != nil {
				return nil, err
			}
			parts[index] = string(canonical)
		}
		return []byte("[" + strings.Join(parts, ",") + "]"), nil
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			encodedKey, _ := json.Marshal(key)
			encodedValue, err := canonicalValue(typed[key])
			if err != nil {
				return nil, err
			}
			parts = append(parts, string(encodedKey)+":"+string(encodedValue))
		}
		return []byte("{" + strings.Join(parts, ",") + "}"), nil
	default:
		return nil, fmt.Errorf("CANONICAL_JSON_VALUE_INVALID: %T", value)
	}
}

func compareVersions(left, right string) (int, error) {
	leftParts, err := versionParts(left)
	if err != nil {
		return 0, err
	}
	rightParts, err := versionParts(right)
	if err != nil {
		return 0, err
	}
	for index := range leftParts {
		if leftParts[index] < rightParts[index] {
			return -1, nil
		}
		if leftParts[index] > rightParts[index] {
			return 1, nil
		}
	}
	return 0, nil
}

func versionParts(value string) ([3]int, error) {
	var result [3]int
	parts := strings.Split(value, ".")
	if len(parts) != len(result) {
		return result, errors.New("SCANNER_VERSION_INVALID")
	}
	for index, part := range parts {
		if part == "" || (len(part) > 1 && part[0] == '0') {
			return result, errors.New("SCANNER_VERSION_INVALID")
		}
		parsed, err := strconv.Atoi(part)
		if err != nil || parsed < 0 {
			return result, errors.New("SCANNER_VERSION_INVALID")
		}
		result[index] = parsed
	}
	return result, nil
}
