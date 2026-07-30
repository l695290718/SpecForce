package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
)

// EncodeScopeKey creates a URL-safe, reversible identifier for the exact
// three-part ownership boundary. It is never a substitute for scope validation.
func EncodeScopeKey(scope Scope) string {
	payload, _ := json.Marshal(scope)
	return base64.RawURLEncoding.EncodeToString(payload)
}

func DecodeScopeKey(value string) (Scope, error) {
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return Scope{}, contractError{code: "SCOPE_ID_INVALID", status: http.StatusBadRequest}
	}
	var scope Scope
	if err := json.Unmarshal(payload, &scope); err != nil {
		return Scope{}, contractError{code: "SCOPE_ID_INVALID", status: http.StatusBadRequest}
	}
	if err := validateScope(scope); err != nil {
		return Scope{}, contractError{code: "SCOPE_ID_INVALID", status: http.StatusBadRequest}
	}
	return scope, nil
}
