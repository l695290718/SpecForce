package extractors

import (
	"context"
	"encoding/json"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"gopkg.in/yaml.v3"
)

type TestExtractor struct{}

func (TestExtractor) ID() string                  { return "test-evidence" }
func (TestExtractor) Version() string             { return "1.0.0" }
func (TestExtractor) Supports(meta FileMeta) bool { return isTestPath(meta.Path) }
func (extractor TestExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	pattern := regexp.MustCompile(`(?m)\b(?:func\s+Test[A-Za-z0-9_]*|(?:it|test|describe)\s*\(|@Test\b)`)
	count := len(pattern.FindAll(file.Contents, -1))
	lines := 1 + strings.Count(string(file.Contents), "\n")
	observation := makeObservation(file, observationSpec{
		ObservationType: "TEST_EVIDENCE", Layer: scancontract.ArchitectureLayerTech, Aspect: "verification",
		Symbol: file.Meta.Path, LineStart: 1, LineEnd: lines,
		ParserID: "specforge-test-lexical", ParserVersion: extractor.Version(),
		Payload: map[string]any{"testConstructCount": count}, Warnings: []string{"TEST_EXECUTION_NOT_PERFORMED"},
	})
	return []scancontract.SourceObservationV2{observation}, successfulDelta(file.Meta.Path, 1), nil
}

type ConfigExtractor struct{}

func (ConfigExtractor) ID() string      { return "configuration-structured" }
func (ConfigExtractor) Version() string { return "1.0.0" }
func (ConfigExtractor) Supports(meta FileMeta) bool {
	path := strings.ToLower(filepath.ToSlash(meta.Path))
	base, ext := filepath.Base(path), filepath.Ext(path)
	if isContractPath(path) || isDeploymentPath(path) || base == "package.json" || base == "tsconfig.json" {
		return false
	}
	return strings.Contains(path, "/config/") || strings.HasPrefix(base, "application.") || strings.HasPrefix(base, "appsettings.") ||
		ext == ".properties" || ext == ".conf" || ext == ".ini"
}
func (extractor ConfigExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	keys, parserID, ok := configurationKeys(file)
	if !ok {
		return nil, parserGap(file.Meta.Path, "CONFIGURATION_PARSE_FAILED"), nil
	}
	lines := 1 + strings.Count(string(file.Contents), "\n")
	observation := makeObservation(file, observationSpec{
		ObservationType: "CONFIGURATION_SURFACE", Layer: scancontract.ArchitectureLayerTech, Aspect: "configuration",
		Symbol: file.Meta.Path, LineStart: 1, LineEnd: lines,
		ParserID: parserID, ParserVersion: extractor.Version(), Payload: map[string]any{"topLevelKeys": keys},
	})
	return []scancontract.SourceObservationV2{observation}, successfulDelta(file.Meta.Path, 1), nil
}

type DeploymentExtractor struct{}

func (DeploymentExtractor) ID() string      { return "deployment-metadata" }
func (DeploymentExtractor) Version() string { return "1.0.0" }
func (DeploymentExtractor) Supports(meta FileMeta) bool {
	return isDeploymentPath(strings.ToLower(filepath.ToSlash(meta.Path)))
}
func (extractor DeploymentExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	kind := deploymentKind(file.Meta.Path)
	keys := []string{}
	parserID := "specforge-deployment-lexical"
	ext := strings.ToLower(filepath.Ext(file.Meta.Path))
	if ext == ".yaml" || ext == ".yml" || ext == ".json" {
		parsedKeys, parsedID, ok := configurationKeys(file)
		if !ok {
			return nil, parserGap(file.Meta.Path, "DEPLOYMENT_DOCUMENT_PARSE_FAILED"), nil
		}
		keys, parserID = parsedKeys, parsedID
	}
	lines := 1 + strings.Count(string(file.Contents), "\n")
	observation := makeObservation(file, observationSpec{
		ObservationType: "DEPLOYMENT_UNIT", Layer: scancontract.ArchitectureLayerTech, Aspect: "deployment",
		Symbol: file.Meta.Path, LineStart: 1, LineEnd: lines,
		ParserID: parserID, ParserVersion: extractor.Version(), Payload: map[string]any{"kind": kind, "topLevelKeys": keys},
	})
	return []scancontract.SourceObservationV2{observation}, successfulDelta(file.Meta.Path, 1), nil
}

type DocumentationExtractor struct{}

