package nebula

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"
	"testing"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	ngdb "github.com/vesoft-inc/nebula-go/v3"
	ngtypes "github.com/vesoft-inc/nebula-go/v3/nebula"
	graph "github.com/vesoft-inc/nebula-go/v3/nebula/graph"
)

func TestProjectionLogsSafeNebulaFailureClassification(t *testing.T) {
	logger := &captureLogger{}
	failureResult, err := ngdb.GenResultSet(&graph.ExecutionResponse{
		ErrorCode: ngtypes.ErrorCode_E_EXECUTION_ERROR,
		ErrorMsg:  []byte("Wrong vertex id type: secret-scope-value"),
	})
	if err != nil {
		t.Fatalf("create failure result: %v", err)
	}
	executor := &failingStatementExecutor{
		failurePrefix: "INSERT VERTEX",
		result:        failureResult,
	}
	client := &OfficialClient{executor: executor, space: defaultSpace, logger: logger}
	scope := httpapi.Scope{
		EnterpriseID:         "secret-enterprise",
		ApplicationServiceID: "secret-service",
		ScopePath:            "secret-scope-value",
	}

	_, err = client.Project(context.Background(), httpapi.ProjectionRequest{
		Scope:        scope,
		GraphVersion: "7",
		Nodes: []httpapi.Node{{
			Scope:         scope,
			NodeType:      "api",
			LogicalID:     "secret-logical-id",
			RootAssetType: "api",
			RootAssetID:   "secret-root-id",
		}},
	})
	if err == nil {
		t.Fatal("expected projection failure")
	}

	diagnostic := logger.String()
	if !strings.Contains(diagnostic, "operation=node_upsert") {
		t.Fatalf("expected operation classification, got %q", diagnostic)
	}
	expectedCode := fmt.Sprintf("code=%d", failureResult.GetErrorCode())
	if !strings.Contains(diagnostic, expectedCode) {
		t.Fatalf("expected Nebula error code, got %q", diagnostic)
	}
	for _, secret := range []string{"INSERT VERTEX", "secret-scope-value", "secret-logical-id", "secret-root-id"} {
		if strings.Contains(diagnostic, secret) {
			t.Fatalf("diagnostic leaked %q: %s", secret, diagnostic)
		}
	}
}

func TestProjectionUsesBoundedStableVertexIDsForEnterpriseScopes(t *testing.T) {
	scope := httpapi.Scope{
		EnterpriseID:         "huawei",
		ApplicationServiceID: "com.huawei.celon.desiner",
		ScopePath:            "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
	}
	node := httpapi.Node{
		Scope:         scope,
		NodeType:      "dataModel",
		LogicalID:     "live-model",
		RootAssetType: "dataModel",
		RootAssetID:   "live-model",
	}
	fullKey := nodeKey(node)
	if len(fullKey) <= 256 {
		t.Fatalf("test fixture must exceed the Nebula VID limit, got %d bytes", len(fullKey))
	}
	expectedVID := fmt.Sprintf("n:%x", sha256.Sum256([]byte(fullKey)))

	statement := nodeStatement(node)
	if !strings.Contains(statement, "VALUES "+literal(expectedVID)+":(") {
		t.Fatalf("expected bounded hashed VID, got %s", statement)
	}
	if strings.Count(statement, literal(fullKey)) != 1 {
		t.Fatalf("full logical key must appear only as a node property, got %s", statement)
	}
}

type captureLogger struct {
	lines []string
}

func (l *captureLogger) Printf(format string, values ...any) {
	l.lines = append(l.lines, fmt.Sprintf(format, values...))
}

func (l *captureLogger) String() string {
	return strings.Join(l.lines, "\n")
}

type failingStatementExecutor struct {
	failurePrefix string
	result        *ngdb.ResultSet
}

func (e *failingStatementExecutor) Execute(statement string) (*ngdb.ResultSet, error) {
	if strings.HasPrefix(statement, e.failurePrefix) {
		return e.result, nil
	}
	result, err := ngdb.GenResultSet(&graph.ExecutionResponse{ErrorCode: ngtypes.ErrorCode_SUCCEEDED})
	return result, err
}
