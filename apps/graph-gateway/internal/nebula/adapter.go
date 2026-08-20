package nebula

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
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
		statement, err := edgeStatement(edge)
		if err != nil {
			return httpapi.ProjectionReceipt{}, err
		}
		if err := c.execute(ctx, "edge_upsert", statement); err != nil {
			return httpapi.ProjectionReceipt{}, err
		}
	}
	if err := c.execute(ctx, "checkpoint_upsert", checkpointStatement(projection.Scope, projection.GraphVersion)); err != nil {
		return httpapi.ProjectionReceipt{}, err
	}
	return httpapi.ProjectionReceipt{GraphVersion: projection.GraphVersion, Projection: projection.Projection, ProjectedNodeCount: len(projection.Nodes), ProjectedEdgeCount: len(projection.Edges)}, nil
}

func (c *OfficialClient) ProjectSemantic(ctx context.Context, projection httpapi.SemanticProjectionRequest) (httpapi.SemanticProjectionReceipt, error) {
	if err := ctx.Err(); err != nil {
		return httpapi.SemanticProjectionReceipt{}, err
	}
	if err := validateSemanticRequest(projection); err != nil {
		return httpapi.SemanticProjectionReceipt{}, err
	}
	if err := c.ensureSchema(ctx); err != nil {
		return httpapi.SemanticProjectionReceipt{}, err
	}
	vertexIDs := make(map[string]string, len(projection.Vertices))
	for _, vertex := range projection.Vertices {
		id := semanticVertexID(projection.Scope, projection.Projection, vertex.ID)
		vertexIDs[vertex.ID] = id
		if err := c.execute(ctx, "semantic_vertex_upsert", semanticVertexStatement(projection, vertex, id)); err != nil {
			return httpapi.SemanticProjectionReceipt{}, err
		}
	}
	for _, edge := range projection.Edges {
		sourceID, sourceOK := vertexIDs[edge.SourceID]
		targetID, targetOK := vertexIDs[edge.TargetID]
		if !sourceOK || !targetOK {
			return httpapi.SemanticProjectionReceipt{}, errors.New("SEMANTIC_EDGE_ENDPOINT_MISSING")
		}
		if err := c.execute(ctx, "semantic_edge_upsert", semanticEdgeStatement(projection, edge, sourceID, targetID)); err != nil {
			return httpapi.SemanticProjectionReceipt{}, err
		}
	}
	if err := c.execute(ctx, "semantic_manifest_upsert", semanticManifestStatement(projection, "BUILDING")); err != nil {
		return httpapi.SemanticProjectionReceipt{}, err
	}
	return httpapi.SemanticProjectionReceipt{
		Projection:           projection.Projection,
		ProjectedVertexCount: len(projection.Vertices),
		ProjectedEdgeCount:   len(projection.Edges),
	}, nil
}