func (DocumentationExtractor) ID() string      { return "documentation-sections" }
func (DocumentationExtractor) Version() string { return "1.0.0" }
func (DocumentationExtractor) Supports(meta FileMeta) bool {
	ext := strings.ToLower(filepath.Ext(meta.Path))
	return ext == ".md" || ext == ".markdown" || ext == ".adoc" || ext == ".rst"
}
func (extractor DocumentationExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	lines := strings.Split(string(file.Contents), "\n")
	var observations []scancontract.SourceObservationV2
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "#") {
			continue
		}
		heading := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
		if heading == "" {
			continue
		}
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "DOCUMENTATION_SECTION", Layer: scancontract.ArchitectureLayerBiz, Aspect: "documented-intent",
			Symbol: heading, LineStart: index + 1, LineEnd: index + 1,
			ParserID: "specforge-markup-headings", ParserVersion: extractor.Version(), Payload: map[string]any{"heading": heading},
		}))
	}
	if len(observations) == 0 {
		return nil, successfulDelta(file.Meta.Path, 0, "DOCUMENTATION_HAS_NO_RECOGNIZED_HEADINGS"), nil
	}
	return observations, successfulDelta(file.Meta.Path, len(observations)), nil
}

func configurationKeys(file File) ([]string, string, bool) {
	ext := strings.ToLower(filepath.Ext(file.Meta.Path))
	switch ext {
	case ".yaml", ".yml":
		var document yaml.Node
		if err := yaml.Unmarshal(file.Contents, &document); err != nil {
			return nil, "yaml.v3", false
		}
		root := yamlDocumentRoot(&document)
		if root == nil || root.Kind != yaml.MappingNode {
			return []string{}, "yaml.v3", true
		}
		keys := make([]string, 0, len(root.Content)/2)
		for index := 0; index+1 < len(root.Content); index += 2 {
			keys = append(keys, root.Content[index].Value)
		}
		return uniqueSorted(keys), "yaml.v3", true
	case ".json":
		var value map[string]json.RawMessage
		if err := json.Unmarshal(file.Contents, &value); err != nil {
			return nil, "encoding/json", false
		}
		keys := make([]string, 0, len(value))
		for key := range value {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return keys, "encoding/json", true
	default:
		keys := []string{}
		for _, line := range strings.Split(string(file.Contents), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
				continue
			}
			if index := strings.IndexAny(line, "=:"); index > 0 {
				keys = append(keys, strings.TrimSpace(line[:index]))
			}
		}
		return uniqueSorted(keys), "specforge-config-lexical", true
	}
}

func isTestPath(path string) bool {
	path = strings.ToLower(filepath.ToSlash(path))
	base := filepath.Base(path)
	return strings.HasSuffix(base, "_test.go") || strings.Contains(base, ".test.") || strings.Contains(base, ".spec.") ||
		strings.Contains(path, "/test/") || strings.Contains(path, "/tests/") || strings.Contains(path, "/src/test/")
}

func isContractPath(path string) bool {
	base := filepath.Base(path)
	return strings.Contains(base, "openapi") || strings.Contains(base, "swagger") || strings.Contains(base, "asyncapi") ||
		strings.Contains(path, "/openapi/") || strings.Contains(path, "/asyncapi/")
}

func isDeploymentPath(path string) bool {
	path = strings.ToLower(filepath.ToSlash(path))
	base := filepath.Base(path)
	return base == "dockerfile" || strings.HasPrefix(base, "docker-compose") || base == "compose.yaml" || base == "compose.yml" ||
		base == "chart.yaml" || strings.HasSuffix(base, ".tf") || strings.Contains(path, "/k8s/") || strings.Contains(path, "/kubernetes/") ||
		strings.Contains(path, "/helm/") || strings.Contains(path, "/deploy/") || strings.Contains(path, "/.github/workflows/") || base == ".gitlab-ci.yml"
}

func deploymentKind(path string) string {
	path = strings.ToLower(filepath.ToSlash(path))
	base := filepath.Base(path)
	switch {
	case base == "dockerfile":
		return "container-image"
	case strings.Contains(base, "compose"):
		return "container-compose"
	case strings.Contains(path, "k8s") || strings.Contains(path, "kubernetes"):
		return "kubernetes"
	case strings.Contains(path, "helm") || base == "chart.yaml":
		return "helm"
	case strings.HasSuffix(base, ".tf"):
		return "terraform"
	case strings.Contains(path, "workflows") || base == ".gitlab-ci.yml":
		return "ci-pipeline"
	default:
		return "deployment"
	}
}
