package nebula_test

import (
	"context"
	"strings"
	"testing"

	graph "github.com/vesoft-inc/nebula-go/nebula/graph"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	"github.com/l695290718/specforge/apps/graph-gateway/internal/nebula"
)

func TestScopeKeyRoundTripsExactScope(t *testing.T) {
	t.Parallel()

	original := httpapi.Scope{
		EnterpriseID: "huawei",
		ApplicationServiceID: "com.huawei.celon.desiner",
		ScopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
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

type recordingExecutor struct {
	statements []string
}

func (r *recordingExecutor) Execute(statement string) (*graph.ExecutionResponse, error) {
	r.statements = append(r.statements, statement)
	return &graph.ExecutionResponse{ErrorCode: graph.ErrorCode_SUCCEEDED}, nil
}
