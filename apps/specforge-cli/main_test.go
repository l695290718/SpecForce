package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGlobMatchesMonorepoPaths(t *testing.T) {
	for _, test := range []struct {
		pattern, path string
		want          bool
	}{
		{"apps/designer/**", "apps/designer/src/main.go", true},
		{"packages/*/**", "packages/designer-core/src/index.ts", true},
		{"deploy/**", "deploy/compose.yaml", true},
		{"apps/designer/**", "apps/policyhub/src/main.go", false},
	} {
		if got := globMatch(test.pattern, test.path); got != test.want {
			t.Fatalf("globMatch(%q, %q)=%v, want %v", test.pattern, test.path, got, test.want)
		}
	}
}

func TestResolveScopesSupportsSharedFilesAndRejectsUnmapped(t *testing.T) {
	config := FileConfig{Version: 1, Repository: Repository{ID: "codehub://enterprise/project/repo"}, Mappings: []Mapping{{Paths: []string{"apps/**"}, ApplicationServiceIDs: []string{"designer"}}, {Paths: []string{"package.json"}, ApplicationServiceIDs: []string{"designer", "policyhub"}}}}
	scopes, err := resolveScopes(config, []StagedEntry{{Path: "package.json", Status: "M"}})
	if err != nil || len(scopes) != 2 {
		t.Fatalf("shared file resolution failed: scopes=%v err=%v", scopes, err)
	}
	if _, err := resolveScopes(config, []StagedEntry{{Path: "README.md", Status: "M"}}); err == nil {
		t.Fatal("expected unmapped path to fail closed")
	}
}

func TestResolveScopesCarriesConfiguredScopePaths(t *testing.T) {
	config := FileConfig{
		Version: 1,
		Repository: Repository{ID: "codehub://enterprise/project/repo"},
		Mappings: []Mapping{{Paths: []string{"**"}, ApplicationServiceIDs: []string{"designer"}}},
		ScopePaths: map[string]string{"designer": "pf/product/service/designer"},
	}
	scopes, err := resolveScopes(config, []StagedEntry{{Path: "main.go", Status: "M"}})
	if err != nil || len(scopes) != 1 || scopes[0].ScopePath != "pf/product/service/designer" {
		t.Fatalf("scopes=%v err=%v", scopes, err)
	}
}

