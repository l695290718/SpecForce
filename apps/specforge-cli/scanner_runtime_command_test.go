package main

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestScannerMetadataUsesTheStaticExtractorCatalog(t *testing.T) {
	var output bytes.Buffer
	if err := writeScannerMetadata(&output); err != nil {
		t.Fatal(err)
	}
	var metadata struct {
		Platform   string              `json:"platform"`
		Extractors []map[string]string `json:"extractors"`
	}
	if err := json.Unmarshal(output.Bytes(), &metadata); err != nil {
		t.Fatal(err)
	}
	if metadata.Platform == "" || len(metadata.Extractors) < 10 {
		t.Fatalf("metadata=%+v", metadata)
	}
}

func TestSnapshotOptionsRequireAnExplicitRepositoryIdentity(t *testing.T) {
	if _, err := parseSnapshotOptions([]string{"--allow-dirty", "true"}); err == nil {
		t.Fatal("expected repository identity requirement")
	}
	options, err := parseSnapshotOptions([]string{"--repository-id", "repo:test", "--allow-dirty", "false"})
	if err != nil || options["repository-id"] != "repo:test" {
		t.Fatalf("options=%v err=%v", options, err)
	}
}
