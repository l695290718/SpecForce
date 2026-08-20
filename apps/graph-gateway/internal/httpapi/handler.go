package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

type Handler struct {
	client   NebulaClient
	semantic SemanticClient
	active   ActiveManifestResolver
}

func NewHandler(client NebulaClient) http.Handler {
	return NewHandlerWithResolver(client, nil)
}

func NewHandlerWithResolver(client NebulaClient, resolver ActiveManifestResolver) http.Handler {
	semantic, _ := client.(SemanticClient)
	active, _ := client.(ActiveManifestResolver)
	if resolver != nil {
		active = resolver
	}
	handler := Handler{client: client, semantic: semantic, active: active}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/projections", handler.project)
	mux.HandleFunc("POST /v1/traversals", handler.traverse)
	mux.HandleFunc("POST /v1/semantic-projections", handler.projectSemantic)
	mux.HandleFunc("POST /v1/architecture-queries", handler.queryArchitecture)
	mux.HandleFunc("GET /v1/checkpoints/{scopeID}", handler.checkpoint)
	mux.HandleFunc("GET /health", handler.health)
	return mux
}

func (h Handler) projectSemantic(writer http.ResponseWriter, request *http.Request) {
	var projection SemanticProjectionRequest
	if err := decodeContract(request, &projection); err != nil {
		writeError(writer, err)
		return
	}
	if err := validateSemanticProjection(projection); err != nil {
		writeError(writer, err)
		return
	}
	if h.semantic == nil {
		writeError(writer, contractError{code: "SEMANTIC_GATEWAY_UNAVAILABLE", status: http.StatusServiceUnavailable})
		return
	}
	receipt, err := h.semantic.ProjectSemantic(request.Context(), projection)
	if err != nil {
		writeError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, receipt)
}

func (h Handler) queryArchitecture(writer http.ResponseWriter, request *http.Request) {
	var query SemanticQueryRequest
	if err := decodeContract(request, &query); err != nil {
		writeError(writer, err)
		return
	}
	if err := validateSemanticQuery(query); err != nil {
		writeError(writer, err)
		return
	}
	if h.semantic == nil || h.active == nil {
		writeError(writer, contractError{code: "SEMANTIC_GATEWAY_UNAVAILABLE", status: http.StatusServiceUnavailable})
		return
	}
	identity, err := h.active.ResolveActive(request.Context(), query.Scope)
	if err != nil {
		writeError(writer, contractError{code: "ACTIVE_PROJECTION_UNAVAILABLE", status: http.StatusServiceUnavailable})
		return
	}
	result, err := h.semantic.QueryArchitecture(request.Context(), query, identity)
	if err != nil {
		writeError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (h Handler) project(writer http.ResponseWriter, request *http.Request) {
	var projection ProjectionRequest
	if err := decodeContract(request, &projection); err != nil {
		writeError(writer, err)
		return
	}
	if err := validateProjection(projection); err != nil {
		writeError(writer, err)
		return
	}
	receipt, err := h.client.Project(request.Context(), projection)
	if err != nil {
		writeError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, receipt)
}

func (h Handler) traverse(writer http.ResponseWriter, request *http.Request) {
	var traversal TraversalRequest
	if err := decodeContract(request, &traversal); err != nil {
		writeError(writer, err)
		return
	}
	if err := validateTraversal(traversal); err != nil {
		writeError(writer, err)
		return
	}
	result, err := h.client.Traverse(request.Context(), traversal)
	if err != nil {
		writeError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, result)
}

func (h Handler) checkpoint(writer http.ResponseWriter, request *http.Request) {
	scope, err := DecodeScopeKey(request.PathValue("scopeID"))
	if err != nil {
		writeError(writer, err)
		return
	}
	checkpoint, err := h.client.Checkpoint(request.Context(), scope)
	if err != nil {
		writeError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"graphVersion": checkpoint})
}

func (h Handler) health(writer http.ResponseWriter, request *http.Request) {
	health, err := h.client.Health(request.Context())
	if err != nil {
		writeJSON(writer, http.StatusServiceUnavailable, map[string]any{
			"status": "unavailable", "code": "NEBULA_UNAVAILABLE", "graphSchemaReady": false,
		})
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"status": "ok", "code": "OK", "graphSchemaReady": health.GraphSchemaReady,
	})
}

