package nebula

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
	ngdb "github.com/vesoft-inc/nebula-go/v3"
	ngtypes "github.com/vesoft-inc/nebula-go/v3/nebula"
)

const defaultSpace = "specforge_graph"

type executor interface {
	Execute(string) (*ngdb.ResultSet, error)
}

type diagnosticLogger interface {
	Printf(string, ...any)
}

// OfficialClient is the only production adapter that imports Nebula's official
// Go client. All nGQL is constructed here from typed contracts.
type OfficialClient struct {
	executor executor
	space    string
	logger   diagnosticLogger
}

func NewOfficialClient(executor executor, space string) *OfficialClient {
	if space == "" {
		space = defaultSpace
	}
	return &OfficialClient{executor: executor, space: space, logger: log.Default()}
}

func Connect(address, username, password, space string, timeout time.Duration) (*OfficialClient, func(), error) {
	host, err := parseHostAddress(address)
	if err != nil {
		return nil, nil, fmt.Errorf("parse nebula address: %w", err)
	}
	config := ngdb.GetDefaultConf()
	config.TimeOut = timeout
	pool, err := ngdb.NewConnectionPool([]ngdb.HostAddress{host}, config, ngdb.DefaultLogger{})
	if err != nil {
		return nil, nil, fmt.Errorf("create nebula connection pool: %w", err)
	}
	session, err := pool.GetSession(username, password)
	if err != nil {
		pool.Close()
		return nil, nil, errors.New("NEBULA_CONNECTION_FAILED")
	}
	closeClient := func() {
		session.Release()
		pool.Close()
	}
	return NewOfficialClient(session, space), closeClient, nil
}

func (c *OfficialClient) Project(ctx context.Context, projection httpapi.ProjectionRequest) (httpapi.ProjectionReceipt, error) {
	if err := ctx.Err(); err != nil {
		return httpapi.ProjectionReceipt{}, err
	}
	if err := c.ensureSchema(ctx); err != nil {
		return httpapi.ProjectionReceipt{}, err
	}
	for _, node := range projection.Nodes {
		if err := c.execute(ctx, "node_upsert", nodeStatement(node)); err != nil {
			return httpapi.ProjectionReceipt{}, err
		}
	}
	for _, edge := range projection.Edges {
		if err := c.execute(ctx, "edge_upsert", edgeStatement(edge)); err != nil {
			return httpapi.ProjectionReceipt{}, err
		}
	}
	if err := c.execute(ctx, "checkpoint_upsert", checkpointStatement(projection.Scope, projection.GraphVersion)); err != nil {
		return httpapi.ProjectionReceipt{}, err
	}
	return httpapi.ProjectionReceipt{GraphVersion: projection.GraphVersion, ProjectedNodeCount: len(projection.Nodes), ProjectedEdgeCount: len(projection.Edges)}, nil
}

func (c *OfficialClient) Traverse(ctx context.Context, traversal httpapi.TraversalRequest) (httpapi.TraversalResult, error) {
	if err := c.useSpace(ctx); err != nil {
		return httpapi.TraversalResult{}, err
	}
	if len(traversal.StartNodes) == 0 {
		return httpapi.TraversalResult{}, errors.New("START_NODES_REQUIRED")
	}
	vertexIDs := make([]string, 0, len(traversal.StartNodes))
	for _, node := range traversal.StartNodes {
		vertexIDs = append(vertexIDs, literal(vertexID(node)))
	}
	response, err := c.executeResponse(ctx, "traversal", fmt.Sprintf("GO 1 TO %d STEPS FROM %s OVER specforge_relation YIELD $^.specforge_node.node_key, $^.specforge_node.node_type, $^.specforge_node.logical_id, $^.specforge_node.root_asset_type, $^.specforge_node.root_asset_id, $^.specforge_node.parent_logical_id, $$.specforge_node.node_key, $$.specforge_node.node_type, $$.specforge_node.logical_id, $$.specforge_node.root_asset_type, $$.specforge_node.root_asset_id, $$.specforge_node.parent_logical_id, specforge_relation.edge_id, specforge_relation.code, specforge_relation.strength, specforge_relation.confidence, specforge_relation.version;", traversal.MaxDepth, strings.Join(vertexIDs, ", ")))
	if err != nil {
		return httpapi.TraversalResult{}, err
	}
	nodeByKey := make(map[string]httpapi.Node, len(traversal.StartNodes)+len(response.GetRows()))
	edgeByID := make(map[string]httpapi.Edge, len(response.GetRows()))
	for _, node := range traversal.StartNodes {
		nodeByKey[nodeKey(node)] = node
	}
	for _, row := range response.GetRows() {
		columns := row.GetValues()
		if len(columns) < 17 {
			continue
		}
		source, sourceKey, sourceOK := traversalNode(traversal.Scope, columns, 0)
		target, targetKey, targetOK := traversalNode(traversal.Scope, columns, 6)
		if !sourceOK || !targetOK {
			continue
		}
		nodeByKey[sourceKey] = source
		nodeByKey[targetKey] = target
		edge := httpapi.Edge{
			ID:         columnString(columns, 12),
			Code:       columnString(columns, 13),
			Source:     source,
			Target:     target,
			Strength:   columnString(columns, 14),
			Confidence: columns[15].GetFVal(),
			Version:    columnString(columns, 16),
		}
		edgeByID[edge.ID] = edge
	}
	keys := make([]string, 0, len(nodeByKey))
	for key := range nodeByKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	nodes := make([]httpapi.Node, 0, len(keys))
	for _, key := range keys {
		nodes = append(nodes, nodeByKey[key])
	}
	edgeIDs := make([]string, 0, len(edgeByID))
	for edgeID := range edgeByID {
		edgeIDs = append(edgeIDs, edgeID)
	}
	sort.Strings(edgeIDs)
	edges := make([]httpapi.Edge, 0, len(edgeIDs))
	for _, edgeID := range edgeIDs {
		edges = append(edges, edgeByID[edgeID])
	}
	return httpapi.TraversalResult{Status: "COMPLETE", Nodes: nodes, Edges: edges, GraphVersion: traversal.GraphVersion, TruncationReasons: []string{}}, nil
}

