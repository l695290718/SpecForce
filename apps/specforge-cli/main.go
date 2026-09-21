package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	configName       = ".specforge.yaml"
	attestationDir   = ".git/specforge/attestations"
	managedHookStart = "# specforge-managed-pre-commit-v1"
	defaultEndpoint  = "http://127.0.0.1:3001/mcp"
)

type FileConfig struct {
	Version    int               `yaml:"version"`
	Repository Repository        `yaml:"repository"`
	Governance Governance        `yaml:"governance"`
	Mappings   []Mapping         `yaml:"scopeMappings"`
	ScopePaths map[string]string `yaml:"scopePaths"`
	SessionIDs map[string]string `yaml:"sessionIds"`
}

type Repository struct {
	ID                        string `yaml:"id"`
	DefaultApplicationService string `yaml:"defaultApplicationServiceId"`
}

type Governance struct {
	Endpoint string `yaml:"endpoint"`
}

type Mapping struct {
	Paths                 []string `yaml:"paths"`
	ApplicationServiceIDs []string `yaml:"applicationServiceIds"`
}

type StagedEntry struct {
	Path   string `json:"path"`
	Status string `json:"status"`
	Mode   string `json:"mode"`
	Blob   string `json:"blob"`
}

type Scope struct {
	ApplicationServiceID string `json:"applicationServiceId"`
	ScopePath            string `json:"scopePath,omitempty"`
}

type ScopeBinding struct {
	Scope     Scope  `json:"architectureScope"`
	SessionID string `json:"sessionId"`
}

type Evidence struct {
	RepositoryID       string        `json:"repositoryId"`
	ParentCommit       string        `json:"parentCommit"`
	StagedTreeHash     string        `json:"stagedTreeHash"`
	ManifestDigest     string        `json:"fileManifestDigest"`
	ConfigDigest       string        `json:"configDigest"`
	ScopeMappingDigest string        `json:"scopeMappingDigest"`
	Manifest           []StagedEntry `json:"manifest"`
	RequiredScopes     []Scope       `json:"requiredScopes,omitempty"`
}

type Attestation struct {
	Payload   json.RawMessage `json:"payload"`
	Signature string          `json:"signature"`
	KeyID     string          `json:"keyId"`
	PublicKey string          `json:"publicKey"`
}

type StoredAttestation struct {
	Attestation
	VerifiedAt string `json:"verifiedAt"`
}

type commandRunner func(context.Context, string, ...string) ([]byte, error)

var runCommand commandRunner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%s: %w: %s", name, err, strings.TrimSpace(string(output)))
	}
	return output, nil
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "specforge: %s\n", err)
		os.Exit(1)
	}
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		return usageError()
	}
	if len(args) == 1 && args[0] == "scanner-metadata" {
		return writeScannerMetadata(stdout)
	}
	root, err := repositoryRoot(context.Background())
	if err != nil {
		return err
	}
	if args[0] == "scan" {
		if len(args) > 1 && args[1] == "status" {
			return runScanStatus(root, args[2:], stdout)
		}
		if len(args) > 1 && args[1] == "snapshot" {
			return runScanSnapshot(context.Background(), root, args[2:], stdout)
		}
		return runLocalScan(context.Background(), root, args[1:], stdout)
	}
	config, err := loadConfig(filepath.Join(root, configName))
	if err != nil {
		return err
	}
	switch args[0] {
	case "login":
		return login(context.Background(), root, config, stdin, stdout)
	case "hook":
		if len(args) != 2 {
			return usageError()
		}
		switch args[1] {
		case "install":
			return installHook(root, os.Args[0])
		case "uninstall":
			return uninstallHook(root)
		case "doctor":
			return doctor(context.Background(), root, config, stdout)
		default:
			return usageError()
		}
	case "verify-staged":
		return verifyStaged(context.Background(), root, config, stdout, stderr)
	case "verify-commit":
		return verifyCommit(context.Background(), root, config, args[1:], stdout)
	case "observe":
		return runObserve(context.Background(), root, config, args[1:], stdout)
	case "status":
		return doctor(context.Background(), root, config, stdout)
	default:
		return usageError()
	}
}

