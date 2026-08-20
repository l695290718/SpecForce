package nebula_test

import (
	"context"
	"strings"
	"testing"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/nebula"
	ngdb "github.com/vesoft-inc/nebula-go/v3"
	ngtypes "github.com/vesoft-inc/nebula-go/v3/nebula"
	graph "github.com/vesoft-inc/nebula-go/v3/nebula/graph"
)

func TestScopeKeyRoundTripsExactScope(t *testing.T) {
	t.Parallel()

	original := httpapi.Scope{
		EnterpriseID:         "huawei",
		ApplicationServiceID: "com.huawei.celon.desiner",
		ScopePath:            "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
	}

	decoded, err := httpapi.DecodeScopeKey(httpapi.EncodeScopeKey(original))
	if err != nil {
		t.Fatalf("decode scope key: %v", err)
	}
	if decoded != original {
		t.Fatalf("scope round trip mismatch: got %#v, want %#v", decoded, original)
	}
}

func TestOfficialClientOwnsEscapingForProjection(t *testing.T) {
	t.Parallel()

	executor := &recordingExecutor{}
	client := nebula.NewOfficialClient(executor, "specforge_graph")
	scope := httpapi.Scope{EnterpriseID: "huawei", ApplicationServiceID: "com.huawei.celon.desiner", ScopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"}
	_, err := client.Project(context.Background(), httpapi.ProjectionRequest{
		Scope: scope, GraphVersion: "7",
		Nodes: []httpapi.Node{{Scope: scope, NodeType: "api", LogicalID: `api"payment`, RootAssetType: "api", RootAssetID: "api-payment"}},
	})
	if err != nil {
		t.Fatalf("project: %v", err)
	}

	statements := strings.Join(executor.statements, "\n")
	if strings.Contains(statements, `api"payment`) {
		t.Fatalf("raw node value leaked into nGQL: %s", statements)
	}
	if !strings.Contains(statements, `api\"payment`) {
		t.Fatalf("escaped node value missing from nGQL: %s", statements)
	}
	if !strings.Contains(statements, "INSERT VERTEX") {
		t.Fatalf("expected typed projection statement, got: %s", statements)
	}
}

func TestOfficialClientConsumesNebulaV3ResultSet(t *testing.T) {
	t.Parallel()

	executor := &recordingExecutor{}
	client := nebula.NewOfficialClient(executor, "specforge_graph")

	health, err := client.Health(context.Background())
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	if !health.GraphSchemaReady {
		t.Fatal("expected graph schema to be ready")
	}
}

func TestOfficialClientHealthInitializesSchemaBeforeReadingTags(t *testing.T) {
	t.Parallel()

	executor := &recordingExecutor{}
	client := nebula.NewOfficialClient(executor, "specforge_graph")

	if _, err := client.Health(context.Background()); err != nil {
		t.Fatalf("health: %v", err)
	}

	if len(executor.statements) == 0 {
		t.Fatal("expected health to execute schema statements")
	}
	if !strings.HasPrefix(executor.statements[0], "CREATE SPACE IF NOT EXISTS") {
		t.Fatalf("health must initialize the graph space before using it, got first statement %q", executor.statements[0])
	}
	showTags := -1
	for index, statement := range executor.statements {
		if statement == "SHOW TAGS;" {
			showTags = index
			break
		}
	}
	if showTags < 0 {
		t.Fatalf("expected health to verify tags, got %v", executor.statements)
	}
	if showTags == 0 {
		t.Fatalf("health read tags before initializing schema: %v", executor.statements)
	}
}

func TestGenerationProjectionUsesGenerationVIDAndOrdinal(t *testing.T) {
	t.Parallel()

	scope := httpapi.Scope{EnterpriseID: "huawei", ApplicationServiceID: "com.huawei.celon.desiner", ScopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"}
	identity := &httpapi.ProjectionIdentity{BaselineID: "b1", ManifestID: "m1", GenerationID: "g1", SchemaVersion: "v1"}
	node := httpapi.Node{Scope: scope, Projection: identity, NodeType: "api", LogicalID: "api-payment", RootAssetType: "api", RootAssetID: "api-payment"}
	executor := &recordingExecutor{}
	client := nebula.NewOfficialClient(executor, "specforge_graph")
	receipt, err := client.Project(context.Background(), httpapi.ProjectionRequest{
		Scope: scope, GraphVersion: "8", Projection: identity,
		Nodes: []httpapi.Node{node},
		Edges: []httpapi.Edge{{ID: "edge-1", Code: "api_uses_model", Source: node, Target: node, ProjectionOrdinal: "42"}},
	})
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	if receipt.Projection == nil || receipt.Projection.GenerationID != "g1" {
		t.Fatalf("receipt did not echo projection identity: %#v", receipt.Projection)
	}
	statements := strings.Join(executor.statements, "\n")
	if !strings.Contains(statements, "@ 42:") {
		t.Fatalf("expected persisted projection ordinal, got: %s", statements)
	}
	if !strings.Contains(statements, ":generation:") {
		t.Fatalf("expected generation-qualified node key, got: %s", statements)
	}

	secondExecutor := &recordingExecutor{}
	secondClient := nebula.NewOfficialClient(secondExecutor, "specforge_graph")
	secondIdentity := &httpapi.ProjectionIdentity{BaselineID: "b1", ManifestID: "m1", GenerationID: "g2", SchemaVersion: "v1"}
	secondNode := node
	secondNode.Projection = secondIdentity
	if _, err := secondClient.Project(context.Background(), httpapi.ProjectionRequest{Scope: scope, GraphVersion: "9", Projection: secondIdentity, Nodes: []httpapi.Node{secondNode}}); err != nil {
		t.Fatalf("project second generation: %v", err)
	}
	if strings.Contains(statements, secondExecutor.statements[len(secondExecutor.statements)-2]) {
		t.Fatalf("expected different generation-qualified vertex statement")
	}
}

type recordingExecutor struct {
	statements []string
}

func (r *recordingExecutor) Execute(statement string) (*ngdb.ResultSet, error) {
	r.statements = append(r.statements, statement)
	return ngdb.GenResultSet(&graph.ExecutionResponse{ErrorCode: ngtypes.ErrorCode_SUCCEEDED})
}
