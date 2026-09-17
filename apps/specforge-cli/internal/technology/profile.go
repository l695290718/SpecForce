package technology

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

type ReadFile func(path string) ([]byte, error)

func Detect(files []scanner.FileMeta, readFile ReadFile, hints []string) (scancontract.TechnologyProfile, error) {
	detections := make([]scancontract.TechnologyDetection, 0)
	conflicts := make([]string, 0)
	for _, file := range files {
		contents, err := readFile(file.Path)
		if err != nil {
			continue
		}
		base := strings.ToLower(file.Path)
		switch {
		case strings.HasSuffix(base, "package.json"):
			var manifest struct {
				Dependencies    map[string]string `json:"dependencies"`
				DevDependencies map[string]string `json:"devDependencies"`
			}
			if err := json.Unmarshal(contents, &manifest); err != nil {
				return scancontract.TechnologyProfile{}, fmt.Errorf("TECHNOLOGY_MANIFEST_INVALID:%s", file.Path)
			}
			dependencies := mergeDependencies(manifest.Dependencies, manifest.DevDependencies)
			for _, framework := range []struct {
				ecosystem, name string
				coordinates     []string
			}{
				{"typescript", "nestjs", []string{"@nestjs/core"}},
				{"typescript", "express", []string{"express"}},
				{"typescript", "fastify", []string{"fastify"}},
				{"typescript", "prisma", []string{"prisma", "@prisma/client"}},
				{"typescript", "typeorm", []string{"typeorm"}},
				{"typescript", "sequelize", []string{"sequelize"}},
				{"typescript", "mongoose", []string{"mongoose"}},
				{"typescript", "kafkajs", []string{"kafkajs"}},
			} {
				for _, coordinate := range framework.coordinates {
					if version, ok := dependencies[coordinate]; ok {
						detections = append(detections, detection(framework.ecosystem, framework.name, version, file.Path, coordinate))
						break
					}
				}
			}
		case strings.HasSuffix(base, "go.mod"):
			for _, line := range strings.Split(string(contents), "\n") {
				fields := strings.Fields(strings.TrimSpace(strings.SplitN(line, "//", 2)[0]))
				if len(fields) < 2 || (fields[0] != "require" && !strings.Contains(line, "github.com/")) {
					continue
				}
				coordinate := fields[1]
				name := "go-module"
				switch {
				case strings.Contains(coordinate, "/gin-gonic/gin"):
					name = "gin"
				case strings.Contains(coordinate, "/labstack/echo"):
					name = "echo"
				case strings.Contains(coordinate, "/go-gorm/gorm"):
					name = "gorm"
				}
				version := "unknown"
				if len(fields) > 2 {
					version = fields[2]
				}
				detections = append(detections, detection("go", name, version, file.Path, coordinate))
			}
		case strings.HasSuffix(base, "pom.xml") || strings.HasSuffix(base, "build.gradle") || strings.HasSuffix(base, "build.gradle.kts"):
			text := strings.ToLower(string(contents))
			for _, framework := range []struct{ name, marker string }{
				{"spring-mvc", "spring-web"}, {"jpa", "spring-data-jpa"}, {"hibernate", "hibernate-core"}, {"mybatis", "mybatis"}, {"kafka", "spring-kafka"}, {"rabbitmq", "amqp"},
			} {
				if strings.Contains(text, framework.marker) {
					detections = append(detections, detection("java", framework.name, "declared", file.Path, framework.marker))
				}
			}
		case strings.HasSuffix(base, "pyproject.toml") || strings.HasSuffix(base, "requirements.txt"):
			text := strings.ToLower(string(contents))
			for _, framework := range []struct{ name, marker string }{
				{"fastapi", "fastapi"}, {"django", "django"}, {"flask", "flask"}, {"sqlalchemy", "sqlalchemy"}, {"celery", "celery"},
			} {
				if strings.Contains(text, framework.marker) {
					detections = append(detections, detection("python", framework.name, "declared", file.Path, framework.marker))
				}
			}
		}
	}
	for _, hint := range hints {
		if !hasFramework(detections, strings.ToLower(hint)) {
			conflicts = append(conflicts, "FRAMEWORK_HINT_CONTRADICTS_EVIDENCE:"+strings.ToLower(hint))
		}
	}
	sort.Slice(detections, func(i, j int) bool {
		left, right := detections[i], detections[j]
		if left.Ecosystem != right.Ecosystem {
			return left.Ecosystem < right.Ecosystem
		}
		if left.Framework != right.Framework {
			return left.Framework < right.Framework
		}
		return left.EvidenceRefs[0] < right.EvidenceRefs[0]
	})
	conflicts = unique(conflicts)
	profile := scancontract.TechnologyProfile{Detections: detections, Conflicts: conflicts}
	encoded, _ := json.Marshal(profileForDigest(profile))
	sum := sha256.Sum256(encoded)
	profile.Digest = scancontract.Sha256(hex.EncodeToString(sum[:]))
	return profile, nil
}

func detection(ecosystem, framework, version, path, coordinate string) scancontract.TechnologyDetection {
	return scancontract.TechnologyDetection{Ecosystem: ecosystem, Framework: framework, VersionRange: version, Confidence: 0.95, EvidenceRefs: []string{"manifest:" + path + ":" + coordinate}, Conflicts: []string{}}
}

func profileForDigest(profile scancontract.TechnologyProfile) scancontract.TechnologyProfile {
	profile.Digest = ""
	return profile
}

func mergeDependencies(groups ...map[string]string) map[string]string {
	result := map[string]string{}
	for _, group := range groups {
		for key, value := range group {
			result[key] = value
		}
	}
	return result
}

func hasFramework(detections []scancontract.TechnologyDetection, framework string) bool {
	for _, item := range detections {
		if item.Framework == framework {
			return true
		}
	}
	return false
}

func unique(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