func usageError() error {
	return errors.New("usage: specforge scanner-metadata | login | hook install|uninstall|doctor | verify-staged | verify-commit --attestation <file> | status | scan --repository-id <id> --release <file> --session <file> --trust <file> [--spool <dir>] [--artifact <file>] | scan snapshot --repository-id <id> [--allow-dirty true|false] [--max-source-file-bytes <n>] [--ignore-patterns <csv>] | scan status --session <file> [--spool <dir>] | observe --connector-id <id> --scope-path <path> [--application-service-id <id>] [--source-cursor <cursor>] [--sequence <n>] [--previous-batch-digest <digest>] [--allow-dirty]")
}

func repositoryRoot(ctx context.Context) (string, error) {
	output, err := runCommand(ctx, "git", "rev-parse", "--show-toplevel")
	if err != nil {
		return "", fmt.Errorf("GIT_REPOSITORY_NOT_FOUND: %w", err)
	}
	return filepath.Clean(strings.TrimSpace(string(output))), nil
}

func loadConfig(path string) (FileConfig, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return FileConfig{}, fmt.Errorf("CONFIG_NOT_FOUND: %s", path)
	}
	var config FileConfig
	if err := yaml.Unmarshal(contents, &config); err != nil {
		return FileConfig{}, fmt.Errorf("CONFIG_INVALID: %w", err)
	}
	if config.Version != 1 || strings.TrimSpace(config.Repository.ID) == "" {
		return FileConfig{}, errors.New("CONFIG_INVALID: version 1 and repository.id are required")
	}
	if len(config.Mappings) == 0 && strings.TrimSpace(config.Repository.DefaultApplicationService) == "" {
		return FileConfig{}, errors.New("CONFIG_INVALID: defaultApplicationServiceId or scopeMappings is required")
	}
	return config, nil
}

func collectEvidence(ctx context.Context, root string, config FileConfig) (Evidence, []Scope, error) {
	repositoryID := config.Repository.ID
	parent, err := gitOutput(ctx, "rev-parse", "HEAD")
	if err != nil {
		return Evidence{}, nil, errors.New("GIT_PARENT_COMMIT_UNAVAILABLE")
	}
	statusOutput, err := gitOutput(ctx, "diff", "--cached", "--name-status", "--no-renames", "-z")
	if err != nil {
		return Evidence{}, nil, errors.New("GIT_INDEX_UNAVAILABLE")
	}
	entries, err := stagedEntries(ctx, statusOutput)
	if err != nil {
		return Evidence{}, nil, err
	}
	if len(entries) == 0 {
		return Evidence{}, nil, errors.New("NO_STAGED_CHANGES")
	}
	tree, err := gitOutput(ctx, "write-tree")
	if err != nil {
		return Evidence{}, nil, errors.New("GIT_TREE_UNAVAILABLE")
	}
	configBytes, _ := yaml.Marshal(config)
	configDigest := digest(configBytes)
	scopes, err := resolveScopes(config, entries)
	if err != nil {
		return Evidence{}, nil, err
	}
	manifestDigest := digestMust(entries)
	mappingDigest := digestMust(config.Mappings)
	evidence := Evidence{
		RepositoryID:       repositoryID,
		ParentCommit:       strings.TrimSpace(parent),
		StagedTreeHash:     strings.TrimSpace(tree),
		ManifestDigest:     manifestDigest,
		ConfigDigest:       configDigest,
		ScopeMappingDigest: mappingDigest,
		Manifest:           entries,
	}
	return evidence, scopes, nil
}

func gitOutput(ctx context.Context, args ...string) (string, error) {
	output, err := runCommand(ctx, "git", args...)
	return strings.TrimSpace(string(output)), err
}

