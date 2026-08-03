package scanner

import (
	"strings"
	"testing"
)

func TestRedactExcerptRemovesSecretsAndCapsBytes(t *testing.T) {
	input := strings.Join([]string{
		"name: orders",
		"password=admin-secret",
		"Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345",
		"-----BEGIN PRIVATE KEY-----",
		"private-material-must-not-leak",
		"-----END PRIVATE KEY-----",
		strings.Repeat("x", 128),
	}, "\n")

	excerpt, redacted := RedactExcerpt([]byte(input), 80)
	if !redacted {
		t.Fatal("expected redaction")
	}
	if len([]byte(excerpt)) > 80 {
		t.Fatalf("excerpt bytes=%d", len([]byte(excerpt)))
	}
	for _, secret := range []string{"admin-secret", "abcdefghijklmnopqrstuvwxyz012345", "BEGIN PRIVATE KEY", "private-material-must-not-leak"} {
		if strings.Contains(excerpt, secret) {
			t.Fatalf("secret %q leaked in %q", secret, excerpt)
		}
	}
}

func TestRedactExcerptPreservesOrdinaryEvidence(t *testing.T) {
	excerpt, redacted := RedactExcerpt([]byte("GET /orders/{id}\nreturns Order"), 8192)
	if redacted || excerpt != "GET /orders/{id}\nreturns Order" {
		t.Fatalf("excerpt=%q redacted=%v", excerpt, redacted)
	}
}
