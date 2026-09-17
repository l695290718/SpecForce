package extractors

import (
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestDefaultCatalogMatchesStaticRegistry(t *testing.T) {
	catalog := DefaultCatalog()
	if err := catalog.Verify(DefaultRegistry()); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Digest) != 64 {
		t.Fatalf("digest=%s", catalog.Digest)
	}
}

func TestCatalogPlansAllAssetFamilies(t *testing.T) {
	profile := scancontract.TechnologyProfile{Detections: []scancontract.TechnologyDetection{{Ecosystem: "typescript", Framework: "nestjs", VersionRange: "10.x", Confidence: 0.99, EvidenceRefs: []string{"manifest:package.json"}, Conflicts: []string{}}}}
	plan := DefaultCatalog().Plan(profile)
	if len(plan.AssetFamilies) != 16 || len(plan.Capabilities) != 16 {
		t.Fatalf("plan=%+v", plan)
	}
	if !plan.Complete || len(plan.Digest) != 64 {
		t.Fatalf("plan=%+v", plan)
	}
}