func stagedEntries(ctx context.Context, statusOutput string) ([]StagedEntry, error) {
	parts := bytes.Split([]byte(statusOutput), []byte{0})
	entries := make([]StagedEntry, 0, len(parts)/2)
	for i := 0; i < len(parts); {
		if len(parts[i]) == 0 {
			i++
			continue
		}
		status := string(parts[i])
		if len(status) > 1 {
			status = status[:1]
		}
		i++
		if i >= len(parts) || len(parts[i]) == 0 {
			return nil, errors.New("GIT_INDEX_INVALID: staged path is missing")
		}
		path := filepath.ToSlash(string(parts[i]))
		i++
		mode, blob := stagedBlob(ctx, path)
		if status == "D" {
			mode, blob = "000000", ""
		}
		entries = append(entries, StagedEntry{Path: path, Status: status, Mode: mode, Blob: blob})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, nil
}

func stagedBlob(ctx context.Context, path string) (string, string) {
	output, err := runCommand(ctx, "git", "ls-files", "--stage", "--", path)
	if err != nil || strings.TrimSpace(string(output)) == "" {
		return "000000", ""
	}
	line := strings.TrimSpace(strings.Split(string(output), "\n")[0])
	fields := strings.Fields(line)
	if len(fields) < 3 {
		return "000000", ""
	}
	return fields[0], fields[1]
}

func resolveScopes(config FileConfig, entries []StagedEntry) ([]Scope, error) {
	ids := map[string]bool{}
	for _, entry := range entries {
		if entry.Path == configName {
			for _, mapping := range config.Mappings {
				for _, id := range mapping.ApplicationServiceIDs {
					ids[id] = true
				}
			}
			if config.Repository.DefaultApplicationService != "" {
				ids[config.Repository.DefaultApplicationService] = true
			}
			continue
		}
		matched := false
		for _, mapping := range config.Mappings {
			for _, pattern := range mapping.Paths {
				if globMatch(pattern, entry.Path) {
					matched = true
					for _, id := range mapping.ApplicationServiceIDs {
						ids[id] = true
					}
				}
			}
		}
		if len(config.Mappings) == 0 && config.Repository.DefaultApplicationService != "" {
			matched = true
			ids[config.Repository.DefaultApplicationService] = true
		}
		if !matched {
			return nil, fmt.Errorf("SCOPE_PATH_UNMAPPED: %s", entry.Path)
		}
	}
	if len(ids) == 0 {
		return nil, errors.New("SCOPE_MAPPING_EMPTY")
	}
	result := make([]Scope, 0, len(ids))
	for id := range ids {
		result = append(result, Scope{ApplicationServiceID: id, ScopePath: config.ScopePaths[id]})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ApplicationServiceID < result[j].ApplicationServiceID })
	return result, nil
}

func globMatch(pattern, path string) bool {
	pattern, path = filepath.ToSlash(pattern), filepath.ToSlash(path)
	if pattern == path {
		return true
	}
	if strings.HasSuffix(pattern, "/**") && strings.HasPrefix(path, strings.TrimSuffix(pattern, "**")) {
		return true
	}
	parts := strings.Split(pattern, "/")
	pathParts := strings.Split(path, "/")
	return matchParts(parts, pathParts)
}

func matchParts(pattern, path []string) bool {
	if len(pattern) == 0 {
		return len(path) == 0
	}
	if pattern[0] == "**" {
		return matchParts(pattern[1:], path) || (len(path) > 0 && matchParts(pattern, path[1:]))
	}
	if len(path) == 0 {
		return false
	}
	matched, _ := filepath.Match(pattern[0], path[0])
	return matched && matchParts(pattern[1:], path[1:])
}

func digest(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }

func digestMust(value any) string {
	canonical, err := canonicalJSON(value)
	if err != nil {
		panic(err)
	}
	return digest(canonical)
}

func canonicalJSON(value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var normalized any
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		return nil, err
	}
	return canonicalValue(normalized)
}

