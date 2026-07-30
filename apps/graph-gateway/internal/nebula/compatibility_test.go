package nebula_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/nebula"
)

func TestNebulaCompatibilityProjectsAndTraversesTwoHops(t *testing.T) {
	if os.Getenv("SPECFORGE_NEBULA_COMPATIBILITY") != "1" {
		t.Skip("set SPECFORGE_NEBULA_COMPATIBILITY=1 against the local Nebula service")
	}

	client, closeClient, err := nebula.Connect(env("SPECFORGE_NEBULA_ADDRESS", "127.0.0.1:9669"), env("SPECFORGE_NEBULA_USER", "root"), env("SPECFORGE_NEBULA_PASSWORD", "nebula"), env("SPECFORGE_NEBULA_SPACE", "specforge_graph"), 10*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer closeClient()

	scope := httpapi.Scope{EnterpriseID: "huawei", ApplicationServiceID: "com.huawei.celon.desiner", ScopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"}
	nodes := []httpapi.Node{
		{Scope: scope, NodeType: "api", LogicalID: "compat-api", RootAssetType: "api", RootAssetID: "compat-api"},
		{Scope: scope, NodeType: "dataModel", LogicalID: "compat-model", RootAssetType: "dataModel", RootAssetID: "compat-model"},
		{Scope: scope, NodeType: "businessRule", LogicalID: "compat-rule", RootAssetType: "businessRule", RootAssetID: "compat-rule"},
	}
	_, err = client.Project(context.Background(), httpapi.ProjectionRequest{
		Scope: scope, GraphVersion: "2", Nodes: nodes,
		Edges: []httpapi.Edge{
			{ID: "compat-api-model", Code: "USES", Source: nodes[0], Target: nodes[1], Strength: "strong", Confidence: 1, Version: "1"},
			{ID: "compat-model-rule", Code: "GOVERNS", Source: nodes[1], Target: nodes[2], Strength: "strong", Confidence: 1, Version: "2"},
		},
	})
	if err != nil {
		t.Fatalf("project compatibility graph: %v", err)
	}

	result, err := client.Traverse(context.Background(), httpapi.TraversalRequest{Scope: scope, StartNodes: nodes[:1], MaxDepth: 2, GraphVersion: "2"})
	if err != nil {
		t.Fatalf("traverse compatibility graph: %v", err)
	}
	if len(result.Nodes) < 3 {
		t.Fatalf("expected a two-hop traversal with three nodes, got %d", len(result.Nodes))
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
