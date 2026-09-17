package extractors

import (
	"context"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type PythonExtractor struct{}

func (PythonExtractor) ID() string      { return "python-conservative" }
func (PythonExtractor) Version() string { return "1.0.0" }
func (PythonExtractor) Supports(meta FileMeta) bool {
	return strings.EqualFold(filepath.Ext(meta.Path), ".py") && !isTestPath(meta.Path)
}

const pythonParserLimit = "PYTHON_PARSER_DEPTH_CONSERVATIVE_LEXICAL"

var (
	pythonRoutePattern      = regexp.MustCompile(`(?m)^\s*@(?:app|router|api_router)\.(get|post|put|delete|patch|options|head)\(\s*["']([^"']+)["']`)
	pythonEntityPattern     = regexp.MustCompile(`(?m)^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*(?:BaseModel|DeclarativeBase|Model|models\.Model)[^)]*)\)`)
	pythonValidationPattern = regexp.MustCompile(`(?m)^\s*@(?:validator|field_validator|validates)\s*\(([^)]*)\)`)
	pythonTaskPattern       = regexp.MustCompile(`(?m)^\s*@(?:app\.)?(?:task|shared_task|celery\.task)\b`)
	pythonQueryPattern      = regexp.MustCompile(`(?m)\b(?:session|db|connection|cursor)\.(?:query|execute|scalars?)\s*\(`)
	pythonDependencyPattern = regexp.MustCompile(`(?m)\b(?:requests|httpx)\.(?:get|post|put|delete|patch|request)\s*\(`)
)

func (extractor PythonExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	var observations []scancontract.SourceObservationV2
	for _, match := range pythonRoutePattern.FindAllSubmatchIndex(file.Contents, -1) {
		method, path := submatch(file.Contents, match, 2), submatch(file.Contents, match, 4)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "API_OPERATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "application-service",
			Symbol: strings.ToUpper(method) + " " + path, LineStart: start, LineEnd: end,
			ParserID: "specforge-python-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"framework": "python-web", "method": strings.ToUpper(method), "path": path}, CoverageGaps: []string{pythonParserLimit},
		}))
	}
	for _, match := range pythonEntityPattern.FindAllSubmatchIndex(file.Contents, -1) {
		name, base := submatch(file.Contents, match, 2), submatch(file.Contents, match, 4)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "DATA_ENTITY", Layer: scancontract.ArchitectureLayerSys, Aspect: "data-model",
			Symbol: name, LineStart: start, LineEnd: end,
			ParserID: "specforge-python-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"framework": "python-model", "name": name, "base": strings.TrimSpace(base)}, CoverageGaps: []string{pythonParserLimit},
		}))
	}
	for _, match := range pythonValidationPattern.FindAllSubmatchIndex(file.Contents, -1) {
		name := strings.TrimSpace(submatch(file.Contents, match, 2))
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "BUSINESS_VALIDATION", Layer: scancontract.ArchitectureLayerBiz, Aspect: "business-rule",
			Symbol: name, LineStart: start, LineEnd: end,
			ParserID: "specforge-python-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"validator": name}, CoverageGaps: []string{pythonParserLimit},
		}))
	}
	for _, match := range pythonTaskPattern.FindAllIndex(file.Contents, -1) {
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "ASYNC_TASK", Layer: scancontract.ArchitectureLayerSys, Aspect: "async-processing",
			Symbol: "task", LineStart: start, LineEnd: end,
			ParserID: "specforge-python-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"framework": "celery"}, CoverageGaps: []string{pythonParserLimit},
		}))
	}
	for _, match := range pythonQueryPattern.FindAllIndex(file.Contents, -1) {
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "SQL_QUERY", Layer: scancontract.ArchitectureLayerTech, Aspect: "data-access",
			Symbol: "database-query", LineStart: start, LineEnd: end,
			ParserID: "specforge-python-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"framework": "python-database"}, CoverageGaps: []string{pythonParserLimit},
		}))
	}
	for _, match := range pythonDependencyPattern.FindAllIndex(file.Contents, -1) {
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "SERVICE_DEPENDENCY", Layer: scancontract.ArchitectureLayerTech, Aspect: "outbound-integration",
			Symbol: "http-client", LineStart: start, LineEnd: end,
			ParserID: "specforge-python-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"client": "requests-or-httpx"}, CoverageGaps: []string{pythonParserLimit},
		}))
	}
	sortObservations(observations)
	if len(observations) == 0 {
		return nil, successfulDelta(file.Meta.Path, 0, pythonParserLimit, "PYTHON_NO_SUPPORTED_CONSTRUCTS"), nil
	}
	return observations, successfulDelta(file.Meta.Path, len(observations), pythonParserLimit), nil
}
