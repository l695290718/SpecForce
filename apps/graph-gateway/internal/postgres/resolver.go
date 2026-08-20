package postgres

import (
	"context"
	"database/sql"
	"errors"

	"github.com/l695290718/specforge/apps/graph-gateway/internal/httpapi"
)

type ActiveManifestResolver struct {
	db *sql.DB
}

func NewActiveManifestResolver(db *sql.DB) *ActiveManifestResolver {
	return &ActiveManifestResolver{db: db}
}

func (r *ActiveManifestResolver) ResolveActive(ctx context.Context, scope httpapi.Scope) (httpapi.ProjectionIdentity, error) {
	if r == nil || r.db == nil {
		return httpapi.ProjectionIdentity{}, errors.New("ACTIVE_PROJECTION_UNAVAILABLE")
	}
	const query = `
SELECT manifest."baselineId", manifest."id", manifest."generationId", manifest."projectionSchemaVersion"
FROM "NebulaProjectionHead" AS head
JOIN "NebulaProjectionManifest" AS manifest
  ON manifest."applicationServiceId" = head."applicationServiceId"
 AND manifest."scopePath" = head."scopePath"
 AND manifest."id" = head."activeManifestId"
WHERE head."enterpriseId" = $1
  AND head."applicationServiceId" = $2
  AND head."scopePath" = $3
  AND manifest."status" = 'ACTIVE'`
	var identity httpapi.ProjectionIdentity
	if err := r.db.QueryRowContext(ctx, query, scope.EnterpriseID, scope.ApplicationServiceID, scope.ScopePath).Scan(&identity.BaselineID, &identity.ManifestID, &identity.GenerationID, &identity.SchemaVersion); err != nil {
		return httpapi.ProjectionIdentity{}, errors.New("ACTIVE_PROJECTION_UNAVAILABLE")
	}
	if identity.BaselineID == "" || identity.ManifestID == "" || identity.GenerationID == "" || identity.SchemaVersion == "" {
		return httpapi.ProjectionIdentity{}, errors.New("ACTIVE_PROJECTION_INVALID")
	}
	return identity, nil
}
