package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
)

const semanticPath = "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"

type semanticFake struct {
	fakeClient
	resolved        httpapi.ProjectionIdentity
	queryProjection httpapi.ProjectionIdentity
}

func (f *semanticFake) ProjectSemantic(context.Context, httpapi.SemanticProjectionRequest) (httpapi.SemanticProjectionReceipt, error) {
	return httpapi.SemanticProjectionReceipt{Projection: f.resolved}, nil
}

func (f *semanticFake) QueryArchitecture(_ context.Context, _ httpapi.SemanticQueryRequest, projection httpapi.ProjectionIdentity) (httpapi.SemanticQueryResult, error) {
	f.queryProjection = projection
	return httpapi.SemanticQueryResult{Status: "COMPLETE", Source: "NEBULA", Projection: projection, Targets: httpapi.SemanticTargets{}}, nil
}

func (f *semanticFake) ResolveActive(context.Context, httpapi.Scope) (httpapi.ProjectionIdentity, error) {
	return f.resolved, nil
}

func TestSemanticProjectionRequiresCompleteSourceBinding(t *testing.T) {
	client := &semanticFake{resolved: semanticIdentity()}
	server := httptest.NewServer(httpapi.NewHandler(client))
	t.Cleanup(server.Close)

	body := map[string]any{
		"scope": scope(), "projection": semanticIdentity(), "manifestStatus": "BUILDING",
		"source":   map[string]any{"semanticSchemaVersion": httpapi.SemanticSchemaVersion},
		"vertices": []any{}, "edges": []any{},
	}
	response := postJSON(t, server.URL+"/v1/semantic-projections", body)
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
	assertErrorCode(t, response, "SEMANTIC_SOURCE_BINDING_INVALID")
}

func TestSemanticQueryResolvesActiveServerSide(t *testing.T) {
	client := &semanticFake{resolved: semanticIdentity()}
	server := httptest.NewServer(httpapi.NewHandler(client))
	t.Cleanup(server.Close)

	body := map[string]any{
		"scope": scope(), "assetType": "api", "assetId": "orders",
		"budget": map[string]any{"maxAssertions": 10, "maxTargets": 10, "maxTraceSteps": 10, "timeoutMs": 1000, "maxPayloadBytes": 4096},
	}
	response := postJSON(t, server.URL+"/v1/architecture-queries", body)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}
	if client.queryProjection != client.resolved {
		t.Fatalf("query did not receive server-resolved ACTIVE projection: %#v", client.queryProjection)
	}
}

func TestSemanticQueryRejectsClientProjectionSelection(t *testing.T) {
	client := &semanticFake{resolved: semanticIdentity()}
	server := httptest.NewServer(httpapi.NewHandler(client))
	t.Cleanup(server.Close)

	body := map[string]any{
		"scope": scope(), "assetType": "api", "assetId": "orders",
		"projection": semanticIdentity(),
		"budget":     map[string]any{"maxAssertions": 10, "maxTargets": 10, "maxTraceSteps": 10, "timeoutMs": 1000, "maxPayloadBytes": 4096},
	}
	response := postJSON(t, server.URL+"/v1/architecture-queries", body)
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
	assertErrorCode(t, response, "INVALID_JSON")
}

func scope() map[string]string {
	return map[string]string{"enterpriseId": "huawei", "applicationServiceId": "com.huawei.celon.desiner", "scopePath": semanticPath}
}

func semanticIdentity() httpapi.ProjectionIdentity {
	return httpapi.ProjectionIdentity{BaselineID: "baseline-v6", ManifestID: "manifest-v6", GenerationID: "generation-v6", SchemaVersion: "nebula.3a.v1"}
}

func postJSON(t *testing.T, url string, body any) *http.Response {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	response, err := http.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("post request: %v", err)
	}
	t.Cleanup(func() { response.Body.Close() })
	return response
}
