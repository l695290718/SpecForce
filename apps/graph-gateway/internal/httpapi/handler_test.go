package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
)

func TestProjectionRejectsMixedScopes(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(httpapi.NewHandler(fakeClient{}))
	t.Cleanup(server.Close)

	body := projectionBody(t, "com.huawei.celon.desiner", "com.huawei.celon.policyhub")
	response, err := http.Post(server.URL+"/v1/projections", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post projection: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
	assertErrorCode(t, response, "SCOPE_MISMATCH")
}

func TestProjectionRejectsRawNGQL(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(httpapi.NewHandler(fakeClient{}))
	t.Cleanup(server.Close)

	body := []byte(`{"scope":{"enterpriseId":"huawei","applicationServiceId":"com.huawei.celon.desiner","scopePath":"pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"},"graphVersion":"7","nodes":[],"edges":[],"ngql":"DROP SPACE specforge_graph"}`)
	response, err := http.Post(server.URL+"/v1/projections", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post projection: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.StatusCode)
	}
	assertErrorCode(t, response, "RAW_NGQL_FORBIDDEN")
}

func TestHealthSanitizesNebulaFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(httpapi.NewHandler(fakeClient{healthErr: errors.New("authentication failed for password super-secret")}))
	t.Cleanup(server.Close)

	response, err := http.Get(server.URL + "/health")
	if err != nil {
		t.Fatalf("get health: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", response.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode health: %v", err)
	}
	if body["code"] != "NEBULA_UNAVAILABLE" {
		t.Fatalf("expected error code NEBULA_UNAVAILABLE, got %v", body["code"])
	}
	encoded, _ := json.Marshal(body)
	if strings.Contains(string(encoded), "super-secret") || strings.Contains(string(encoded), "password") {
		t.Fatalf("health leaked credential text: %s", encoded)
	}
}

type fakeClient struct {
	healthErr error
}

func (f fakeClient) Project(context.Context, httpapi.ProjectionRequest) (httpapi.ProjectionReceipt, error) {
	return httpapi.ProjectionReceipt{}, nil
}

func (f fakeClient) Traverse(context.Context, httpapi.TraversalRequest) (httpapi.TraversalResult, error) {
	return httpapi.TraversalResult{}, nil
}

func (f fakeClient) Checkpoint(context.Context, httpapi.Scope) (string, error) {
	return "0", nil
}

func (f fakeClient) Health(context.Context) (httpapi.Health, error) {
	return httpapi.Health{}, f.healthErr
}

func projectionBody(t *testing.T, batchService, nodeService string) []byte {
	t.Helper()
	path := "pf-huawei/product-celon/subproduct-platform/module-celon-designer/"
	body := map[string]any{
		"scope": map[string]any{"enterpriseId": "huawei", "applicationServiceId": batchService, "scopePath": path + batchService},
		"graphVersion": "7",
		"nodes": []any{map[string]any{
			"enterpriseId": "huawei", "applicationServiceId": nodeService, "scopePath": path + nodeService,
			"nodeType": "api", "logicalId": "api-payment", "rootAssetType": "api", "rootAssetId": "api-payment",
		}},
		"edges": []any{},
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	return encoded
}

func assertErrorCode(t *testing.T, response *http.Response, expected string) {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Code != expected {
		t.Fatalf("expected error code %q, got %q", expected, body.Code)
	}
}