func canonicalValue(value any) ([]byte, error) {
	switch typed := value.(type) {
	case nil, bool, string, float64:
		return json.Marshal(typed)
	case []any:
		parts := make([][]byte, len(typed))
		for i, item := range typed {
			var err error
			parts[i], err = canonicalValue(item)
			if err != nil {
				return nil, err
			}
		}
		return []byte("[" + joinBytes(parts, ",") + "]"), nil
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			keyJSON, _ := json.Marshal(key)
			valueJSON, err := canonicalValue(typed[key])
			if err != nil {
				return nil, err
			}
			parts = append(parts, string(keyJSON)+":"+string(valueJSON))
		}
		return []byte("{" + strings.Join(parts, ",") + "}"), nil
	default:
		return nil, fmt.Errorf("unsupported canonical JSON value %T", value)
	}
}

func joinBytes(parts [][]byte, separator string) string {
	stringsParts := make([]string, len(parts))
	for i, part := range parts {
		stringsParts[i] = string(part)
	}
	return strings.Join(stringsParts, separator)
}

func verifyStaged(ctx context.Context, root string, config FileConfig, stdout, stderr io.Writer) error {
	evidence, scopes, err := collectEvidence(ctx, root, config)
	if err != nil {
		return err
	}
	bindings := make([]ScopeBinding, 0, len(scopes))
	for _, scope := range scopes {
		if scope.ScopePath == "" {
			return fmt.Errorf("SCOPE_PATH_REQUIRED: %s", scope.ApplicationServiceID)
		}
		sessionID := config.SessionIDs[scope.ApplicationServiceID]
		if sessionID == "" {
			sessionID = os.Getenv("SPECFORGE_SESSION_ID_" + strings.NewReplacer(".", "_", "-", "_").Replace(scope.ApplicationServiceID))
		}
		if sessionID == "" {
			return fmt.Errorf("DESIGN_CHANGE_SESSION_REQUIRED: %s", scope.ApplicationServiceID)
		}
		bindings = append(bindings, ScopeBinding{Scope: scope, SessionID: sessionID})
	}
	evidence.RequiredScopes = scopes
	client, err := newMCPClient(config)
	if err != nil {
		return err
	}
	response, err := client.issueAttestation(ctx, evidence, bindings, os.Getenv("SPECFORGE_ACTOR_ID"))
	if err != nil {
		return err
	}
	if err := verifyAttestation(response, evidence); err != nil {
		return err
	}
	if err := saveAttestation(root, response); err != nil {
		return err
	}
	_, _, err = collectEvidence(ctx, root, config)
	if err != nil {
		return errors.New("GIT_INDEX_CHANGED_DURING_VERIFICATION")
	}
	fmt.Fprintf(stdout, "SpecForge attestation verified for %d Scope(s).\n", len(bindings))
	return nil
}

func verifyCommit(ctx context.Context, root string, config FileConfig, args []string, stdout io.Writer) error {
	if len(args) != 2 || args[0] != "--attestation" || strings.TrimSpace(args[1]) == "" {
		return errors.New("VERIFY_COMMIT_USAGE: --attestation <file> is required")
	}
	attestation, err := readAttestation(args[1])
	if err != nil {
		return err
	}
	evidence, _, err := collectCommittedEvidence(ctx, config)
	if err != nil {
		return err
	}
	client, err := newMCPClient(config)
	if err != nil {
		return err
	}
	if err := client.verifyCommitAttestation(ctx, attestation, evidence); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "SpecForge commit attestation verified for %d Scope(s): %s\n", len(evidence.RequiredScopes), root)
	return nil
}

func readAttestation(path string) (Attestation, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return Attestation{}, fmt.Errorf("ATTESTATION_FILE_UNAVAILABLE: %w", err)
	}
	var stored StoredAttestation
	if err := json.Unmarshal(contents, &stored); err == nil && len(stored.Payload) > 0 && stored.Signature != "" && stored.PublicKey != "" {
		return stored.Attestation, nil
	}
	var attestation Attestation
	if err := json.Unmarshal(contents, &attestation); err != nil || len(attestation.Payload) == 0 || attestation.Signature == "" || attestation.PublicKey == "" {
		return Attestation{}, errors.New("ATTESTATION_FILE_INVALID")
	}
	return attestation, nil
}

