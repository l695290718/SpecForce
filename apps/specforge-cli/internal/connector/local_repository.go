package connector

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/extractors"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

type LocalRepositorySource struct {
	Root               string
	RepositoryID       string
	ArchitectureScope  scancontract.ArchitectureScope
	AllowDirtyWorktree bool
	MaxSourceFileBytes int64
	MaxExcerptBytes    int
	Git                scanner.GitCommand
}

func (source LocalRepositorySource) Poll(ctx context.Context, checkpoint *string, maxObservations int) (ObservationPage, error) {
	if source.Root == "" || source.RepositoryID == "" || source.Git == nil {
		return ObservationPage{}, errors.New("CONNECTOR_CONFIGURATION_INVALID")
	}
	if err := source.ArchitectureScope.Validate(); err != nil {
		return ObservationPage{}, err
	}
	identity, inventory, err := scanner.ResolveRepositoryIdentity(source.Root, source.RepositoryID, source.AllowDirtyWorktree, source.MaxSourceFileBytes, source.Git)
	if err != nil {
		return ObservationPage{}, err
	}
	observations, coverage, err := extractors.DefaultRegistry().ExtractAll(ctx, source.Root, identity, inventory.Files, source.MaxExcerptBytes)
	if err != nil {
		return ObservationPage{}, err
	}
	if maxObservations < 1 || maxObservations > MaxObservationsPerBatch {
		maxObservations = MaxObservationsPerBatch
	}
	snapshotDigest := string(identity.SnapshotDigest)
	previousSnapshot, offset, validCursor := ParseCursor(checkpoint)
	if !validCursor || previousSnapshot != snapshotDigest {
		offset = 0
	}
	pageObservations := make([]Observation, 0, len(observations))
	for _, observation := range observations {
		payload, marshalErr := observationPayload(observation, snapshotDigest)
		if marshalErr != nil {
			return ObservationPage{}, marshalErr
		}
		pageObservations = append(pageObservations, Observation{
			ID:                observation.Id,
			ExternalAssetType: observation.ObservationType,
			ExternalID:        filepath.ToSlash(observation.Source.Path) + ":" + observation.Id,
			Payload:           payload,
			SourceVersion:     snapshotDigest,
			ObservedAt:        StableObservedAt(snapshotDigest),
		})
	}
	if offset >= len(pageObservations) {
		return ObservationPage{SourceCursor: Cursor(snapshotDigest, len(pageObservations)), SourceVersion: snapshotDigest, ObservedAt: StableObservedAt(snapshotDigest), Coverage: coverageMap(coverage, snapshotDigest, len(pageObservations), len(pageObservations)), HasMore: false}, nil
	}
	end := offset + maxObservations
	if end > len(pageObservations) {
		end = len(pageObservations)
	}
	return ObservationPage{
		SourceCursor: Cursor(snapshotDigest, end), SourceVersion: snapshotDigest, ObservedAt: StableObservedAt(snapshotDigest),
		Observations: pageObservations[offset:end], Coverage: coverageMap(coverage, snapshotDigest, offset, end-offset), HasMore: end < len(pageObservations),
	}, nil
}

func observationPayload(observation scancontract.SourceObservationV2, snapshotDigest string) (map[string]any, error) {
	encoded, err := json.Marshal(observation)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		return nil, err
	}
	payload["snapshotDigest"] = snapshotDigest
	return payload, nil
}

func coverageMap(coverage scancontract.ScanCoverageDelta, snapshotDigest string, pageOffset, pageSize int) map[string]any {
	return map[string]any{
		"indexedFiles":     coverage.IndexedFiles,
		"skippedFiles":     coverage.SkippedFiles,
		"observationCount": coverage.ObservationCount,
		"coverageGaps":     coverage.CoverageGaps,
		"snapshotDigest":   snapshotDigest,
		"pageOffset":       pageOffset,
		"pageSize":         pageSize,
		"complete":         len(coverage.CoverageGaps) == 0,
	}
}
