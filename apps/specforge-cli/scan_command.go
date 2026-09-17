package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/batch"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/extractors"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/release"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/session"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/spool"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/technology"
)

type localScanOptions struct {
	releasePath string
	sessionPath string
	trustPath   string
	spoolBase   string
	artifact    string
}

func runLocalScan(ctx context.Context, root string, config FileConfig, args []string, stdout io.Writer) error {
	options, err := parseLocalScanOptions(root, args, true)
	if err != nil {
		return err
	}
	manifest, err := release.LoadManifest(options.releasePath)
	if err != nil {
		return err
	}
	trust, err := release.LoadTrustStore(options.trustPath)
	if err != nil {
		return err
	}
	if err := release.Verify(manifest, trust, time.Now().UTC()); err != nil {
		return err
	}
	if err := release.VerifyPlatform(manifest, runtime.GOOS, runtime.GOARCH); err != nil {
		return err
	}
	if err := release.VerifyArtifact(options.artifact, manifest.Artifact); err != nil {
		return err
	}
	descriptor, err := session.Load(options.sessionPath, manifest.ReleaseId, time.Now().UTC())
	if err != nil {
		return err
	}
	git := func(arguments ...string) (string, error) {
		output, commandErr := runCommand(ctx, "git", arguments...)
		return string(output), commandErr
	}
	identity, inventory, err := scanner.ResolveRepositoryIdentity(root, config.Repository.ID, descriptor.RepositoryPolicy.AllowDirtyWorktree, int64(descriptor.Limits.MaxSourceFileBytes), git)
	if err != nil {
		return err
	}
	if len(inventory.Files) == 0 {
		inventory, err = scanner.Inventory(root, int64(descriptor.Limits.MaxSourceFileBytes))
		if err != nil {
			return err
		}
	}
	catalog := extractors.DefaultCatalog()
	registry := extractors.DefaultRegistry()
	if err := catalog.Verify(registry); err != nil {
		return err
	}
	technologyProfile, err := technology.Detect(inventory.Files, repositoryFileReader(root), nil)
	if err != nil {
		return err
	}
	coveragePlan := catalog.Plan(technologyProfile)
	store, err := spool.Open(options.spoolBase, descriptor.SessionId)
	if err != nil {
		return err
	}
	if err := store.WriteContext(spool.ScanContext{
		SessionID:             descriptor.SessionId,
		SnapshotDigest:        string(identity.SnapshotDigest),
		EffectivePolicyDigest: string(descriptor.PolicyReceipt.EffectivePolicyDigest),
		CatalogDigest:         string(descriptor.PolicyReceipt.ExtractorCatalogDigest),
		TechnologyDigest:      string(technologyProfile.Digest),
	}); err != nil {
		return err
	}
	observations, coverage, err := extractors.DefaultRegistry().ExtractAll(ctx, root, identity, inventory.Files, descriptor.Limits.MaxExcerptBytes)
	if err != nil {
		return err
	}
	coverage = mergeInventoryCoverage(coverage, inventory)
	if len(observations) == 0 {
		return errors.New("SCAN_NO_OBSERVATIONS")
	}
	if coverage.ObservationCount != len(observations) {
		return errors.New("SCAN_COVERAGE_OBSERVATION_MISMATCH")
	}
	batches, err := buildScanBatches(descriptor, observations, coverage)
	if err != nil {
		return err
	}
	for _, built := range batches {
		if err := store.AppendKnowledgeBatch(built); err != nil {
			return err
		}
	}
	if err := scanner.VerifyDirtySnapshot(root, identity, int64(descriptor.Limits.MaxSourceFileBytes)); err != nil {
		return err
	}
	manifestDigest, err := scanner.InventoryDigest(inventory)
	if err != nil {
		return err
	}
	finalization := scancontract.ScanFinalization{
		ContractVersion: descriptor.ContractVersion, SessionId: descriptor.SessionId, ArchitectureScope: descriptor.ArchitectureScope,
		RepositorySnapshotDigest: identity.SnapshotDigest, ManifestDigest: manifestDigest, FinalBatchDigest: batches[len(batches)-1].BatchDigest,
		BatchCount: len(batches), ObservationCount: len(observations), Coverage: coverage, CoveragePlan: coveragePlan, PolicyReceipt: descriptor.PolicyReceipt, GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := finalization.Validate(descriptor.ArchitectureScope); err != nil {
		return err
	}
	if err := store.WriteFinalization(finalization); err != nil {
		return err
	}
	summary := map[string]any{"sessionId": descriptor.SessionId, "snapshotDigest": identity.SnapshotDigest, "batchCount": len(batches), "observationCount": len(observations), "coverageGapCount": len(coverage.CoverageGaps), "spoolPath": store.Root()}
	return writeJSON(stdout, summary)
}

func repositoryFileReader(root string) technology.ReadFile {
	return func(path string) ([]byte, error) {
		relative := filepath.Clean(filepath.FromSlash(path))
		if filepath.IsAbs(relative) || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			return nil, fmt.Errorf("TECHNOLOGY_SOURCE_OUTSIDE_ROOT:%s", path)
		}
		return os.ReadFile(filepath.Join(root, relative))
	}
}