func collectCommittedEvidence(ctx context.Context, config FileConfig) (Evidence, []Scope, error) {
	tree, err := gitOutput(ctx, "rev-parse", "HEAD^{tree}")
	if err != nil {
		return Evidence{}, nil, errors.New("GIT_COMMITTED_TREE_UNAVAILABLE")
	}
	statusOutput, err := gitOutput(ctx, "diff-tree", "--root", "--no-commit-id", "--name-status", "--no-renames", "-r", "-z", "HEAD")
	if err != nil {
		return Evidence{}, nil, errors.New("GIT_COMMITTED_MANIFEST_UNAVAILABLE")
	}
	entries, err := committedEntries(ctx, statusOutput)
	if err != nil {
		return Evidence{}, nil, err
	}
	if len(entries) == 0 {
		return Evidence{}, nil, errors.New("NO_COMMITTED_CHANGES")
	}
	scopes, err := resolveScopes(config, entries)
	if err != nil {
		return Evidence{}, nil, err
	}
	for _, scope := range scopes {
		if scope.ScopePath == "" {
			return Evidence{}, nil, fmt.Errorf("SCOPE_PATH_REQUIRED: %s", scope.ApplicationServiceID)
		}
	}
	parent, _ := gitOutput(ctx, "rev-parse", "HEAD^")
	evidence := Evidence{
		RepositoryID:       config.Repository.ID,
		ParentCommit:       parent,
		StagedTreeHash:     tree,
		ManifestDigest:     digestMust(entries),
		ScopeMappingDigest: digestMust(config.Mappings),
		Manifest:           entries,
		RequiredScopes:     scopes,
	}
	return evidence, scopes, nil
}

func committedEntries(ctx context.Context, statusOutput string) ([]StagedEntry, error) {
	parts := bytes.Split([]byte(statusOutput), []byte{0})
	entries := make([]StagedEntry, 0, len(parts)/2)
	for i := 0; i < len(parts); {
		if len(parts[i]) == 0 {
			i++
			continue
		}
		status := string(parts[i])
		if len(status) > 1 {
			status = status[:1]
		}
		i++
		if i >= len(parts) || len(parts[i]) == 0 {
			return nil, errors.New("GIT_COMMITTED_MANIFEST_INVALID: committed path is missing")
		}
		path := filepath.ToSlash(string(parts[i]))
		i++
		mode, blob := committedBlob(ctx, path)
		if status == "D" {
			mode, blob = "000000", ""
		}
		entries = append(entries, StagedEntry{Path: path, Status: status, Mode: mode, Blob: blob})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, nil
}

func committedBlob(ctx context.Context, path string) (string, string) {
	output, err := runCommand(ctx, "git", "ls-tree", "HEAD", "--", path)
	if err != nil || strings.TrimSpace(string(output)) == "" {
		return "000000", ""
	}
	fields := strings.Fields(strings.TrimSpace(string(output)))
	if len(fields) < 3 {
		return "000000", ""
	}
	return fields[0], fields[2]
}

func verifyAttestation(attestation Attestation, evidence Evidence) error {
	var payload struct {
		RepositoryID       string         `json:"repositoryId"`
		ParentCommit       string         `json:"parentCommit"`
		StagedTreeHash     string         `json:"stagedTreeHash"`
		FileManifestDigest string         `json:"fileManifestDigest"`
		ScopeMappingDigest string         `json:"scopeMappingDigest"`
		ExpiresAt          string         `json:"expiresAt"`
		Scopes             []ScopeBinding `json:"scopes"`
	}
	if err := json.Unmarshal(attestation.Payload, &payload); err != nil {
		return errors.New("ATTESTATION_PAYLOAD_INVALID")
	}
	if payload.StagedTreeHash != evidence.StagedTreeHash {
		return errors.New("ATTESTATION_TREE_MISMATCH")
	}
	if payload.RepositoryID != evidence.RepositoryID {
		return errors.New("ATTESTATION_REPOSITORY_MISMATCH")
	}
	if payload.ParentCommit != evidence.ParentCommit || payload.FileManifestDigest != evidence.ManifestDigest || payload.ScopeMappingDigest != evidence.ScopeMappingDigest {
		return errors.New("ATTESTATION_EVIDENCE_MISMATCH")
	}
	seenScopes := map[string]bool{}
	for _, binding := range payload.Scopes {
		seenScopes[binding.Scope.ApplicationServiceID+"|"+binding.Scope.ScopePath] = true
	}
	for _, required := range evidence.RequiredScopes {
		if !seenScopes[required.ApplicationServiceID+"|"+required.ScopePath] {
			return errors.New("ATTESTATION_SCOPE_COVERAGE_INCOMPLETE")
		}
	}
	expires, err := time.Parse(time.RFC3339, payload.ExpiresAt)
	if err != nil || !expires.After(time.Now().UTC()) {
		return errors.New("ATTESTATION_EXPIRED")
	}
	publicKey, err := base64.StdEncoding.DecodeString(attestation.PublicKey)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return errors.New("ATTESTATION_KEY_INVALID")
	}
	signature, err := base64.StdEncoding.DecodeString(attestation.Signature)
	var payloadValue any
	canonicalPayload, canonicalErr := json.Marshal(attestation.Payload)
	if canonicalErr != nil || json.Unmarshal(canonicalPayload, &payloadValue) != nil {
		return errors.New("ATTESTATION_PAYLOAD_INVALID")
	}
	canonicalPayload, canonicalErr = canonicalJSON(payloadValue)
	if err != nil || canonicalErr != nil || !ed25519.Verify(ed25519.PublicKey(publicKey), canonicalPayload, signature) {
		return errors.New("ATTESTATION_SIGNATURE_INVALID")
	}
	trusted := strings.TrimSpace(os.Getenv("SPECFORGE_TRUSTED_ATTESTATION_KEY"))
	if trusted != "" && trusted != attestation.PublicKey {
		return errors.New("ATTESTATION_KEY_UNTRUSTED")
	}
	return nil
}

