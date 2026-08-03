package extractors

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"path/filepath"
	"sort"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type RepositoryExtractor struct{}

func (RepositoryExtractor) ID() string      { return "repository-build-metadata" }
func (RepositoryExtractor) Version() string { return "1.0.0" }
func (RepositoryExtractor) Supports(meta FileMeta) bool {
	base := strings.ToLower(filepath.Base(meta.Path))
	return base == "package.json" || base == "go.mod" || base == "pom.xml" ||
		base == "build.gradle" || base == "build.gradle.kts" || base == "settings.gradle" ||
		base == "settings.gradle.kts" || base == "cargo.toml" || base == "pyproject.toml"
}

func (extractor RepositoryExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	base := strings.ToLower(filepath.Base(file.Meta.Path))
	var payload map[string]any
	parserID := "specforge-build-lexical"
	var gaps []string
	switch base {
	case "package.json":
		var manifest struct {
			Name            string            `json:"name"`
			Version         string            `json:"version"`
			PackageManager  string            `json:"packageManager"`
			Dependencies    map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
		}
		if err := json.Unmarshal(file.Contents, &manifest); err != nil {
			return nil, parserGap(file.Meta.Path, "MALFORMED_PACKAGE_JSON"), nil
		}
		parserID = "encoding/json"
		payload = map[string]any{
			"ecosystem": "node", "name": manifest.Name, "version": manifest.Version,
			"packageManager": manifest.PackageManager,
			"dependencies":   sortedDependencyNames(manifest.Dependencies, manifest.DevDependencies),
		}
	case "pom.xml":
		var pom struct {
			GroupID    string `xml:"groupId"`
			ArtifactID string `xml:"artifactId"`
			Version    string `xml:"version"`
			Deps       []struct {
				GroupID    string `xml:"groupId"`
				ArtifactID string `xml:"artifactId"`
			} `xml:"dependencies>dependency"`
		}
		if err := xml.Unmarshal(file.Contents, &pom); err != nil {
			return nil, parserGap(file.Meta.Path, "MALFORMED_POM_XML"), nil
		}
		deps := make([]string, 0, len(pom.Deps))
		for _, dep := range pom.Deps {
			deps = append(deps, dep.GroupID+":"+dep.ArtifactID)
		}
		sort.Strings(deps)
		parserID = "encoding/xml"
		payload = map[string]any{"ecosystem": "maven", "name": pom.GroupID + ":" + pom.ArtifactID, "version": pom.Version, "dependencies": deps}
	case "go.mod":
		module, dependencies := parseGoMod(string(file.Contents))
		payload = map[string]any{"ecosystem": "go", "name": module, "dependencies": dependencies}
		parserID = "specforge-gomod-structured"
	default:
		payload = map[string]any{"ecosystem": buildEcosystem(base), "file": file.Meta.Path}
		gaps = append(gaps, "BUILD_METADATA_CONSERVATIVE_LEXICAL")
	}
	lines := 1 + strings.Count(string(file.Contents), "\n")
	observation := makeObservation(file, observationSpec{
		ObservationType: "BUILD_COMPONENT", Layer: scancontract.ArchitectureLayerTech, Aspect: "build",
		Symbol: file.Meta.Path, LineStart: 1, LineEnd: lines,
		ParserID: parserID, ParserVersion: extractor.Version(), Payload: payload, CoverageGaps: gaps,
	})
	return []scancontract.SourceObservationV2{observation}, successfulDelta(file.Meta.Path, 1, gaps...), nil
}

func parseGoMod(contents string) (string, []string) {
	var module string
	var dependencies []string
	inRequire := false
	for _, raw := range strings.Split(contents, "\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "//", 2)[0])
		if strings.HasPrefix(line, "module ") {
			module = strings.TrimSpace(strings.TrimPrefix(line, "module "))
		}
		if line == "require (" {
			inRequire = true
			continue
		}
		if inRequire && line == ")" {
			inRequire = false
			continue
		}
		if strings.HasPrefix(line, "require ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "require "))
			fields := strings.Fields(line)
			if len(fields) > 0 {
				dependencies = append(dependencies, fields[0])
			}
		} else if inRequire {
			fields := strings.Fields(line)
			if len(fields) > 0 {
				dependencies = append(dependencies, fields[0])
			}
		}
	}
	return module, uniqueSorted(dependencies)
}

func sortedDependencyNames(groups ...map[string]string) []string {
	var names []string
	for _, group := range groups {
		for name := range group {
			names = append(names, name)
		}
	}
	return uniqueSorted(names)
}

func buildEcosystem(base string) string {
	switch {
	case strings.Contains(base, "gradle"):
		return "gradle"
	case base == "cargo.toml":
		return "rust"
	case base == "pyproject.toml":
		return "python"
	default:
		return "unknown"
	}
}
