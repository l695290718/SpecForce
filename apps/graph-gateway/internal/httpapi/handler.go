package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type Handler struct {
	client NebulaClient
}

func NewHandler(client NebulaClient) http.Handler {
	handler := Handler{client: client}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/projections", handler.project)
	mux.HandleFunc("POST /v1/traversals", handler.traverse)
	mux.HandleFunc("GET /v1/checkpoints/{scopeID}", handler.checkpoint)
	mux.HandleFunc("GET /health", handler.health)
	return mux
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
	}
	for _, edge := range projection.Edges {
		if !sameScope(projection.Scope, edge.Source.Scope) || !sameScope(projection.Scope, edge.Target.Scope) {
			return contractError{code: "SCOPE_MISMATCH", status: http.StatusBadRequest}
		}
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
	}
	return nil
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
	code string
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
