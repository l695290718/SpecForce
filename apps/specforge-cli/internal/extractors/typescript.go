package extractors

import (
	"context"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type TypeScriptExtractor struct{}

func (TypeScriptExtractor) ID() string      { return "typescript-node-conservative" }
func (TypeScriptExtractor) Version() string { return "1.0.0" }
func (TypeScriptExtractor) Supports(meta FileMeta) bool {
	ext := strings.ToLower(filepath.Ext(meta.Path))
	return (ext == ".ts" || ext == ".tsx" || ext == ".js" || ext == ".jsx") && !isTestPath(meta.Path)
}

const typeScriptParserLimit = "TYPESCRIPT_PARSER_DEPTH_CONSERVATIVE_LEXICAL"

var (
	typeScriptRoutePattern      = regexp.MustCompile(`(?m)\b(app|router|server)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*(["'` + "`" + `])([^"'` + "`" + `]+)["'` + "`" + `]`)
	typeScriptNestRoutePattern  = regexp.MustCompile(`(?m)@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*(["']?)([^"')\s]+)["']?\s*\)`)
	typeScriptSchemaPattern     = regexp.MustCompile(`(?m)(?:export\s+)?(?:const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:z|yup|Joi)\s*\.\s*object\s*\(|(?:interface|type|class)\s+([A-Za-z_$][A-Za-z0-9_$]*))`)
	typeScriptPublishPattern    = regexp.MustCompile(`(?m)\b([A-Za-z_$][A-Za-z0-9_$.]*)\s*\.\s*(emit|publish|send|produce)\s*\(`)
	typeScriptValidationPattern = regexp.MustCompile(`(?m)@(?:IsNotEmpty|IsString|IsInt|IsUUID|IsEmail|ValidateNested)\b`)
)

func (extractor TypeScriptExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	var observations []scancontract.SourceObservationV2
	for _, match := range typeScriptRoutePattern.FindAllSubmatchIndex(file.Contents, -1) {
		receiver, method, route := submatch(file.Contents, match, 2), submatch(file.Contents, match, 4), submatch(file.Contents, match, 8)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "HTTP_HANDLER", Layer: scancontract.ArchitectureLayerSys, Aspect: "application-service",
			Symbol: strings.ToUpper(method) + " " + route, LineStart: start, LineEnd: end,
			ParserID: "specforge-typescript-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"receiver": receiver, "method": strings.ToUpper(method), "path": route}, CoverageGaps: []string{typeScriptParserLimit},
		}))
	}
	for _, match := range typeScriptNestRoutePattern.FindAllSubmatchIndex(file.Contents, -1) {
		method := submatch(file.Contents, match, 2)
		path := submatch(file.Contents, match, 6)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "API_OPERATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "application-service",
			Symbol: strings.ToUpper(method) + " " + path, LineStart: start, LineEnd: end,
			ParserID: "specforge-typescript-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"framework": "nestjs", "method": strings.ToUpper(method), "path": path}, CoverageGaps: []string{typeScriptParserLimit},
		}))
	}
	for _, match := range typeScriptSchemaPattern.FindAllSubmatchIndex(file.Contents, -1) {
		name := submatch(file.Contents, match, 2)
		if name == "" {
			name = submatch(file.Contents, match, 4)
		}
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "DATA_SCHEMA", Layer: scancontract.ArchitectureLayerSys, Aspect: "data-model",
			Symbol: name, LineStart: start, LineEnd: end,
			ParserID: "specforge-typescript-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"name": name}, CoverageGaps: []string{typeScriptParserLimit},
		}))
	}
	for _, match := range typeScriptPublishPattern.FindAllSubmatchIndex(file.Contents, -1) {
		receiver, method := submatch(file.Contents, match, 2), submatch(file.Contents, match, 4)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "EVENT_PUBLICATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "event-flow",
			Symbol: receiver + "." + method, LineStart: start, LineEnd: end,
			ParserID: "specforge-typescript-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"receiver": receiver, "method": method}, CoverageGaps: []string{typeScriptParserLimit},
		}))
	}
	for _, match := range typeScriptValidationPattern.FindAllIndex(file.Contents, -1) {
		validator := strings.TrimSpace(string(file.Contents[match[0]:match[1]]))
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "BUSINESS_VALIDATION", Layer: scancontract.ArchitectureLayerBiz, Aspect: "business-rule",
			Symbol: validator, LineStart: start, LineEnd: end,
			ParserID: "specforge-typescript-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"validator": validator}, CoverageGaps: []string{typeScriptParserLimit},
		}))
	}
	sortObservations(observations)
	if len(observations) == 0 {
		return nil, successfulDelta(file.Meta.Path, 0, typeScriptParserLimit, "TYPESCRIPT_NO_SUPPORTED_CONSTRUCTS"), nil
	}
	return observations, successfulDelta(file.Meta.Path, len(observations), typeScriptParserLimit), nil
}