func decodeContract(request *http.Request, destination any) error {
	if request.Header.Get("Content-Type") != "application/json" {
		return contractError{code: "CONTENT_TYPE_REQUIRED", status: http.StatusUnsupportedMediaType}
	}
	var raw map[string]json.RawMessage
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		return contractError{code: "INVALID_JSON", status: http.StatusBadRequest}
	}
	if _, found := raw["ngql"]; found {
		return contractError{code: "RAW_NGQL_FORBIDDEN", status: http.StatusBadRequest}
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return contractError{code: "INVALID_JSON", status: http.StatusBadRequest}
	}
	decoder = json.NewDecoder(strings.NewReader(string(encoded)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return contractError{code: "INVALID_JSON", status: http.StatusBadRequest}
	}
	return nil
}

func validateProjection(projection ProjectionRequest) error {
	if err := validateScope(projection.Scope); err != nil {
		return err
	}
	if projection.GraphVersion == "" {
		return contractError{code: "GRAPH_VERSION_REQUIRED", status: http.StatusBadRequest}
	}
	for _, node := range projection.Nodes {
		if !sameScope(projection.Scope, node.Scope) {
			return contractError{code: "SCOPE_MISMATCH", status: http.StatusBadRequest}
		}
		if err := validateNodeProjection(projection.Projection, node.Projection); err != nil {
			return err
		}
	}
	for _, edge := range projection.Edges {
		if !sameScope(projection.Scope, edge.Source.Scope) || !sameScope(projection.Scope, edge.Target.Scope) {
			return contractError{code: "SCOPE_MISMATCH", status: http.StatusBadRequest}
		}
		if err := validateNodeProjection(projection.Projection, edge.Source.Projection); err != nil {
			return err
		}
		if err := validateNodeProjection(projection.Projection, edge.Target.Projection); err != nil {
			return err
		}
		if projection.Projection != nil && edge.ProjectionOrdinal == "" {
			return contractError{code: "PROJECTION_ORDINAL_REQUIRED", status: http.StatusBadRequest}
		}
		if projection.Projection != nil {
			ordinal, err := strconv.ParseInt(edge.ProjectionOrdinal, 10, 64)
			if err != nil || ordinal <= 0 {
				return contractError{code: "PROJECTION_ORDINAL_INVALID", status: http.StatusBadRequest}
			}
		}
	}
	if err := validateProjectionIdentity(projection.Projection); err != nil {
		return err
	}
	return nil
}

func validateTraversal(traversal TraversalRequest) error {
	if err := validateScope(traversal.Scope); err != nil {
		return err
	}
	for _, node := range traversal.StartNodes {
		if !sameScope(traversal.Scope, node.Scope) {
			return contractError{code: "SCOPE_MISMATCH", status: http.StatusBadRequest}
		}
		if err := validateNodeProjection(traversal.Projection, node.Projection); err != nil {
			return err
		}
	}
	if err := validateProjectionIdentity(traversal.Projection); err != nil {
		return err
	}
	return nil
}

func validateNodeProjection(request, node *ProjectionIdentity) error {
	if request == nil {
		if node != nil {
			return contractError{code: "PROJECTION_IDENTITY_MISMATCH", status: http.StatusBadRequest}
		}
		return nil
	}
	if node == nil {
		return contractError{code: "PROJECTION_IDENTITY_REQUIRED", status: http.StatusBadRequest}
	}
	if !sameProjection(*request, *node) {
		return contractError{code: "PROJECTION_IDENTITY_MISMATCH", status: http.StatusBadRequest}
	}
	return nil
}

func validateProjectionIdentity(identity *ProjectionIdentity) error {
	if identity == nil {
		return nil
	}
	if identity.BaselineID == "" || identity.ManifestID == "" || identity.GenerationID == "" || identity.SchemaVersion == "" {
		return contractError{code: "PROJECTION_IDENTITY_REQUIRED", status: http.StatusBadRequest}
	}
	return nil
}