func saveAttestation(root string, attestation Attestation) error {
	var payload struct {
		ID string `json:"attestationId"`
	}
	if err := json.Unmarshal(attestation.Payload, &payload); err != nil || payload.ID == "" {
		return errors.New("ATTESTATION_PAYLOAD_INVALID")
	}
	directory := filepath.Join(root, attestationDir)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return fmt.Errorf("ATTESTATION_CACHE_FAILED: %w", err)
	}
	stored := StoredAttestation{Attestation: attestation, VerifiedAt: time.Now().UTC().Format(time.RFC3339)}
	contents, _ := json.MarshalIndent(stored, "", "  ")
	return os.WriteFile(filepath.Join(directory, payload.ID+".json"), contents, 0600)
}

func installHook(root, executable string) error {
	hooks := filepath.Join(root, ".git", "hooks")
	if err := os.MkdirAll(hooks, 0755); err != nil {
		return err
	}
	path := filepath.Join(hooks, "pre-commit")
	old, err := os.ReadFile(path)
	if err == nil && !bytes.HasPrefix(old, []byte(managedHookStart)) {
		backup := path + ".specforge-original"
		if _, backupErr := os.Stat(backup); errors.Is(backupErr, os.ErrNotExist) {
			if err := os.WriteFile(backup, old, 0755); err != nil {
				return err
			}
		}
	}
	executable = filepath.ToSlash(executable)
	hook := managedHookStart + "\n" + "#!/bin/sh\n" + "set -eu\n" + "SPECForge_BIN='" + shellQuote(executable) + "'\n" + "if [ -x \"$(git rev-parse --git-path hooks)/pre-commit.specforge-original\" ]; then\n  \"$(git rev-parse --git-path hooks)/pre-commit.specforge-original\" \"$@\"\nfi\nexec \"$SPECForge_BIN\" verify-staged\n"
	if err := os.WriteFile(path, []byte(hook), 0755); err != nil {
		return err
	}
	return nil
}

