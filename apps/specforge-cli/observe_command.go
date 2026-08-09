package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/connector"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type observeOptions struct {
	connectorID          string
	sourceNamespace      string
	applicationServiceID string
	scopePath            string
	sequence             int
	previousBatchDigest  *string
	sourceCursor         *string
	maxObservations      int
	maxSourceFileBytes   int64
	maxExcerptBytes      int
	allowDirtyWorktree   bool
}

func runObserve(ctx context.Context, root string, config FileConfig, args []string, stdout io.Writer) error {
	options, err := parseObserveOptions(config, args)
	if err != nil {
		return err
	}
	source := connector.LocalRepositorySource{
		Root: root, RepositoryID: config.Repository.ID, ArchitectureScope: connectorScope(options),
		AllowDirtyWorktree: options.allowDirtyWorktree, MaxSourceFileBytes: options.maxSourceFileBytes,
		MaxExcerptBytes: options.maxExcerptBytes,
		Git: func(arguments ...string) (string, error) {
			output, commandErr := runCommand(ctx, "git", arguments...)
			return string(output), commandErr
		},
	}
	page, err := source.Poll(ctx, options.sourceCursor, options.maxObservations)
	if err != nil {
		return err
	}
	if len(page.Observations) == 0 && !page.HasMore {
		return writeJSON(stdout, map[string]any{"status": "IDLE", "sourceCursor": page.SourceCursor, "sourceVersion": page.SourceVersion, "coverage": page.Coverage})
	}
	batch, err := connector.BuildBatch(connectorScope(options), options.connectorID, options.sourceNamespace, connector.Checkpoint{AcceptedSequence: options.sequence - 1, AcceptedBatchDigest: options.previousBatchDigest}, page)
	if err != nil {
		return err
	}
	return writeJSON(stdout, map[string]any{"status": "READY_FOR_MCP_SUBMIT", "hasMore": page.HasMore, "batch": batch})
}

func parseObserveOptions(config FileConfig, args []string) (observeOptions, error) {
	values := map[string]string{}
	allowed := map[string]bool{
		"--connector-id": true, "--source-namespace": true, "--application-service-id": true, "--scope-path": true,
		"--sequence": true, "--previous-batch-digest": true, "--source-cursor": true, "--max-observations": true,
		"--max-source-file-bytes": true, "--max-excerpt-bytes": true, "--allow-dirty": true,
	}
	for index := 0; index < len(args); index++ {
		name := args[index]
		if name == "--allow-dirty" {
			if _, exists := values[name]; exists {
				return observeOptions{}, fmt.Errorf("OBSERVE_OPTION_DUPLICATE: %s", name)
			}
			values[name] = "true"
			continue
		}
		if index+1 >= len(args) || !strings.HasPrefix(name, "--") || strings.HasPrefix(args[index+1], "--") {
			return observeOptions{}, errors.New("OBSERVE_USAGE")
		}
		if _, exists := values[name]; exists {
			return observeOptions{}, fmt.Errorf("OBSERVE_OPTION_DUPLICATE: %s", name)
		}
		values[name] = args[index+1]
		index++
	}
	for name := range values {
		if !allowed[name] {
			return observeOptions{}, fmt.Errorf("OBSERVE_OPTION_UNSUPPORTED: %s", name)
		}
	}
	required := func(name string) (string, error) {
		value := strings.TrimSpace(values[name])
		if value == "" {
			return "", fmt.Errorf("OBSERVE_OPTION_REQUIRED: %s", name)
		}
		return value, nil
	}
	connectorID, err := required("--connector-id")
	if err != nil {
		return observeOptions{}, err
	}
	scopePath, err := required("--scope-path")
	if err != nil {
		return observeOptions{}, err
	}
	applicationServiceID := strings.TrimSpace(values["--application-service-id"])
	if applicationServiceID == "" {
		applicationServiceID = strings.TrimSpace(config.Repository.DefaultApplicationService)
	}
	if applicationServiceID == "" {
		return observeOptions{}, errors.New("OBSERVE_OPTION_REQUIRED: --application-service-id")
	}
	sourceNamespace := strings.TrimSpace(values["--source-namespace"])
	if sourceNamespace == "" {
		sourceNamespace = "local-repository-v1"
	}
	sequence, err := parseNonNegative(values["--sequence"], 0)
	if err != nil {
		return observeOptions{}, err
	}
	maxObservations, err := parsePositive(values["--max-observations"], connector.MaxObservationsPerBatch)
	if err != nil {
		return observeOptions{}, err
	}
	maxSourceFileBytes, err := parsePositiveInt64(values["--max-source-file-bytes"], 10*1024*1024)
	if err != nil {
		return observeOptions{}, err
	}
	maxExcerptBytes, err := parseNonNegative(values["--max-excerpt-bytes"], 8*1024)
	if err != nil {
		return observeOptions{}, err
	}
	previousBatchDigest, err := optionalDigest(values["--previous-batch-digest"])
	if err != nil {
		return observeOptions{}, err
	}
	sourceCursor := optionalValue(values["--source-cursor"])
	if sequence == 0 && previousBatchDigest != nil {
		return observeOptions{}, errors.New("OBSERVE_PREVIOUS_DIGEST_WITHOUT_SEQUENCE")
	}
	if sequence > 0 && previousBatchDigest == nil {
		return observeOptions{}, errors.New("OBSERVE_PREVIOUS_DIGEST_REQUIRED")
	}
	return observeOptions{
		connectorID: connectorID, sourceNamespace: sourceNamespace, applicationServiceID: applicationServiceID, scopePath: scopePath,
		sequence: sequence, previousBatchDigest: previousBatchDigest, sourceCursor: sourceCursor, maxObservations: maxObservations,
		maxSourceFileBytes: maxSourceFileBytes, maxExcerptBytes: maxExcerptBytes, allowDirtyWorktree: values["--allow-dirty"] == "true",
	}, nil
}

func connectorScope(options observeOptions) scancontract.ArchitectureScope {
	return scancontract.ArchitectureScope{ApplicationServiceId: options.applicationServiceID, ScopePath: options.scopePath}
}

func parseNonNegative(value string, fallback int) (int, error) {
	if strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0, errors.New("OBSERVE_NUMBER_INVALID")
	}
	return parsed, nil
}

func parsePositive(value string, fallback int) (int, error) {
	parsed, err := parseNonNegative(value, fallback)
	if err != nil || parsed < 1 {
		return 0, errors.New("OBSERVE_NUMBER_INVALID")
	}
	return parsed, nil
}

func parsePositiveInt64(value string, fallback int64) (int64, error) {
	if strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 1 {
		return 0, errors.New("OBSERVE_NUMBER_INVALID")
	}
	return parsed, nil
}

func optionalDigest(value string) (*string, error) {
	value = strings.TrimSpace(value)
	if value == "" || value == "null" {
		return nil, nil
	}
	if len(value) != 64 {
		return nil, errors.New("OBSERVE_DIGEST_INVALID")
	}
	return &value, nil
}

func optionalValue(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" || value == "null" {
		return nil
	}
	return &value
}
