package technology

import (
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

func TestDetectsNestAndPrismaWithEvidence(t *testing.T) {
	files := []scanner.FileMeta{{Path: "package.json", SizeBytes: 1}, {Path: "prisma/schema.prisma", SizeBytes: 1}}
	contents := map[string][]byte{"package.json": []byte(`{"dependencies":{"@nestjs/core":"10.4.0","@prisma/client":"6.1.0"}}`), "prisma/schema.prisma": []byte("model Order { id String @id }")}
	profile, err := Detect(files, func(path string) ([]byte, error) { return contents[path], nil }, nil)
	if err != nil {
		t.Fatal(err)
	}
	assertDetection(t, profile, "typescript", "nestjs", "10.4.0")
	assertDetection(t, profile, "typescript", "prisma", "6.1.0")
	if len(profile.Digest) != 64 {
		t.Fatalf("digest=%s", profile.Digest)
	}
}

func TestConflictingHintIsReportedNotForced(t *testing.T) {
	profile, err := Detect([]scanner.FileMeta{{Path: "go.mod", SizeBytes: 1}}, func(string) ([]byte, error) {
		return []byte("module example\nrequire github.com/gin-gonic/gin v1.10.0"), nil
	}, []string{"echo"})
	if err != nil {
		t.Fatal(err)
	}
	if !contains(profile.Conflicts, "FRAMEWORK_HINT_CONTRADICTS_EVIDENCE:echo") {
		t.Fatalf("conflicts=%v", profile.Conflicts)
	}
}

func assertDetection(t *testing.T, profile scancontract.TechnologyProfile, ecosystem, framework, version string) {
	t.Helper()
	for _, item := range profile.Detections {
		if item.Ecosystem == ecosystem && item.Framework == framework && item.VersionRange == version {
			return
		}
	}
	t.Fatalf("detection %s/%s/%s not found: %+v", ecosystem, framework, version, profile.Detections)
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