func uninstallHook(root string) error {
	path := filepath.Join(root, ".git", "hooks", "pre-commit")
	contents, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if !bytes.HasPrefix(contents, []byte(managedHookStart)) {
		return errors.New("HOOK_NOT_MANAGED")
	}
	backup := path + ".specforge-original"
	if _, err := os.Stat(backup); err == nil {
		if err := os.Rename(backup, path); err != nil {
			return err
		}
	} else if err := os.Remove(path); err != nil {
		return err
	}
	return nil
}

func shellQuote(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\\", "/"), "'", "'\\''")
}

func doctor(ctx context.Context, root string, config FileConfig, stdout io.Writer) error {
	hook := filepath.Join(root, ".git", "hooks", "pre-commit")
	_, hookErr := os.Stat(hook)
	endpoint := config.Governance.Endpoint
	if endpoint == "" {
		endpoint = os.Getenv("SPECFORGE_MCP_ENDPOINT")
	}
	if endpoint == "" {
		endpoint = defaultEndpoint
	}
	_, tokenErr := loadToken(ctx, endpoint)
	fmt.Fprintf(stdout, "repository=%s\nendpoint=%s\nhook=%s\ncredentials=%s\n", config.Repository.ID, endpoint, ternary(hookErr == nil, "installed", "missing"), ternary(tokenErr == nil, "available", "missing"))
	return nil
}

func ternary(ok bool, yes, no string) string {
	if ok {
		return yes
	}
	return no
}

type mcpClient struct {
	endpoint   string
	token      string
	httpClient *http.Client
}

func newMCPClient(config FileConfig) (*mcpClient, error) {
	endpoint := config.Governance.Endpoint
	if endpoint == "" {
		endpoint = os.Getenv("SPECFORGE_MCP_ENDPOINT")
	}
	if endpoint == "" {
		endpoint = defaultEndpoint
	}
	token, err := loadToken(context.Background(), endpoint)
	if err != nil {
		return nil, errors.New("MCP_CREDENTIALS_UNAVAILABLE")
	}
	return &mcpClient{endpoint: endpoint, token: token, httpClient: &http.Client{Timeout: 20 * time.Second}}, nil
}

func loadToken(ctx context.Context, endpoint string) (string, error) {
	if token := strings.TrimSpace(os.Getenv("SPECFORGE_TOKEN")); token != "" {
		return token, nil
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, "git", "credential", "fill")
	cmd.Stdin = strings.NewReader("protocol=" + u.Scheme + "\nhost=" + u.Host + "\nusername=specforge-cli\n\n")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(output), "\n") {
		if strings.HasPrefix(line, "password=") {
			return strings.TrimPrefix(line, "password="), nil
		}
	}
	return "", errors.New("credential not found")
}

func login(ctx context.Context, root string, config FileConfig, stdin io.Reader, stdout io.Writer) error {
	endpoint := config.Governance.Endpoint
	if endpoint == "" {
		endpoint = os.Getenv("SPECFORGE_MCP_ENDPOINT")
	}
	if endpoint == "" {
		endpoint = defaultEndpoint
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return errors.New("MCP_ENDPOINT_INVALID")
	}
	fmt.Fprint(stdout, "SpecForge token: ")
	line, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	token := strings.TrimSpace(line)
	if token == "" {
		return errors.New("MCP_TOKEN_EMPTY")
	}
	credential := "protocol=" + u.Scheme + "\nhost=" + u.Host + "\nusername=specforge-cli\npassword=" + token + "\n\n"
	cmd := exec.CommandContext(ctx, "git", "credential", "approve")
	cmd.Stdin = strings.NewReader(credential)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("CREDENTIAL_STORE_FAILED: %s", strings.TrimSpace(string(output)))
	}
	return nil
}