func (c *OfficialClient) QueryArchitecture(ctx context.Context, query httpapi.SemanticQueryRequest, projection httpapi.ProjectionIdentity) (httpapi.SemanticQueryResult, error) {
	if err := ctx.Err(); err != nil {
		return httpapi.SemanticQueryResult{}, err
	}
	if err := validateSemanticQueryRequest(query, projection); err != nil {
		return httpapi.SemanticQueryResult{}, err
	}
	if err := c.useSpace(ctx); err != nil {
		return httpapi.SemanticQueryResult{}, err
	}
	assetID := semanticAssetID(query.AssetType, query.AssetID)
	statement := fmt.Sprintf("MATCH (asset:specforge_semantic_vertex)-[subject:specforge_semantic_relation]->(assertion:specforge_semantic_vertex) WHERE asset.specforge_semantic_vertex.family == \"DesignAsset\" AND asset.specforge_semantic_vertex.semantic_id == %s AND asset.specforge_semantic_vertex.application_service_id == %s AND asset.specforge_semantic_vertex.scope_path == %s AND asset.specforge_semantic_vertex.baseline_id == %s AND asset.specforge_semantic_vertex.manifest_id == %s AND asset.specforge_semantic_vertex.generation_id == %s AND asset.specforge_semantic_vertex.schema_version == %s AND subject.specforge_semantic_relation.family == \"ASSERTION_SUBJECT\" YIELD assertion.specforge_semantic_vertex.assertion_id, assertion.specforge_semantic_vertex.semantic_identity, assertion.specforge_semantic_vertex.layer, assertion.specforge_semantic_vertex.confidence, assertion.specforge_semantic_vertex.unit_identity, assertion.specforge_semantic_vertex.canonical_name, asset.specforge_semantic_vertex.mapping_mode, asset.specforge_semantic_vertex.reason LIMIT %d;", literal(assetID), literal(query.Scope.ApplicationServiceID), literal(query.Scope.ScopePath), literal(projection.BaselineID), literal(projection.ManifestID), literal(projection.GenerationID), literal(projection.SchemaVersion), query.Budget.MaxAssertions)
	response, err := c.executeResponse(ctx, "semantic_query", statement)
	if err != nil {
		return httpapi.SemanticQueryResult{}, err
	}
	result := httpapi.SemanticQueryResult{
		Status:            "COMPLETE",
		Source:            "NEBULA",
		Projection:        projection,
		Targets:           httpapi.SemanticTargets{BIZ: []httpapi.SemanticTarget{}, SYS: []httpapi.SemanticTarget{}, TECH: []httpapi.SemanticTarget{}},
		Assertions:        []httpapi.SemanticAssertionResult{},
		TracePath:         []httpapi.SemanticTraceStep{},
		TruncationReasons: []string{},
	}
	for _, row := range response.GetRows() {
		columns := row.GetValues()
		if len(columns) < 8 {
			return httpapi.SemanticQueryResult{}, errors.New("SEMANTIC_QUERY_RESULT_INVALID")
		}
		assertion := httpapi.SemanticAssertionResult{
			AssertionID:      columnString(columns, 0),
			SemanticIdentity: columnString(columns, 1),
			Layer:            columnString(columns, 2),
			Confidence:       columns[3].GetFVal(),
		}
		result.Assertions = append(result.Assertions, assertion)
		target := httpapi.SemanticTarget{UnitIdentity: columnString(columns, 4), Layer: assertion.Layer, CanonicalName: columnString(columns, 5)}
		switch assertion.Layer {
		case "BIZ":
			result.Targets.BIZ = append(result.Targets.BIZ, target)
		case "SYS":
			result.Targets.SYS = append(result.Targets.SYS, target)
		case "TECH":
			result.Targets.TECH = append(result.Targets.TECH, target)
		default:
			return httpapi.SemanticQueryResult{}, errors.New("SEMANTIC_QUERY_LAYER_INVALID")
		}
		if result.MappingMode == "" {
			result.MappingMode = columnString(columns, 6)
			result.Reason = columnString(columns, 7)
		}
	}
	return result, nil
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
		source, sourceKey, sourceOK := traversalNode(traversal.Scope, traversal.Projection, columns, 0)
		target, targetKey, targetOK := traversalNode(traversal.Scope, traversal.Projection, columns, 6)
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
	return httpapi.TraversalResult{Status: "COMPLETE", Nodes: nodes, Edges: edges, GraphVersion: traversal.GraphVersion, Projection: traversal.Projection, TruncationReasons: []string{}}, nil
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
		{"schema_create_semantic_vertex_tag", "CREATE TAG IF NOT EXISTS specforge_semantic_vertex(semantic_id string, family string, enterprise_id string, application_service_id string, scope_path string, baseline_id string, manifest_id string, generation_id string, schema_version string, semantic_schema_version string, logical_id string, asset_type string, asset_id string, assertion_id string, semantic_identity string, fact_type string, unit_identity string, layer string, kind string, canonical_name string, localized_name string, mapping_mode string, reason string, confidence double, content_digest string);"},
		{"schema_create_semantic_relation_edge", "CREATE EDGE IF NOT EXISTS specforge_semantic_relation(edge_id string, family string, code string, confidence double, projection_ordinal string, relationship_version string, baseline_id string, manifest_id string, generation_id string, schema_version string, semantic_schema_version string, content_digest string);"},
		{"schema_create_semantic_manifest_tag", "CREATE TAG IF NOT EXISTS specforge_semantic_manifest(status string, enterprise_id string, application_service_id string, scope_path string, baseline_id string, manifest_id string, generation_id string, schema_version string, semantic_schema_version string, source_projection_manifest_id string, source_coverage_manifest_id string, knowledge_generation_id string, coverage_generation_id string, relationship_version string, catalog_version string, catalog_digest string);"},
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

func edgeStatement(edge httpapi.Edge) (string, error) {
	rank := edgeRank(edge)
	if rank <= 0 {
		return "", errors.New("PROJECTION_ORDINAL_INVALID")
	}
	return fmt.Sprintf("INSERT EDGE specforge_relation(edge_id, code, strength, confidence, version) VALUES %s -> %s @ %d:(%s, %s, %s, %f, %s);",
		literal(vertexID(edge.Source)), literal(vertexID(edge.Target)), rank, literal(edge.ID), literal(edge.Code), literal(edge.Strength), edge.Confidence, literal(edge.Version)), nil
}

func checkpointStatement(scope httpapi.Scope, graphVersion string) string {
	return fmt.Sprintf("INSERT VERTEX specforge_checkpoint(graph_version, enterprise_id, application_service_id, scope_path) VALUES %s:(%s, %s, %s, %s);",
		literal(checkpointID(scope)), literal(graphVersion), literal(scope.EnterpriseID), literal(scope.ApplicationServiceID), literal(scope.ScopePath))
}

func nodeKey(node httpapi.Node) string {
	key := httpapi.EncodeScopeKey(node.Scope)
	if node.Projection != nil {
		key += ":generation:" + projectionKey(*node.Projection)
	}
	return key + ":" + node.NodeType + ":" + node.LogicalID
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

func edgeRank(edge httpapi.Edge) int64 {
	if edge.Source.Projection != nil {
		ordinal, err := strconv.ParseInt(edge.ProjectionOrdinal, 10, 64)
		if err == nil && ordinal > 0 {
			return ordinal
		}
		return 0
	}
	digest := sha256.Sum256([]byte(edge.ID))
	return int64(binary.BigEndian.Uint64(digest[:8]) >> 1)
}

func projectionKey(identity httpapi.ProjectionIdentity) string {
	encoded, _ := json.Marshal(identity)
	return base64.RawURLEncoding.EncodeToString(encoded)
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

func traversalNode(scope httpapi.Scope, projection *httpapi.ProjectionIdentity, columns []*ngtypes.Value, offset int) (httpapi.Node, string, bool) {
	if offset+5 >= len(columns) {
		return httpapi.Node{}, "", false
	}
	key := columnString(columns, offset)
	node := httpapi.Node{
		Scope:           scope,
		Projection:      projection,
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

func validateSemanticRequest(request httpapi.SemanticProjectionRequest) error {
	if request.ManifestStatus != "BUILDING" {
		return errors.New("SEMANTIC_MANIFEST_NOT_BUILDING")
	}
	if request.Source.SemanticSchemaVersion != httpapi.SemanticSchemaVersion {
		return errors.New("SEMANTIC_SOURCE_BINDING_INVALID")
	}
	if request.Projection.BaselineID == "" || request.Projection.ManifestID == "" || request.Projection.GenerationID == "" || request.Projection.SchemaVersion == "" {
		return errors.New("PROJECTION_IDENTITY_REQUIRED")
	}
	if request.Source.SourceProjectionManifestID == "" || request.Source.SourceCoverageManifestID == "" || request.Source.KnowledgeGenerationID == "" || request.Source.CoverageGenerationID == "" || request.Source.RelationshipVersion == "" || request.Source.CatalogVersion == "" || request.Source.CatalogDigest == "" {
		return errors.New("SEMANTIC_SOURCE_BINDING_INVALID")
	}
	seen := make(map[string]struct{}, len(request.Vertices))
	for _, vertex := range request.Vertices {
		if vertex.ID == "" || vertex.ContentDigest == "" || vertex.Scope != request.Scope {
			return errors.New("SEMANTIC_VERTEX_INVALID")
		}
		if _, exists := seen[vertex.ID]; exists {
			return errors.New("SEMANTIC_VERTEX_DUPLICATE")
		}
		seen[vertex.ID] = struct{}{}
		if !validSemanticVertexFamily(vertex.Family) {
			return errors.New("SEMANTIC_VERTEX_FAMILY_INVALID")
		}
	}
	for _, edge := range request.Edges {
		if edge.ID == "" || edge.SourceID == "" || edge.TargetID == "" || edge.Code == "" || edge.ContentDigest == "" || edge.Scope != request.Scope {
			return errors.New("SEMANTIC_EDGE_INVALID")
		}
		if _, err := strconv.ParseInt(edge.ProjectionOrdinal, 10, 64); err != nil {
			return errors.New("PROJECTION_ORDINAL_INVALID")
		}
		if !validSemanticEdgeFamily(edge.Family) {
			return errors.New("SEMANTIC_EDGE_FAMILY_INVALID")
		}
	}
	return nil
}

func validateSemanticQueryRequest(query httpapi.SemanticQueryRequest, projection httpapi.ProjectionIdentity) error {
	if query.Scope.EnterpriseID == "" || query.Scope.ApplicationServiceID == "" || query.Scope.ScopePath == "" || query.AssetType == "" || query.AssetID == "" {
		return errors.New("SEMANTIC_QUERY_SCOPE_OR_ASSET_REQUIRED")
	}
	if projection.BaselineID == "" || projection.ManifestID == "" || projection.GenerationID == "" || projection.SchemaVersion == "" {
		return errors.New("PROJECTION_IDENTITY_REQUIRED")
	}
	if query.Budget.MaxAssertions <= 0 || query.Budget.MaxTargets <= 0 || query.Budget.MaxTraceSteps <= 0 || query.Budget.TimeoutMS <= 0 || query.Budget.MaxPayloadBytes <= 0 {
		return errors.New("SEMANTIC_QUERY_BUDGET_INVALID")
	}
	return nil
}

func validSemanticVertexFamily(family string) bool {
	return family == "DesignAsset" || family == "KnowledgeAssertion" || family == "ArchitectureUnit"
}

func validSemanticEdgeFamily(family string) bool {
	switch family {
	case "ASSERTION_SUBJECT", "CLASSIFIED_AS", "REALIZED_BY", "DEPLOYED_ON", "ASSERTION_RELATION", "ASSET_RELATION", "ARCHITECTURE_RELATION":
		return true
	default:
		return false
	}
}

func semanticVertexID(scope httpapi.Scope, projection httpapi.ProjectionIdentity, semanticID string) string {
	return stableID("sv", httpapi.EncodeScopeKey(scope)+":"+projectionKey(projection)+":"+semanticID)
}

func semanticAssetID(assetType, assetID string) string {
	return "asset:" + assetType + ":" + assetID
}

func semanticVertexStatement(projection httpapi.SemanticProjectionRequest, vertex httpapi.SemanticVertex, vertexID string) string {
	values := []string{
		literal(vertex.ID), literal(vertex.Family), literal(vertex.Scope.EnterpriseID), literal(vertex.Scope.ApplicationServiceID), literal(vertex.Scope.ScopePath),
		literal(projection.Projection.BaselineID), literal(projection.Projection.ManifestID), literal(projection.Projection.GenerationID), literal(projection.Projection.SchemaVersion), literal(projection.Source.SemanticSchemaVersion),
		literal(vertex.LogicalID), literal(vertex.AssetType), literal(vertex.AssetID), literal(vertex.AssertionID), literal(vertex.SemanticIdentity), literal(vertex.FactType), literal(vertex.UnitIdentity), literal(vertex.Layer), literal(vertex.Kind), literal(vertex.CanonicalName), literal(vertex.LocalizedName), literal(vertex.MappingMode), literal(vertex.Reason), strconv.FormatFloat(vertex.Confidence, 'f', -1, 64), literal(vertex.ContentDigest),
	}
	return fmt.Sprintf("INSERT VERTEX specforge_semantic_vertex(semantic_id, family, enterprise_id, application_service_id, scope_path, baseline_id, manifest_id, generation_id, schema_version, semantic_schema_version, logical_id, asset_type, asset_id, assertion_id, semantic_identity, fact_type, unit_identity, layer, kind, canonical_name, localized_name, mapping_mode, reason, confidence, content_digest) VALUES %s:(%s);", literal(vertexID), strings.Join(values, ", "))
}

func semanticEdgeStatement(projection httpapi.SemanticProjectionRequest, edge httpapi.SemanticEdge, sourceID, targetID string) string {
	ordinal, _ := strconv.ParseInt(edge.ProjectionOrdinal, 10, 64)
	values := []string{
		literal(edge.ID), literal(edge.Family), literal(edge.Code), strconv.FormatFloat(edge.Confidence, 'f', -1, 64), literal(edge.ProjectionOrdinal), literal(edge.RelationshipVersion),
		literal(projection.Projection.BaselineID), literal(projection.Projection.ManifestID), literal(projection.Projection.GenerationID), literal(projection.Projection.SchemaVersion), literal(projection.Source.SemanticSchemaVersion), literal(edge.ContentDigest),
	}
	return fmt.Sprintf("INSERT EDGE specforge_semantic_relation(edge_id, family, code, confidence, projection_ordinal, relationship_version, baseline_id, manifest_id, generation_id, schema_version, semantic_schema_version, content_digest) VALUES %s -> %s @ %d:(%s);", literal(sourceID), literal(targetID), ordinal, strings.Join(values, ", "))
}

func semanticManifestStatement(projection httpapi.SemanticProjectionRequest, status string) string {
	values := []string{
		literal(status), literal(projection.Scope.EnterpriseID), literal(projection.Scope.ApplicationServiceID), literal(projection.Scope.ScopePath), literal(projection.Projection.BaselineID), literal(projection.Projection.ManifestID), literal(projection.Projection.GenerationID), literal(projection.Projection.SchemaVersion), literal(projection.Source.SemanticSchemaVersion), literal(projection.Source.SourceProjectionManifestID), literal(projection.Source.SourceCoverageManifestID), literal(projection.Source.KnowledgeGenerationID), literal(projection.Source.CoverageGenerationID), literal(projection.Source.RelationshipVersion), literal(projection.Source.CatalogVersion), literal(projection.Source.CatalogDigest),
	}
	return fmt.Sprintf("INSERT VERTEX specforge_semantic_manifest(status, enterprise_id, application_service_id, scope_path, baseline_id, manifest_id, generation_id, schema_version, semantic_schema_version, source_projection_manifest_id, source_coverage_manifest_id, knowledge_generation_id, coverage_generation_id, relationship_version, catalog_version, catalog_digest) VALUES %s:(%s);", literal(stableID("sm", httpapi.EncodeScopeKey(projection.Scope)+":"+projection.Projection.ManifestID)), strings.Join(values, ", "))
}