func TestCanonicalJSONSortsObjectKeys(t *testing.T) {
	value := map[string]any{"z": 1, "a": map[string]any{"b": true, "a": "x"}}
	got, err := canonicalJSON(value)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"a":{"a":"x","b":true},"z":1}` {
		t.Fatalf("canonical JSON=%s", got)
	}
}

func TestStagedEntriesReadsGitIndexWithoutChangingFiles(t *testing.T) {
	previous := runCommand
	runCommand = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "git" {
			t.Fatalf("unexpected command %s", name)
		}
		joined := filepath.Join(args...)
		if joined == "ls-files\\--stage\\--\\app.go" {
			return []byte("100644 abc123 0\tapp.go\n"), nil
		}
		return nil, nil
	}
	defer func() { runCommand = previous }()
	entries, err := stagedEntries(context.Background(), "M\x00app.go\x00")
	if err != nil || len(entries) != 1 || entries[0].Blob != "abc123" {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

func TestCommittedEntriesReadsCommitTreeBlobs(t *testing.T) {
	previous := runCommand
	runCommand = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name == "git" && len(args) >= 3 && args[0] == "ls-tree" {
			return []byte("100644 blob abc123\tapp.go\n"), nil
		}
		return nil, nil
	}
	defer func() { runCommand = previous }()
	entries, err := committedEntries(context.Background(), "M\x00app.go\x00")
	if err != nil || len(entries) != 1 || entries[0].Blob != "abc123" || entries[0].Mode != "100644" {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

func TestConfigLoadsSessionAndEndpoint(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, configName)
	contents := []byte("version: 1\nrepository:\n  id: codehub://enterprise/project/repo\n  defaultApplicationServiceId: com.huawei.celon.desiner\ngovernance:\n  endpoint: http://127.0.0.1:3001/mcp\nsessionIds:\n  com.huawei.celon.desiner: design-change-session:test\n")
	if err := os.WriteFile(path, contents, 0600); err != nil {
		t.Fatal(err)
	}
	config, err := loadConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if config.Governance.Endpoint == "" || config.SessionIDs["com.huawei.celon.desiner"] == "" {
		t.Fatalf("config=%+v", config)
	}
}

func TestAttestationSignatureVerification(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(nil)
	payloadValue := map[string]any{"stagedTreeHash": "tree", "expiresAt": "2999-01-01T00:00:00Z", "attestationId": "att-1"}
	payload, err := json.Marshal(payloadValue)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := canonicalJSON(payloadValue)
	if err != nil {
		t.Fatal(err)
	}
	signature := ed25519.Sign(privateKey, canonical)
	attestation := Attestation{Payload: payload, Signature: base64.StdEncoding.EncodeToString(signature), PublicKey: base64.StdEncoding.EncodeToString(publicKey)}
	if err := verifyAttestation(attestation, Evidence{StagedTreeHash: "tree"}); err != nil {
		t.Fatal(err)
	}
}

func TestAttestationRejectsRepositoryAndEvidenceMismatch(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(nil)
	payloadValue := map[string]any{
		"stagedTreeHash":     "tree",
		"expiresAt":          "2999-01-01T00:00:00Z",
		"attestationId":      "att-2",
		"repositoryId":       "repo-a",
		"parentCommit":       "parent-a",
		"fileManifestDigest": "manifest-a",
		"scopeMappingDigest": "mapping-a",
		"scopes":             []any{map[string]any{"architectureScope": map[string]any{"applicationServiceId": "service-a", "scopePath": "root/service-a"}, "sessionId": "session-a"}},
	}
	payload, _ := json.Marshal(payloadValue)
	canonical, _ := canonicalJSON(payloadValue)
	attestation := Attestation{Payload: payload, Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, canonical)), PublicKey: base64.StdEncoding.EncodeToString(publicKey)}
	evidence := Evidence{RepositoryID: "repo-b", ParentCommit: "parent-a", StagedTreeHash: "tree", ManifestDigest: "manifest-a", ScopeMappingDigest: "mapping-a", RequiredScopes: []Scope{{ApplicationServiceID: "service-a", ScopePath: "root/service-a"}}}
	if err := verifyAttestation(attestation, evidence); err == nil || err.Error() != "ATTESTATION_REPOSITORY_MISMATCH" {
		t.Fatalf("expected repository mismatch, got %v", err)
	}
}

func TestAttestationRejectsIncompleteScopeCoverage(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(nil)
	payloadValue := map[string]any{
		"stagedTreeHash":     "tree",
		"expiresAt":          "2999-01-01T00:00:00Z",
		"attestationId":      "att-3",
		"repositoryId":       "repo-a",
		"parentCommit":       "parent-a",
		"fileManifestDigest": "manifest-a",
		"scopeMappingDigest": "mapping-a",
		"scopes":             []any{map[string]any{"architectureScope": map[string]any{"applicationServiceId": "service-a", "scopePath": "root/service-a"}, "sessionId": "session-a"}},
	}
	payload, _ := json.Marshal(payloadValue)
	canonical, _ := canonicalJSON(payloadValue)
	attestation := Attestation{Payload: payload, Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, canonical)), PublicKey: base64.StdEncoding.EncodeToString(publicKey)}
	evidence := Evidence{RepositoryID: "repo-a", ParentCommit: "parent-a", StagedTreeHash: "tree", ManifestDigest: "manifest-a", ScopeMappingDigest: "mapping-a", RequiredScopes: []Scope{{ApplicationServiceID: "service-a", ScopePath: "root/service-a"}, {ApplicationServiceID: "service-b", ScopePath: "root/service-b"}}}
	if err := verifyAttestation(attestation, evidence); err == nil || err.Error() != "ATTESTATION_SCOPE_COVERAGE_INCOMPLETE" {
		t.Fatalf("expected Scope coverage failure, got %v", err)
	}
}

func TestHookInstallPreservesExistingHookAndIsIdempotent(t *testing.T) {
	root := t.TempDir()
	hooks := filepath.Join(root, ".git", "hooks")
	if err := os.MkdirAll(hooks, 0755); err != nil {
		t.Fatal(err)
	}
	hookPath := filepath.Join(hooks, "pre-commit")
	original := []byte("#!/bin/sh\necho existing\n")
	if err := os.WriteFile(hookPath, original, 0755); err != nil {
		t.Fatal(err)
	}
	if err := installHook(root, `C:\Tools\specforge.exe`); err != nil {
		t.Fatal(err)
	}
	backup, err := os.ReadFile(hookPath + ".specforge-original")
	if err != nil || string(backup) != string(original) {
		t.Fatalf("backup=%q err=%v", backup, err)
	}
	first, _ := os.ReadFile(hookPath)
	if !bytes.Contains(first, []byte(managedHookStart)) {
		t.Fatal("managed marker missing")
	}
	if err := installHook(root, `C:\Tools\specforge.exe`); err != nil {
		t.Fatal(err)
	}
	second, _ := os.ReadFile(hookPath)
	if string(first) != string(second) {
		t.Fatal("reinstall changed the managed hook")
	}
	if err := uninstallHook(root); err != nil {
		t.Fatal(err)
	}
	restored, err := os.ReadFile(hookPath)
	if err != nil || string(restored) != string(original) {
		t.Fatalf("restored=%q err=%v", restored, err)
	}
}
