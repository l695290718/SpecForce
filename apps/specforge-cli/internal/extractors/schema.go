package extractors

import (
	"context"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type SchemaExtractor struct{}

func (SchemaExtractor) ID() string      { return "prisma-sql-schema" }
func (SchemaExtractor) Version() string { return "1.0.0" }
func (SchemaExtractor) Supports(meta FileMeta) bool {
	ext := strings.ToLower(filepath.Ext(meta.Path))
	return ext == ".prisma" || ext == ".sql"
}

var (
	prismaModelStart = regexp.MustCompile(`^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{`)
	sqlCreateTable   = regexp.MustCompile("(?is)\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?[\\\"`]?([A-Za-z_][A-Za-z0-9_.$-]*)[\\\"`]?\\s*\\((.*?)\\)\\s*;")
	sqlReference     = regexp.MustCompile(`(?i)REFERENCES\s+["` + "`" + `]?([A-Za-z_][A-Za-z0-9_.$-]*)`)
)

func (extractor SchemaExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	if strings.EqualFold(filepath.Ext(file.Meta.Path), ".prisma") {
		observations := extractor.extractPrisma(file)
		if len(observations) == 0 {
			return nil, parserGap(file.Meta.Path, "PRISMA_SCHEMA_HAS_NO_MODELS"), nil
		}
		return observations, successfulDelta(file.Meta.Path, len(observations)), nil
	}
	observations := extractor.extractSQL(file)
	if len(observations) == 0 {
		return nil, parserGap(file.Meta.Path, "SQL_SCHEMA_HAS_NO_CREATE_TABLE"), nil
	}
	return observations, successfulDelta(file.Meta.Path, len(observations), "SQL_PARSER_DEPTH_CONSERVATIVE_LEXICAL"), nil
}

func (extractor SchemaExtractor) extractPrisma(file File) []scancontract.SourceObservationV2 {
	lines := strings.Split(string(file.Contents), "\n")
	var observations []scancontract.SourceObservationV2
	for index := 0; index < len(lines); index++ {
		match := prismaModelStart.FindStringSubmatch(lines[index])
		if len(match) == 0 {
			continue
		}
		name := match[1]
		start, end := index+1, index+1
		depth := strings.Count(lines[index], "{") - strings.Count(lines[index], "}")
		var fields, keys, relations []string
		for end < len(lines) && depth > 0 {
			line := strings.TrimSpace(lines[end])
			depth += strings.Count(line, "{") - strings.Count(line, "}")
			if line != "" && !strings.HasPrefix(line, "//") && line != "}" && !strings.HasPrefix(line, "@@") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					fields = append(fields, parts[0])
					if strings.Contains(line, "@id") || strings.Contains(line, "@unique") {
						keys = append(keys, parts[0])
					}
					if strings.Contains(line, "@relation") {
						relations = append(relations, parts[0])
					}
				}
			}
			end++
		}
		if depth != 0 {
			continue
		}
		observation := makeObservation(file, observationSpec{
			ObservationType: "DATA_ENTITY", Layer: scancontract.ArchitectureLayerSys, Aspect: "data-model",
			Symbol: name, LineStart: start, LineEnd: end,
			ParserID: "specforge-prisma-structured", ParserVersion: extractor.Version(),
			Payload: map[string]any{"name": name, "fields": uniqueSorted(fields), "keys": uniqueSorted(keys), "relations": uniqueSorted(relations)},
		})
		observations = append(observations, observation)
		index = end - 1
	}
	return observations
}

func (extractor SchemaExtractor) extractSQL(file File) []scancontract.SourceObservationV2 {
	matches := sqlCreateTable.FindAllSubmatchIndex(file.Contents, -1)
	var observations []scancontract.SourceObservationV2
	for _, match := range matches {
		if len(match) < 6 {
			continue
		}
		name := string(file.Contents[match[2]:match[3]])
		body := string(file.Contents[match[4]:match[5]])
		var references []string
		for _, reference := range sqlReference.FindAllStringSubmatch(body, -1) {
			if len(reference) > 1 {
				references = append(references, reference[1])
			}
		}
		sort.Strings(references)
		start := lineForOffset(file.Contents, match[0])
		end := lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "DATA_ENTITY", Layer: scancontract.ArchitectureLayerSys, Aspect: "data-model",
			Symbol: name, LineStart: start, LineEnd: end,
			ParserID: "specforge-sql-conservative", ParserVersion: extractor.Version(),
			Payload:      map[string]any{"name": name, "references": uniqueSorted(references)},
			CoverageGaps: []string{"SQL_PARSER_DEPTH_CONSERVATIVE_LEXICAL"},
		}))
	}
	return observations
}
