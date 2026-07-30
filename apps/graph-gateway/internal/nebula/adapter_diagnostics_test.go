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

func TestTraverseMapsReturnedRelationshipEvidence(t *testing.T) {
	scope := httpapi.Scope{
		EnterpriseID:         "huawei",
		ApplicationServiceID: "com.huawei.celon.desiner",
		ScopePath:            "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
	}
	source := httpapi.Node{
		Scope:         scope,
		NodeType:      "api",
		LogicalID:     "live-api",
		RootAssetType: "api",
		RootAssetID:   "live-api",
	}
	target := httpapi.Node{
		Scope:         scope,
		NodeType:      "dataModel",
		LogicalID:     "live-model",
		RootAssetType: "dataModel",
		RootAssetID:   "live-model",
	}
	executor := &traversalResultExecutor{
		row: []*ngtypes.Value{
			stringValue(nodeKey(source)),
			stringValue(source.NodeType),
			stringValue(source.LogicalID),
			stringValue(source.RootAssetType),
			stringValue(source.RootAssetID),
			stringValue(source.ParentLogicalID),
			stringValue(nodeKey(target)),
			stringValue(target.NodeType),
			stringValue(target.LogicalID),
			stringValue(target.RootAssetType),
			stringValue(target.RootAssetID),
			stringValue(target.ParentLogicalID),
			stringValue("edge-api-model"),
			stringValue("USES"),
			stringValue("strong"),
			floatValue(1),
			stringValue("7"),
		},
	}
	client := NewOfficialClient(executor, defaultSpace)

	result, err := client.Traverse(context.Background(), httpapi.TraversalRequest{
		Scope:        scope,
		StartNodes:   []httpapi.Node{source},
		MaxDepth:     1,
		GraphVersion: "7",
	})
	if err != nil {
		t.Fatalf("traverse: %v", err)
	}
	if len(result.Edges) != 1 {
		t.Fatalf("expected one relationship edge, got %#v", result.Edges)
	}
	edge := result.Edges[0]
	if edge.ID != "edge-api-model" || edge.Code != "USES" {
		t.Fatalf("unexpected relationship identity: %#v", edge)
	}
	if edge.Source != source || edge.Target != target {
		t.Fatalf("unexpected relationship endpoints: %#v", edge)
	}
	for _, evidence := range []string{
		"$^.specforge_node.node_key",
		"$$.specforge_node.node_key",
		"specforge_relation.edge_id",
		"specforge_relation.code",
	} {
		if !strings.Contains(executor.traversalStatement, evidence) {
			t.Fatalf("traversal query does not yield %s: %s", evidence, executor.traversalStatement)
		}
	}
}

func TestTraverseRejectsRelationshipEvidenceOutsideExactScope(t *testing.T) {
	scope := httpapi.Scope{
		EnterpriseID:         "huawei",
		ApplicationServiceID: "com.huawei.celon.desiner",
		ScopePath:            "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
	}
	siblingScope := httpapi.Scope{
		EnterpriseID:         "huawei",
		ApplicationServiceID: "com.huawei.celon.policyhub",
		ScopePath:            "pf-huawei/product-celon/subproduct-platform/module-policy/com.huawei.celon.policyhub",
	}
	source := httpapi.Node{Scope: scope, NodeType: "api", LogicalID: "live-api", RootAssetType: "api", RootAssetID: "live-api"}
	foreignTarget := httpapi.Node{Scope: siblingScope, NodeType: "dataModel", LogicalID: "foreign-model", RootAssetType: "dataModel", RootAssetID: "foreign-model"}
	executor := &traversalResultExecutor{
		row: []*ngtypes.Value{
			stringValue(nodeKey(source)),
			stringValue(source.NodeType),
			stringValue(source.LogicalID),
			stringValue(source.RootAssetType),
			stringValue(source.RootAssetID),
			stringValue(source.ParentLogicalID),
			stringValue(nodeKey(foreignTarget)),
			stringValue(foreignTarget.NodeType),
			stringValue(foreignTarget.LogicalID),
			stringValue(foreignTarget.RootAssetType),
			stringValue(foreignTarget.RootAssetID),
			stringValue(foreignTarget.ParentLogicalID),
			stringValue("foreign-edge"),
			stringValue("USES"),
			stringValue("strong"),
			floatValue(1),
			stringValue("7"),
		},
	}
	client := NewOfficialClient(executor, defaultSpace)

	result, err := client.Traverse(context.Background(), httpapi.TraversalRequest{
		Scope:        scope,
		StartNodes:   []httpapi.Node{source},
		MaxDepth:     1,
		GraphVersion: "7",
	})
	if err != nil {
		t.Fatalf("traverse: %v", err)
	}
	if len(result.Nodes) != 1 || result.Nodes[0] != source {
		t.Fatalf("foreign target leaked into traversal nodes: %#v", result.Nodes)
	}
	if len(result.Edges) != 0 {
		t.Fatalf("foreign relationship leaked into traversal edges: %#v", result.Edges)
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

type traversalResultExecutor struct {
	row                []*ngtypes.Value
	traversalStatement string
}

func (e *traversalResultExecutor) Execute(statement string) (*ngdb.ResultSet, error) {
	response := &graph.ExecutionResponse{ErrorCode: ngtypes.ErrorCode_SUCCEEDED}
	if strings.HasPrefix(statement, "GO ") {
		e.traversalStatement = statement
		response.Data = &ngtypes.DataSet{
			Rows: []*ngtypes.Row{{Values: e.row}},
		}
	}
	return ngdb.GenResultSet(response)
}

func stringValue(value string) *ngtypes.Value {
	return ngtypes.NewValue().SetSVal([]byte(value))
}

func floatValue(value float64) *ngtypes.Value {
	return ngtypes.NewValue().SetFVal(&value)
}