func (client *mcpClient) issueAttestation(ctx context.Context, evidence Evidence, bindings []ScopeBinding, actorID string) (Attestation, error) {
	if actorID == "" {
		actorID = "specforge-cli"
	}
	args := map[string]any{"repositoryId": evidence.RepositoryID, "parentCommit": evidence.ParentCommit, "stagedTreeHash": evidence.StagedTreeHash, "fileManifestDigest": evidence.ManifestDigest, "configDigest": evidence.ConfigDigest, "scopeMappingDigest": evidence.ScopeMappingDigest, "manifest": evidence.Manifest, "scopes": bindings, "architectureScope": bindings[0].Scope, "actorId": actorID, "verificationEvidenceRefs": []string{"specforge verify-staged staged-tree=passed"}}
	result, err := client.callTool(ctx, "issue_change_attestation", args)
	if err != nil {
		return Attestation{}, err
	}
	var response Attestation
	if err := json.Unmarshal(result, &response); err != nil {
		return Attestation{}, errors.New("ATTESTATION_RESPONSE_INVALID")
	}
	return response, nil
}

func (client *mcpClient) verifyCommitAttestation(ctx context.Context, attestation Attestation, evidence Evidence) error {
	var envelope map[string]any
	encoded, err := json.Marshal(attestation)
	if err != nil || json.Unmarshal(encoded, &envelope) != nil {
		return errors.New("ATTESTATION_RESPONSE_INVALID")
	}
	result, err := client.callTool(ctx, "verify_change_attestation", map[string]any{
		"attestation": envelope,
		"evidence": map[string]any{
			"repositoryId":       evidence.RepositoryID,
			"parentCommit":       evidence.ParentCommit,
			"committedTreeHash":  evidence.StagedTreeHash,
			"fileManifestDigest": evidence.ManifestDigest,
			"scopeMappingDigest": evidence.ScopeMappingDigest,
			"requiredScopes":     evidence.RequiredScopes,
		},
		"architectureScope": evidence.RequiredScopes[0],
	})
	if err != nil {
		return err
	}
	var verification struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(result, &verification); err != nil || verification.Status != "VERIFIED" {
		return errors.New("ATTESTATION_VERIFICATION_FAILED")
	}
	return verifyAttestation(attestation, evidence)
}

func (client *mcpClient) callTool(ctx context.Context, name string, args map[string]any) (json.RawMessage, error) {
	session, err := client.rpc(ctx, 1, "initialize", map[string]any{"protocolVersion": "2025-06-18", "capabilities": map[string]any{}, "clientInfo": map[string]any{"name": "specforge-cli", "version": "0.1.0"}}, "")
	if err != nil {
		return nil, err
	}
	_ = session
	result, err := client.rpc(ctx, 2, "tools/call", map[string]any{"name": name, "arguments": args}, "")
	if err != nil {
		return nil, err
	}
	var toolResult struct {
		IsError bool `json:"isError"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(result, &toolResult); err != nil {
		return nil, errors.New("MCP_RESPONSE_INVALID")
	}
	if toolResult.IsError || len(toolResult.Content) == 0 {
		return nil, errors.New("MCP_TOOL_FAILED")
	}
	return json.RawMessage(toolResult.Content[0].Text), nil
}

func (client *mcpClient) rpc(ctx context.Context, id int, method string, params map[string]any, sessionID string) (json.RawMessage, error) {
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, client.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+client.token)
	if sessionID != "" {
		req.Header.Set("Mcp-Session-Id", sessionID)
	}
	resp, err := client.httpClient.Do(req)
	if err != nil {
		return nil, errors.New("MCP_UNAVAILABLE")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("MCP_HTTP_%d", resp.StatusCode)
	}
	contents, _ := io.ReadAll(resp.Body)
	contents = extractSSE(contents)
	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code int `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(contents, &envelope); err != nil || envelope.Error != nil {
		return nil, errors.New("MCP_PROTOCOL_ERROR")
	}
	return envelope.Result, nil
}

func extractSSE(contents []byte) []byte {
	if bytes.HasPrefix(bytes.TrimSpace(contents), []byte("data:")) {
		for _, line := range bytes.Split(contents, []byte{'\n'}) {
			if bytes.HasPrefix(line, []byte("data:")) {
				return bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
			}
		}
	}
	return contents
}