func validateSemanticProjection(projection SemanticProjectionRequest) error {
	if err := validateScope(projection.Scope); err != nil {
		return err
	}
	if projection.ManifestStatus != "BUILDING" {
		return contractError{code: "SEMANTIC_MANIFEST_NOT_BUILDING", status: http.StatusBadRequest}
	}
	if err := validateProjectionIdentity(&projection.Projection); err != nil {
		return err
	}
	if projection.Source.SemanticSchemaVersion != SemanticSchemaVersion || !semanticSourceBindingComplete(projection.Source) {
		return contractError{code: "SEMANTIC_SOURCE_BINDING_INVALID", status: http.StatusBadRequest}
	}
	for _, vertex := range projection.Vertices {
		if !sameScope(projection.Scope, vertex.Scope) {
			return contractError{code: "SCOPE_MISMATCH", status: http.StatusBadRequest}
		}
		if vertex.ID == "" || vertex.Family == "" || vertex.ContentDigest == "" {
			return contractError{code: "SEMANTIC_VERTEX_INVALID", status: http.StatusBadRequest}
		}
		if !validSemanticVertexFamily(vertex.Family) {
			return contractError{code: "SEMANTIC_VERTEX_FAMILY_INVALID", status: http.StatusBadRequest}
		}
	}
	for _, edge := range projection.Edges {
		if !sameScope(projection.Scope, edge.Scope) {
			return contractError{code: "SCOPE_MISMATCH", status: http.StatusBadRequest}
		}
		if edge.ID == "" || edge.SourceID == "" || edge.TargetID == "" || edge.Code == "" || edge.ContentDigest == "" || !validSemanticEdgeFamily(edge.Family) {
			return contractError{code: "SEMANTIC_EDGE_INVALID", status: http.StatusBadRequest}
		}
		ordinal, err := strconv.ParseInt(edge.ProjectionOrdinal, 10, 64)
		if err != nil || ordinal <= 0 {
			return contractError{code: "PROJECTION_ORDINAL_INVALID", status: http.StatusBadRequest}
		}
	}
	return nil
}

func validateSemanticQuery(query SemanticQueryRequest) error {
	if err := validateScope(query.Scope); err != nil {
		return err
	}
	if strings.TrimSpace(query.AssetType) == "" || strings.TrimSpace(query.AssetID) == "" {
		return contractError{code: "SEMANTIC_ASSET_REQUIRED", status: http.StatusBadRequest}
	}
	budget := query.Budget
	if budget.MaxAssertions <= 0 || budget.MaxTargets <= 0 || budget.MaxTraceSteps <= 0 || budget.TimeoutMS <= 0 || budget.MaxPayloadBytes <= 0 {
		return contractError{code: "SEMANTIC_QUERY_BUDGET_INVALID", status: http.StatusBadRequest}
	}
	return nil
}

func semanticSourceBindingComplete(source SemanticSourceBinding) bool {
	return source.SourceProjectionManifestID != "" && source.SourceCoverageManifestID != "" && source.KnowledgeGenerationID != "" && source.CoverageGenerationID != "" && source.RelationshipVersion != "" && source.CatalogVersion != "" && source.CatalogDigest != ""
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

func sameProjection(left, right ProjectionIdentity) bool {
	return left.BaselineID == right.BaselineID && left.ManifestID == right.ManifestID && left.GenerationID == right.GenerationID && left.SchemaVersion == right.SchemaVersion
}

func validateScope(scope Scope) error {
	if scope.EnterpriseID == "" || scope.ApplicationServiceID == "" || scope.ScopePath == "" {
		return contractError{code: "SCOPE_REQUIRED", status: http.StatusBadRequest}
	}
	return nil
}

func sameScope(left, right Scope) bool {
	return left.EnterpriseID == right.EnterpriseID && left.ApplicationServiceID == right.ApplicationServiceID && left.ScopePath == right.ScopePath
}

type contractError struct {
	code   string
	status int
}

func (e contractError) Error() string { return e.code }

func writeError(writer http.ResponseWriter, err error) {
	var contract contractError
	if errors.As(err, &contract) {
		writeJSON(writer, contract.status, map[string]string{"code": contract.code})
		return
	}
	writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"code": "NEBULA_UNAVAILABLE"})
}

func writeJSON(writer http.ResponseWriter, status int, body any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(body)
}
