package httpapi

import "context"

// Scope is the complete identity boundary for every graph operation.
type Scope struct {
	EnterpriseID         string `json:"enterpriseId"`
	ApplicationServiceID string `json:"applicationServiceId"`
	ScopePath            string `json:"scopePath"`
}

// ProjectionIdentity binds graph records to one bounded projection
// generation. It is optional only for the legacy graphVersion contract.
type ProjectionIdentity struct {
	BaselineID    string `json:"baselineId"`
	ManifestID    string `json:"manifestId"`
	GenerationID  string `json:"generationId"`
	SchemaVersion string `json:"schemaVersion"`
}

type Node struct {
	Scope
	Projection      *ProjectionIdentity `json:"projection,omitempty"`
	NodeType        string              `json:"nodeType"`
	LogicalID       string              `json:"logicalId"`
	RootAssetType   string              `json:"rootAssetType"`
	RootAssetID     string              `json:"rootAssetId"`
	ParentLogicalID string              `json:"parentLogicalId,omitempty"`
}

type Edge struct {
	ID                string  `json:"id"`
	Code              string  `json:"code"`
	Source            Node    `json:"source"`
	Target            Node    `json:"target"`
	Strength          string  `json:"strength"`
	Confidence        float64 `json:"confidence"`
	Version           string  `json:"version"`
	ProjectionOrdinal string  `json:"projectionOrdinal,omitempty"`
}

type ProjectionRequest struct {
	Scope        Scope               `json:"scope"`
	GraphVersion string              `json:"graphVersion"`
	Projection   *ProjectionIdentity `json:"projection,omitempty"`
	Nodes        []Node              `json:"nodes"`
	Edges        []Edge              `json:"edges"`
}

type ProjectionReceipt struct {
	GraphVersion       string              `json:"graphVersion"`
	Projection         *ProjectionIdentity `json:"projection,omitempty"`
	ProjectedNodeCount int                 `json:"projectedNodeCount"`
	ProjectedEdgeCount int                 `json:"projectedEdgeCount"`
}

type TraversalRequest struct {
	Scope         Scope               `json:"scope"`
	StartNodes    []Node              `json:"startNodes"`
	RelationCodes []string            `json:"relationCodes"`
	MaxDepth      int                 `json:"maxDepth"`
	MaxNodes      int                 `json:"maxNodes"`
	MaxPaths      int                 `json:"maxPaths"`
	TimeoutMS     int                 `json:"timeoutMs"`
	GraphVersion  string              `json:"graphVersion,omitempty"`
	Projection    *ProjectionIdentity `json:"projection,omitempty"`
}

type TraversalResult struct {
	Status            string              `json:"status"`
	Nodes             []Node              `json:"nodes"`
	Edges             []Edge              `json:"edges"`
	GraphVersion      string              `json:"graphVersion"`
	Projection        *ProjectionIdentity `json:"projection,omitempty"`
	ElapsedMS         int64               `json:"elapsedMs"`
	TruncationReasons []string            `json:"truncationReasons"`
}

type Health struct {
	GraphSchemaReady bool `json:"graphSchemaReady"`
}

// NebulaClient is the only dependency of the HTTP boundary. Implementations
// may use the official client, but callers cannot submit nGQL through this API.
type NebulaClient interface {
	Project(context.Context, ProjectionRequest) (ProjectionReceipt, error)
	Traverse(context.Context, TraversalRequest) (TraversalResult, error)
	Checkpoint(context.Context, Scope) (string, error)
	Health(context.Context) (Health, error)
}
