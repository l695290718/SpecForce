package extractors

import (
	"context"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type JavaExtractor struct{}

func (JavaExtractor) ID() string      { return "java-spring-conservative" }
func (JavaExtractor) Version() string { return "1.0.0" }
func (JavaExtractor) Supports(meta FileMeta) bool {
	return strings.EqualFold(filepath.Ext(meta.Path), ".java") && !isTestPath(meta.Path)
}

const javaParserLimit = "JAVA_PARSER_DEPTH_CONSERVATIVE_LEXICAL"

var (
	javaClassPattern   = regexp.MustCompile(`(?m)(?:@(RestController|Controller|Service|Component|Repository|Entity)\b[^\n]*\n\s*)*(?:public\s+)?(?:final\s+)?(?:class|record|interface)\s+([A-Za-z_][A-Za-z0-9_]*)`)
	javaRoutePattern   = regexp.MustCompile(`(?m)@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\(([^\n)]*)\))?\s*\n\s*(?:public|protected|private)?\s*[A-Za-z0-9_<>,.?\[\] ]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	javaPublishPattern = regexp.MustCompile(`(?m)([A-Za-z_][A-Za-z0-9_.]*)\.(publishEvent|publish|send|emit)\s*\(`)
)

func (extractor JavaExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	var observations []scancontract.SourceObservationV2
	for _, match := range javaClassPattern.FindAllSubmatchIndex(file.Contents, -1) {
		annotation := submatch(file.Contents, match, 2)
		name := submatch(file.Contents, match, 4)
		observationType := "CODE_TYPE"
		layer, aspect := scancontract.ArchitectureLayerTech, "implementation-structure"
		if annotation == "Entity" {
			observationType, layer, aspect = "DATA_ENTITY", scancontract.ArchitectureLayerSys, "data-model"
		} else if annotation == "RestController" || annotation == "Controller" {
			observationType, layer, aspect = "HTTP_CONTROLLER", scancontract.ArchitectureLayerSys, "application-service"
		}
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: observationType, Layer: layer, Aspect: aspect, Symbol: name,
			LineStart: start, LineEnd: end, ParserID: "specforge-java-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"name": name, "springStereotype": annotation}, CoverageGaps: []string{javaParserLimit},
		}))
	}
	for _, match := range javaRoutePattern.FindAllSubmatchIndex(file.Contents, -1) {
		annotation := submatch(file.Contents, match, 2)
		route := strings.TrimSpace(submatch(file.Contents, match, 4))
		methodName := submatch(file.Contents, match, 6)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "HTTP_HANDLER", Layer: scancontract.ArchitectureLayerSys, Aspect: "application-service",
			Symbol: methodName, LineStart: start, LineEnd: end,
			ParserID: "specforge-java-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"annotation": annotation, "routeExpression": route, "method": methodName}, CoverageGaps: []string{javaParserLimit},
		}))
	}
	for _, match := range javaPublishPattern.FindAllSubmatchIndex(file.Contents, -1) {
		receiver, method := submatch(file.Contents, match, 2), submatch(file.Contents, match, 4)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "EVENT_PUBLICATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "event-flow",
			Symbol: receiver + "." + method, LineStart: start, LineEnd: end,
			ParserID: "specforge-java-conservative", ParserVersion: extractor.Version(),
			Payload: map[string]any{"receiver": receiver, "method": method}, CoverageGaps: []string{javaParserLimit},
		}))
	}
	sortObservations(observations)
	if len(observations) == 0 {
		return nil, successfulDelta(file.Meta.Path, 0, javaParserLimit, "JAVA_NO_SUPPORTED_CONSTRUCTS"), nil
	}
	return observations, successfulDelta(file.Meta.Path, len(observations), javaParserLimit), nil
}

func submatch(contents []byte, match []int, pairIndex int) string {
	if pairIndex+1 >= len(match) || match[pairIndex] < 0 || match[pairIndex+1] < match[pairIndex] {
		return ""
	}
	return string(contents[match[pairIndex]:match[pairIndex+1]])
}