func (c *OfficialClient) Checkpoint(ctx context.Context, scope httpapi.Scope) (string, error) {
	if err := c.useSpace(ctx); err != nil {
		return "", err
	}
	response, err := c.executeResponse(ctx, "checkpoint_read", fmt.Sprintf("FETCH PROP ON specforge_checkpoint %s YIELD specforge_checkpoint.graph_version;", literal(checkpointID(scope))))
	if err != nil {
		return "", err
	}
	if len(response.GetRows()) == 0 || len(response.GetRows()[0].GetValues()) == 0 {
		return "0", nil
	}
	return string(response.GetRows()[0].GetValues()[0].GetSVal()), nil
}

func (c *OfficialClient) Health(ctx context.Context) (httpapi.Health, error) {
	if err := c.ensureSchema(ctx); err != nil {
		return httpapi.Health{}, err
	}
	if err := c.execute(ctx, "health_show_tags", "SHOW TAGS;"); err != nil {
		return httpapi.Health{}, err
	}
	return httpapi.Health{GraphSchemaReady: true}, nil
}

func (c *OfficialClient) ensureSchema(ctx context.Context) error {
	if err := c.execute(ctx, "schema_create_space", fmt.Sprintf("CREATE SPACE IF NOT EXISTS %s(partition_num=1, replica_factor=1, vid_type=fixed_string(256));", identifier(c.space))); err != nil {
		return err
	}
	if err := c.useSpace(ctx); err != nil {
		return err
	}
	for _, schema := range []struct {
		operation string
		statement string
	}{
		{"schema_create_node_tag", "CREATE TAG IF NOT EXISTS specforge_node(node_key string, enterprise_id string, application_service_id string, scope_path string, node_type string, logical_id string, root_asset_type string, root_asset_id string, parent_logical_id string);"},
		{"schema_create_checkpoint_tag", "CREATE TAG IF NOT EXISTS specforge_checkpoint(graph_version string, enterprise_id string, application_service_id string, scope_path string);"},
		{"schema_create_relation_edge", "CREATE EDGE IF NOT EXISTS specforge_relation(edge_id string, code string, strength string, confidence double, version string);"},
	} {
		if err := c.execute(ctx, schema.operation, schema.statement); err != nil {
			return err
		}
	}
	return nil
}

func (c *OfficialClient) useSpace(ctx context.Context) error {
	return c.execute(ctx, "use_space", fmt.Sprintf("USE %s;", identifier(c.space)))
}

func (c *OfficialClient) execute(ctx context.Context, operation, statement string) error {
	_, err := c.executeResponse(ctx, operation, statement)
	return err
}

func (c *OfficialClient) executeResponse(ctx context.Context, operation, statement string) (*ngdb.ResultSet, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	response, err := c.executor.Execute(statement)
	if err != nil {
		return nil, c.queryFailure(operation, 0, "transport_error")
	}
	if response == nil {
		return nil, c.queryFailure(operation, 0, "empty_response")
	}
	if !response.IsSucceed() {
		return nil, c.queryFailure(operation, int(response.GetErrorCode()), safeNebulaReason(response.GetErrorMsg()))
	}
	return response, nil
}

