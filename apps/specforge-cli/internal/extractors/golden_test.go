package extractors

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type goldenLocation struct {
	Type   string
	Symbol string
	Path   string
	Line   int
}

func TestGoldenFixturesProduceStableEvidence(t *testing.T) {
	tests := []struct {
		fixture string
		want    []goldenLocation
	}{
		{"java-spring", []goldenLocation{
			{"HTTP_CONTROLLER", "OrderController", "src/main/java/OrderController.java", 5},
			{"HTTP_HANDLER", "createOrder", "src/main/java/OrderController.java", 9},
			{"EVENT_PUBLICATION", "events.publishEvent", "src/main/java/OrderController.java", 11},
			{"DATA_ENTITY", "Order", "src/main/java/OrderController.java", 16},
		}},
		{"typescript-node", []goldenLocation{
			{"DATA_SCHEMA", "Invoice", "src/routes.ts", 3},
			{"HTTP_HANDLER", "POST /invoices", "src/routes.ts", 5},
			{"EVENT_PUBLICATION", "events.emit", "src/routes.ts", 6},
		}},
		{"go-service", []goldenLocation{
			{"CODE_TYPE", "Customer", "service.go", 5},
			{"HTTP_HANDLER", "CreateCustomerHandler", "service.go", 13},
			{"EVENT_PUBLICATION", "Publish", "service.go", 14},
		}},
		{"python-fastapi", []goldenLocation{
			{"API_OPERATION", "POST /orders", "service.py", 15},
			{"DATA_ENTITY", "Order", "service.py", 8},
			{"BUSINESS_VALIDATION", "\"id\"", "service.py", 11},
			{"ASYNC_TASK", "task", "service.py", 21},
		}},
		{"go-gin", []goldenLocation{
			{"API_OPERATION", "POST /orders", "service.go", 10},
			{"DATA_ENTITY", "Order", "service.go", 5},
			{"SQL_QUERY", "Query", "service.go", 14},
			{"SERVICE_DEPENDENCY", "http-client", "service.go", 15},
		}},
		{"contracts", []goldenLocation{
			{"EVENT_CHANNEL_OPERATION", "publishOrderCreated", "asyncapi.yaml", 8},
			{"API_OPERATION", "getOrder", "openapi.yaml", 8},
			{"DATA_ENTITY", "Order", "schema.prisma", 1},
			{"DATA_ENTITY", "orders", "schema.sql", 5},
		}},
	}
	for _, test := range tests {
		t.Run(test.fixture, func(t *testing.T) {
			registry := DefaultRegistry()
			first, firstCoverage, err := registry.ScanWorkspace(context.Background(), fixtureRoot(t, test.fixture), testRepository(), DefaultMaxSourceFileBytes)
			if err != nil {
				t.Fatal(err)
			}
			second, secondCoverage, err := registry.ScanWorkspace(context.Background(), fixtureRoot(t, test.fixture), testRepository(), DefaultMaxSourceFileBytes)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(first, second) || !reflect.DeepEqual(firstCoverage, secondCoverage) {
				t.Fatal("fixture extraction is not deterministic")
			}
			for _, expected := range test.want {
				assertGoldenLocation(t, first, expected)
			}
			for _, observation := range first {
				if len(observation.NormalizedDigest) != 64 || observation.Id != "observation:"+string(observation.NormalizedDigest) {
					t.Fatalf("invalid stable identity: %+v", observation)
				}
				if len(observation.EvidenceRefs) == 0 || len(observation.EvidenceRefs[0].Digest) != 64 {
					t.Fatalf("missing content-addressed evidence: %+v", observation)
				}
			}
		})
	}
}

func TestConservativeParsersDeclareDepthLimit(t *testing.T) {
	for _, fixture := range []string{"java-spring", "typescript-node"} {
		observations, coverage, err := DefaultRegistry().ScanWorkspace(context.Background(), fixtureRoot(t, fixture), testRepository(), DefaultMaxSourceFileBytes)
		if err != nil {
			t.Fatal(err)
		}
		limit := javaParserLimit
		if fixture == "typescript-node" {
			limit = typeScriptParserLimit
		}
		if !slices.Contains(coverage.CoverageGaps, coverageGap(sourcePathForFixture(fixture), limit)) {
			t.Fatalf("%s parser limit was not surfaced: %v", fixture, coverage.CoverageGaps)
		}
		found := false
		for _, observation := range observations {
			if slices.Contains(observation.CoverageGaps, limit) {
				found = true
			}
		}
		if !found {
			t.Fatalf("%s observations silently claimed full parser coverage", fixture)
		}
	}
}

