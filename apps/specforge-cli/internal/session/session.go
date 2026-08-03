package session

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

var (
	ErrReleaseMismatch = errors.New("SCAN_SESSION_RELEASE_MISMATCH")
	ErrSessionExpired  = errors.New("SCAN_SESSION_EXPIRED")
)

func Load(path, expectedReleaseID string, now time.Time) (scancontract.ScanSessionDescriptor, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return scancontract.ScanSessionDescriptor{}, fmt.Errorf("SCAN_SESSION_READ_FAILED: %w", err)
	}
	var descriptor scancontract.ScanSessionDescriptor
	if err := json.Unmarshal(contents, &descriptor); err != nil {
		return scancontract.ScanSessionDescriptor{}, fmt.Errorf("SCAN_SESSION_INVALID: %w", err)
	}
	if err := Validate(descriptor, expectedReleaseID, now); err != nil {
		return scancontract.ScanSessionDescriptor{}, err
	}
	return descriptor, nil
}

func Validate(descriptor scancontract.ScanSessionDescriptor, expectedReleaseID string, now time.Time) error {
	if err := descriptor.Validate(); err != nil {
		return err
	}
	if descriptor.ScannerReleaseId != expectedReleaseID {
		return ErrReleaseMismatch
	}
	expiresAt, err := time.Parse(time.RFC3339, descriptor.ExpiresAt)
	if err != nil || !now.Before(expiresAt) {
		return ErrSessionExpired
	}
	return nil
}

func NonceDigest(nonce string) scancontract.Sha256 {
	sum := sha256.Sum256([]byte(nonce))
	return scancontract.Sha256(hex.EncodeToString(sum[:]))
}