func (c *OfficialClient) queryFailure(operation string, code int, reason string) error {
	if c.logger != nil {
		c.logger.Printf("nebula query failed operation=%s code=%d reason=%s", operation, code, reason)
	}
	return errors.New("NEBULA_QUERY_FAILED")
}

func safeNebulaReason(message string) string {
	normalized := strings.ToLower(message)
	switch {
	case strings.Contains(normalized, "vertex id") || strings.Contains(normalized, "vid must"):
		return "invalid_vertex_id"
	case strings.Contains(normalized, "space") && strings.Contains(normalized, "not found"):
		return "space_not_found"
	case strings.Contains(normalized, "schema") && (strings.Contains(normalized, "not found") || strings.Contains(normalized, "not exist")):
		return "schema_not_found"
	case strings.Contains(normalized, "syntax"):
		return "syntax_error"
	case strings.Contains(normalized, "permission"):
		return "permission_denied"
	default:
		return "unclassified"
	}
}

func parseHostAddress(address string) (ngdb.HostAddress, error) {
	host, portText, err := net.SplitHostPort(address)
	if err != nil {
		return ngdb.HostAddress{}, err
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return ngdb.HostAddress{}, fmt.Errorf("invalid port %q", portText)
	}
	if host == "" {
		return ngdb.HostAddress{}, errors.New("host is required")
	}
	return ngdb.HostAddress{Host: host, Port: port}, nil
}

func nodeStatement(node httpapi.Node) string {
	return fmt.Sprintf("INSERT VERTEX specforge_node(node_key, enterprise_id, application_service_id, scope_path, node_type, logical_id, root_asset_type, root_asset_id, parent_logical_id) VALUES %s:(%s, %s, %s, %s, %s, %s, %s, %s, %s);",
		literal(vertexID(node)), literal(nodeKey(node)), literal(node.EnterpriseID), literal(node.ApplicationServiceID), literal(node.ScopePath), literal(node.NodeType), literal(node.LogicalID), literal(node.RootAssetType), literal(node.RootAssetID), literal(node.ParentLogicalID))
}

func edgeStatement(edge httpapi.Edge) string {
	return fmt.Sprintf("INSERT EDGE specforge_relation(edge_id, code, strength, confidence, version) VALUES %s -> %s @ %d:(%s, %s, %s, %f, %s);",
		literal(vertexID(edge.Source)), literal(vertexID(edge.Target)), edgeRank(edge.ID), literal(edge.ID), literal(edge.Code), literal(edge.Strength), edge.Confidence, literal(edge.Version))
}

func checkpointStatement(scope httpapi.Scope, graphVersion string) string {
	return fmt.Sprintf("INSERT VERTEX specforge_checkpoint(graph_version, enterprise_id, application_service_id, scope_path) VALUES %s:(%s, %s, %s, %s);",
		literal(checkpointID(scope)), literal(graphVersion), literal(scope.EnterpriseID), literal(scope.ApplicationServiceID), literal(scope.ScopePath))
}

func nodeKey(node httpapi.Node) string {
	return httpapi.EncodeScopeKey(node.Scope) + ":" + node.NodeType + ":" + node.LogicalID
}

func vertexID(node httpapi.Node) string {
	return stableID("n", nodeKey(node))
}

func checkpointID(scope httpapi.Scope) string {
	return stableID("c", httpapi.EncodeScopeKey(scope))
}

func stableID(kind, value string) string {
	digest := sha256.Sum256([]byte(value))
	return kind + ":" + fmt.Sprintf("%x", digest)
}

func edgeRank(edgeID string) int64 {
	digest := sha256.Sum256([]byte(edgeID))
	return int64(binary.BigEndian.Uint64(digest[:8]) >> 1)
}

func identifier(value string) string {
	return "`" + strings.ReplaceAll(value, "`", "``") + "`"
}

func literal(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func columnString(columns []*ngtypes.Value, index int) string {
	if index >= len(columns) || columns[index] == nil {
		return ""
	}
	return string(columns[index].GetSVal())
}

func traversalNode(scope httpapi.Scope, columns []*ngtypes.Value, offset int) (httpapi.Node, string, bool) {
	if offset+5 >= len(columns) {
		return httpapi.Node{}, "", false
	}
	key := columnString(columns, offset)
	node := httpapi.Node{
		Scope:           scope,
		NodeType:        columnString(columns, offset+1),
		LogicalID:       columnString(columns, offset+2),
		RootAssetType:   columnString(columns, offset+3),
		RootAssetID:     columnString(columns, offset+4),
		ParentLogicalID: columnString(columns, offset+5),
	}
	if key == "" || key != nodeKey(node) {
		return httpapi.Node{}, "", false
	}
	return node, key, true
}
