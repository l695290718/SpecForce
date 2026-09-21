package main

import (
	"context"
	"fmt"
	"io"
	"runtime"
	"strconv"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/extractors"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

func writeScannerMetadata(stdout io.Writer) error {
	catalog := extractors.DefaultCatalog()
	extractorVersions := make([]map[string]string, 0, len(catalog.Descriptors))
	for _, descriptor := range catalog.Descriptors {
		extractorVersions = append(extractorVersions, map[string]string{"id": descriptor.ExtractorID, "version": descriptor.Version})
	}
	return writeJSON(stdout, map[string]any{
		"platform":      runtime.GOOS + "-" + runtime.GOARCH,
		"architecture":  runtime.GOARCH,
		"extractors":    extractorVersions,
		"catalogDigest": catalog.Digest,
	})
}

func runScanSnapshot(ctx context.Context, root string, args []string, stdout io.Writer) error {
	values, err := parseSnapshotOptions(args)
	if err != nil {
		return err
	}
	maxSourceFileBytes := int64(scancontract.MaxSourceFileBytes)
	if raw := values["max-source-file-bytes"]; raw != "" {
		maxSourceFileBytes, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || maxSourceFileBytes < 1 || maxSourceFileBytes > int64(scancontract.MaxSourceFileBytes) {
			return fmt.Errorf("SCAN_LIMITS_EXCEEDED")
		}
	}
	allowDirty := true
	if raw := values["allow-dirty"]; raw != "" {
		allowDirty, err = strconv.ParseBool(raw)
		if err != nil {
			return fmt.Errorf("SCAN_OPTION_INVALID: allow-dirty")
		}
	}
	git := func(arguments ...string) (string, error) {
		output, commandErr := runCommand(ctx, "git", arguments...)
		return string(output), commandErr
	}
	ignorePatterns := splitIgnorePatterns(values["ignore-patterns"])
	identity, _, err := scanner.ResolveRepositoryIdentityWithPolicy(root, values["repository-id"], allowDirty, maxSourceFileBytes, ignorePatterns, git)
	if err != nil {
		return err
	}
	return writeJSON(stdout, identity)
}

func parseSnapshotOptions(args []string) (map[string]string, error) {
	values := map[string]string{}
	for index := 0; index < len(args); index += 2 {
		if index+1 >= len(args) || !strings.HasPrefix(args[index], "--") || strings.HasPrefix(args[index+1], "--") {
			return nil, usageError()
		}
		name := strings.TrimPrefix(args[index], "--")
		if name != "repository-id" && name != "allow-dirty" && name != "max-source-file-bytes" && name != "ignore-patterns" {
			return nil, fmt.Errorf("SCAN_OPTION_UNSUPPORTED: %s", name)
		}
		if _, exists := values[name]; exists {
			return nil, fmt.Errorf("SCAN_OPTION_DUPLICATE: %s", name)
		}
		values[name] = args[index+1]
	}
	if values["repository-id"] == "" {
		return nil, usageError()
	}
	return values, nil
}

func splitIgnorePatterns(value string) []string {
	result := []string{}
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}