func TestMalformedUnsupportedAndSecretEvidence(t *testing.T) {
	observations, coverage, err := DefaultRegistry().ScanWorkspace(context.Background(), fixtureRoot(t, "hostile-workspace"), testRepository(), DefaultMaxSourceFileBytes)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(observations)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "do-not-leak-this-value") {
		t.Fatal("secret leaked into observation payload or evidence")
	}
	if !strings.Contains(string(encoded), "[REDACTED]") {
		t.Fatal("redaction marker missing from evidence")
	}
	for _, want := range []string{
		"openapi-malformed.yaml:MALFORMED_API_CONTRACT",
		"unknown.xyz:UNSUPPORTED_SOURCE_TYPE",
	} {
		if !slices.Contains(coverage.CoverageGaps, want) {
			t.Errorf("missing coverage gap %q in %v", want, coverage.CoverageGaps)
		}
	}
}

func TestMalformedStructuredInputsBecomeCoverageGaps(t *testing.T) {
	tests := []struct {
		name      string
		extractor Extractor
		path      string
		contents  string
		wantGap   string
	}{
		{"openapi", ContractExtractor{}, "openapi.yaml", "openapi: [", "openapi.yaml:MALFORMED_API_CONTRACT"},
		{"go", GoExtractor{}, "broken.go", "package broken\nfunc {", "broken.go:GO_AST_PARSE_FAILED"},
		{"package-json", RepositoryExtractor{}, "package.json", "{not-json", "package.json:MALFORMED_PACKAGE_JSON"},
		{"configuration", ConfigExtractor{}, "config/application.yaml", "server: [", "config/application.yaml:CONFIGURATION_PARSE_FAILED"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			contents := []byte(test.contents)
			file := File{
				Meta:     FileMeta{Path: test.path, SizeBytes: int64(len(contents)), Digest: scancontract.Sha256(sha256Hex(contents))},
				Contents: contents, Repository: testRepository(), MaxExcerpt: 1024,
			}
			observations, coverage, err := test.extractor.Extract(context.Background(), file)
			if err != nil {
				t.Fatal(err)
			}
			if len(observations) != 0 || !slices.Contains(coverage.CoverageGaps, test.wantGap) {
				t.Fatalf("malformed input did not fail closed: observations=%v coverage=%+v", observations, coverage)
			}
		})
	}
}

func assertGoldenLocation(t *testing.T, observations []scancontract.SourceObservationV2, want goldenLocation) {
	t.Helper()
	for _, observation := range observations {
		symbol := ""
		if observation.Source.Symbol != nil {
			symbol = *observation.Source.Symbol
		}
		line := 0
		if observation.Source.LineStart != nil {
			line = *observation.Source.LineStart
		}
		if observation.ObservationType == want.Type && symbol == want.Symbol && observation.Source.Path == want.Path && line == want.Line {
			return
		}
	}
	t.Fatalf("missing golden observation %+v; got=%s", want, summarizeObservations(observations))
}

func summarizeObservations(observations []scancontract.SourceObservationV2) string {
	type summary struct {
		Type, Symbol, Path string
		Line               int
	}
	result := make([]summary, 0, len(observations))
	for _, observation := range observations {
		symbol, line := "", 0
		if observation.Source.Symbol != nil {
			symbol = *observation.Source.Symbol
		}
		if observation.Source.LineStart != nil {
			line = *observation.Source.LineStart
		}
		result = append(result, summary{observation.ObservationType, symbol, observation.Source.Path, line})
	}
	encoded, _ := json.Marshal(result)
	return string(encoded)
}

func sourcePathForFixture(fixture string) string {
	if fixture == "java-spring" {
		return "src/main/java/OrderController.java"
	}
	return "src/routes.ts"
}