func mergeInventoryCoverage(coverage scancontract.ScanCoverageDelta, inventory scanner.InventoryResult) scancontract.ScanCoverageDelta {
	seen := make(map[string]struct{}, len(coverage.CoverageGaps)+len(inventory.Gaps))
	for _, gap := range coverage.CoverageGaps {
		seen[gap] = struct{}{}
	}
	for _, gap := range inventory.Gaps {
		seen[filepath.ToSlash(gap.Path)+":"+gap.Reason] = struct{}{}
	}
	coverage.CoverageGaps = coverage.CoverageGaps[:0]
	for gap := range seen {
		coverage.CoverageGaps = append(coverage.CoverageGaps, gap)
	}
	sort.Strings(coverage.CoverageGaps)
	coverage.SkippedFiles += len(inventory.Gaps)
	return coverage
}

func buildScanBatches(descriptor scancontract.ScanSessionDescriptor, observations []scancontract.SourceObservationV2, coverage scancontract.ScanCoverageDelta) ([]scancontract.KnowledgeScanBatch, error) {
	if len(observations) > descriptor.Limits.MaxObservationsPerSession {
		return nil, errors.New("SCAN_SESSION_OBSERVATION_LIMIT_EXCEEDED")
	}
	if descriptor.Limits.MaxObservationsPerBatch < 1 || descriptor.Limits.MaxBatchBytes < 1 {
		return nil, errors.New("SCAN_BATCH_LIMIT_INVALID")
	}
	result := make([]scancontract.KnowledgeScanBatch, 0, (len(observations)+descriptor.Limits.MaxObservationsPerBatch-1)/descriptor.Limits.MaxObservationsPerBatch)
	var previous *scancontract.Sha256
	for offset := 0; offset < len(observations); {
		end := min(offset+descriptor.Limits.MaxObservationsPerBatch, len(observations))
		var accepted *scancontract.KnowledgeScanBatch
		for end > offset {
			delta := scancontract.ScanCoverageDelta{ObservationCount: end - offset, CoverageGaps: []string{}}
			if offset == 0 {
				delta.IndexedFiles = coverage.IndexedFiles
				delta.SkippedFiles = coverage.SkippedFiles
				delta.CoverageGaps = coverage.CoverageGaps
			}
			built, err := batch.Build(descriptor, len(result), previous, observations[offset:end], delta)
			if err != nil {
				return nil, err
			}
			encoded, err := batch.Marshal(built)
			if err != nil {
				return nil, err
			}
			if len(encoded) <= descriptor.Limits.MaxBatchBytes {
				accepted = &built
				break
			}
			end--
		}
		if accepted == nil {
			return nil, errors.New("SCAN_BATCH_BYTES_LIMIT_EXCEEDED")
		}
		result = append(result, *accepted)
		previousDigest := accepted.BatchDigest
		previous = &previousDigest
		offset = end
	}
	return result, nil
}

func runScanStatus(root string, args []string, stdout io.Writer) error {
	options, err := parseLocalScanOptions(root, args, false)
	if err != nil {
		return err
	}
	contents, err := os.ReadFile(options.sessionPath)
	if err != nil {
		return fmt.Errorf("SCAN_SESSION_READ_FAILED: %w", err)
	}
	var descriptor scancontract.ScanSessionDescriptor
	if err := json.Unmarshal(contents, &descriptor); err != nil || descriptor.SessionId == "" {
		return errors.New("SCAN_SESSION_INVALID")
	}
	store, err := spool.Open(options.spoolBase, descriptor.SessionId)
	if err != nil {
		return err
	}
	checkpoint, err := store.Checkpoint()
	if err != nil {
		return err
	}
	return writeJSON(stdout, map[string]any{"sessionId": descriptor.SessionId, "producedSequence": checkpoint.AcceptedSequence, "producedBatchDigest": checkpoint.AcceptedBatchDigest, "spoolPath": store.Root()})
}

func parseLocalScanOptions(root string, args []string, requireRelease bool) (localScanOptions, error) {
	values := map[string]string{}
	for index := 0; index < len(args); index += 2 {
		if index+1 >= len(args) || !strings.HasPrefix(args[index], "--") || strings.HasPrefix(args[index+1], "--") {
			return localScanOptions{}, usageError()
		}
		name := strings.TrimPrefix(args[index], "--")
		if _, exists := values[name]; exists {
			return localScanOptions{}, fmt.Errorf("SCAN_OPTION_DUPLICATE: %s", name)
		}
		values[name] = args[index+1]
	}
	allowed := map[string]bool{"session": true, "spool": true, "release": requireRelease, "trust": requireRelease, "artifact": requireRelease}
	for name := range values {
		if !allowed[name] {
			return localScanOptions{}, fmt.Errorf("SCAN_OPTION_UNSUPPORTED: %s", name)
		}
	}
	if values["session"] == "" || (requireRelease && (values["release"] == "" || values["trust"] == "")) {
		return localScanOptions{}, usageError()
	}
	artifact := values["artifact"]
	if requireRelease && artifact == "" {
		artifact, _ = os.Executable()
	}
	spoolBase := values["spool"]
	if spoolBase == "" {
		spoolBase = filepath.Join(root, ".specforge", "scan-spool")
	}
	return localScanOptions{releasePath: values["release"], sessionPath: values["session"], trustPath: values["trust"], spoolBase: spoolBase, artifact: artifact}, nil
}

func writeJSON(writer io.Writer, value any) error {
	contents, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(writer, "%s\n", contents)
	return err
}
