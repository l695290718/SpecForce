package extractors

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type CapabilityDescriptor struct {
	ExtractorID string
	Version     string
	Framework   string
	AssetFamily []string
}

type Catalog struct {
	ContractVersion string
	Descriptors     []CapabilityDescriptor
	Digest          scancontract.Sha256
}

var assetFamilies = []string{"domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "serviceFeature", "functionalFeature", "adr", "proposal", "contextPack", "evidence", "typedRelationship"}

func DefaultCatalog() Catalog {
	descriptors := []CapabilityDescriptor{
		{ExtractorID: "repository-build-metadata", Version: "1.0.0", Framework: "repository", AssetFamily: []string{"evidence", "integration"}},
		{ExtractorID: "openapi-asyncapi-contracts", Version: "1.0.0", Framework: "openapi-asyncapi", AssetFamily: []string{"api", "event", "dataModel", "typedRelationship"}},
		{ExtractorID: "prisma-sql-schema", Version: "1.0.0", Framework: "sql", AssetFamily: []string{"dataModel", "typedRelationship"}},
		{ExtractorID: "java-spring-conservative", Version: "1.0.0", Framework: "java", AssetFamily: []string{"api", "dataModel", "event", "integration", "typedRelationship"}},
		{ExtractorID: "python-conservative", Version: "1.0.0", Framework: "python", AssetFamily: []string{"api", "dataModel", "businessRule", "event", "integration", "typedRelationship"}},
		{ExtractorID: "typescript-node-conservative", Version: "1.0.0", Framework: "typescript", AssetFamily: []string{"api", "dataModel", "event", "integration", "typedRelationship"}},
		{ExtractorID: "go-ast", Version: "1.0.0", Framework: "go", AssetFamily: []string{"api", "dataModel", "integration", "typedRelationship"}},
		{ExtractorID: "test-evidence", Version: "1.0.0", Framework: "operations", AssetFamily: []string{"quality", "evidence"}},
		{ExtractorID: "configuration-structured", Version: "1.0.0", Framework: "deployment", AssetFamily: []string{"integration", "quality", "observability", "typedRelationship"}},
		{ExtractorID: "deployment-metadata", Version: "1.0.0", Framework: "deployment", AssetFamily: []string{"integration", "quality", "observability", "typedRelationship"}},
		{ExtractorID: "observability-operational", Version: "1.0.0", Framework: "operations", AssetFamily: []string{"quality", "observability", "evidence", "typedRelationship"}},
		{ExtractorID: "documentation-sections", Version: "1.0.0", Framework: "documents", AssetFamily: []string{"adr", "proposal", "contextPack", "evidence"}},
	}
	sort.Slice(descriptors, func(i, j int) bool { return descriptors[i].ExtractorID < descriptors[j].ExtractorID })
	return Catalog{ContractVersion: "scan-contract/v2", Descriptors: descriptors, Digest: catalogDigest(descriptors)}
}

func (catalog Catalog) Verify(registry Registry) error {
	known := map[string]bool{}
	for _, id := range registry.IDs() {
		known[id] = true
	}
	for _, descriptor := range catalog.Descriptors {
		if !known[descriptor.ExtractorID] {
			return &CatalogError{Code: "EXTRACTOR_NOT_REGISTERED", ExtractorID: descriptor.ExtractorID}
		}
	}
	if catalog.ContractVersion != "scan-contract/v2" {
		return &CatalogError{Code: "EXTRACTOR_CATALOG_CONTRACT_UNSUPPORTED"}
	}
	if catalog.Digest != catalogDigest(catalog.Descriptors) {
		return &CatalogError{Code: "EXTRACTOR_CATALOG_DIGEST_INVALID"}
	}
	return nil
}

func (catalog Catalog) Plan(profile scancontract.TechnologyProfile) scancontract.AssetCoveragePlan {
	capabilities := make([]scancontract.AssetCapability, 0, len(assetFamilies))
	for _, family := range assetFamilies {
		state := scancontract.CapabilityCoverageStateNotApplicable
		reason := []string{"NO_APPLICABLE_TECHNOLOGY_EVIDENCE"}
		extractors := []string{}
		for _, detection := range profile.Detections {
			for _, descriptor := range catalog.Descriptors {
				if descriptor.Framework != detection.Ecosystem && descriptor.Framework != detection.Framework {
					continue
				}
				if contains(descriptor.AssetFamily, family) {
					state = scancontract.CapabilityCoverageStateFull
					reason = []string{}
					extractors = append(extractors, descriptor.ExtractorID)
				}
			}
		}
		capabilities = append(capabilities, scancontract.AssetCapability{AssetFamily: family, Framework: "repository", State: state, Required: state != scancontract.CapabilityCoverageStateNotApplicable, ReasonCodes: reason, ExtractorIds: unique(extractors)})
	}
	complete := true
	for _, capability := range capabilities {
		if capability.Required && capability.State == scancontract.CapabilityCoverageStateUnsupported {
			complete = false
		}
	}
	plan := scancontract.AssetCoveragePlan{AssetFamilies: append([]string(nil), assetFamilies...), Capabilities: capabilities, Complete: complete}
	plan.Digest = coverageDigest(plan)
	return plan
}

type CatalogError struct {
	Code        string
	ExtractorID string
}

func (e *CatalogError) Error() string {
	if e.ExtractorID == "" {
		return e.Code
	}
	return e.Code + ":" + e.ExtractorID
}

func catalogDigest(descriptors []CapabilityDescriptor) scancontract.Sha256 {
	encoded, _ := json.Marshal(descriptors)
	sum := sha256.Sum256(encoded)
	return scancontract.Sha256(hex.EncodeToString(sum[:]))
}
func coverageDigest(plan scancontract.AssetCoveragePlan) scancontract.Sha256 {
	plan.Digest = ""
	encoded, _ := json.Marshal(plan)
	sum := sha256.Sum256(encoded)
	return scancontract.Sha256(hex.EncodeToString(sum[:]))
}
func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
func unique(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}
