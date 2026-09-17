package extractors

import (
	"context"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type ObservabilityExtractor struct{}

func (ObservabilityExtractor) ID() string      { return "observability-operational" }
func (ObservabilityExtractor) Version() string { return "1.0.0" }
func (ObservabilityExtractor) Supports(meta FileMeta) bool {
	path := strings.ToLower(filepath.ToSlash(meta.Path))
	base := filepath.Base(path)
	return strings.Contains(path, "/observability/") || strings.Contains(path, "/monitoring/") ||
		base == "prometheus.yml" || base == "prometheus.yaml" || strings.HasSuffix(base, ".prom") ||
		strings.HasSuffix(base, ".otel.yaml") || strings.HasSuffix(base, ".otel.yml")
}

var (
	alertPattern  = regexp.MustCompile(`(?m)^\s*-?\s*alert\s*:\s*([A-Za-z_][A-Za-z0-9_.-]*)`)
	recordPattern = regexp.MustCompile(`(?m)^\s*-?\s*record\s*:\s*([A-Za-z_][A-Za-z0-9_.-]*)`)
	telemetryWord = regexp.MustCompile(`(?i)\b(?:tracer|meter|span|otel|opentelemetry|structured\s+log|logger)\b`)
)

func (extractor ObservabilityExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	var observations []scancontract.SourceObservationV2
	for _, match := range alertPattern.FindAllSubmatchIndex(file.Contents, -1) {
		observations = append(observations, extractor.observation(file, "ALERT_RULE", "alert", submatch(file.Contents, match, 2), match[0], match[1]))
	}
	for _, match := range recordPattern.FindAllSubmatchIndex(file.Contents, -1) {
		observations = append(observations, extractor.observation(file, "METRIC_RECORDING_RULE", "metric", submatch(file.Contents, match, 2), match[0], match[1]))
	}
	for _, match := range telemetryWord.FindAllIndex(file.Contents, -1) {
		observations = append(observations, extractor.observation(file, "OBSERVABILITY_SIGNAL", "telemetry", strings.ToLower(string(file.Contents[match[0]:match[1]])), match[0], match[1]))
	}
	sortObservations(observations)
	if len(observations) == 0 {
		return nil, successfulDelta(file.Meta.Path, 0, "OBSERVABILITY_NO_RECOGNIZED_SIGNALS"), nil
	}
	return observations, successfulDelta(file.Meta.Path, len(observations)), nil
}

func (extractor ObservabilityExtractor) observation(file File, observationType, aspect, symbol string, startOffset, endOffset int) scancontract.SourceObservationV2 {
	start, end := lineForOffset(file.Contents, startOffset), lineForOffset(file.Contents, endOffset)
	return makeObservation(file, observationSpec{
		ObservationType: observationType, Layer: scancontract.ArchitectureLayerTech, Aspect: aspect,
		Symbol: symbol, LineStart: start, LineEnd: end,
		ParserID: "specforge-observability-lexical", ParserVersion: extractor.Version(),
		Payload: map[string]any{"signal": symbol},
	})
}
