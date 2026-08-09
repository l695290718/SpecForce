package main

import "testing"

func TestParseObserveOptionsRequiresExactScopeAndConnector(t *testing.T) {
	config := FileConfig{Repository: Repository{ID: "repo-1", DefaultApplicationService: "com.huawei.celon.desiner"}}
	options, err := parseObserveOptions(config, []string{"--connector-id", "local-repository", "--scope-path", "designer"})
	if err != nil {
		t.Fatal(err)
	}
	if options.applicationServiceID != "com.huawei.celon.desiner" || options.sequence != 0 || options.sourceNamespace != "local-repository-v1" {
		t.Fatalf("options=%+v", options)
	}
	if _, err := parseObserveOptions(config, []string{"--connector-id", "local-repository"}); err == nil {
		t.Fatal("expected scope requirement")
	}
}

func TestParseObserveOptionsRequiresPreviousDigestAfterFirstBatch(t *testing.T) {
	config := FileConfig{Repository: Repository{ID: "repo-1", DefaultApplicationService: "com.huawei.celon.desiner"}}
	_, err := parseObserveOptions(config, []string{"--connector-id", "local-repository", "--scope-path", "designer", "--sequence", "1"})
	if err == nil || err.Error() != "OBSERVE_PREVIOUS_DIGEST_REQUIRED" {
		t.Fatalf("err=%v", err)
	}
}
