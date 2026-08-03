package session

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestLoadAcceptsBoundedFixtureForExpectedRelease(t *testing.T) {
	descriptor, err := Load(fixturePath("valid-session.json"), "scanner-release:2.0.0-windows-amd64", time.Date(2026, 8, 3, 8, 30, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if descriptor.SessionId != "scan-session:fixture-001" {
		t.Fatalf("descriptor=%+v", descriptor)
	}
	if string(NonceDigest(descriptor.SessionNonce)) != "88d8e37cbab8a2984f092bdbadc668828797e76317d890bf2b686104dd31d9be" {
		t.Fatalf("nonce digest=%s", NonceDigest(descriptor.SessionNonce))
	}
}

func TestValidateRejectsReleaseMismatchAndExpiry(t *testing.T) {
	descriptor := validDescriptor()
	if err := Validate(descriptor, "scanner-release:other", time.Date(2026, 8, 3, 8, 30, 0, 0, time.UTC)); !errors.Is(err, ErrReleaseMismatch) {
		t.Fatalf("release mismatch err=%v", err)
	}
	if err := Validate(descriptor, descriptor.ScannerReleaseId, time.Date(2026, 8, 3, 9, 0, 0, 0, time.UTC)); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("expiry err=%v", err)
	}
}

func validDescriptor() scancontract.ScanSessionDescriptor {
	descriptor, err := Load(fixturePath("valid-session.json"), "scanner-release:2.0.0-windows-amd64", time.Date(2026, 8, 3, 8, 30, 0, 0, time.UTC))
	if err != nil {
		panic(err)
	}
	return descriptor
}

func fixturePath(name string) string {
	return filepath.Join("..", "..", "..", "..", "packages", "scan-contract", "fixtures", name)
}
