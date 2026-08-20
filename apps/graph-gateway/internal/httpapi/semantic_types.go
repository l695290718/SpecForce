package httpapi

import "context"

const SemanticSchemaVersion = "nebula.3a.semantic.v1"

type SemanticSourceBinding struct {
	SourceProjectionManifestID string `json:"sourceProjectionManifestId"`
	SourceCoverageManifestID   string `json:"sourceCoverageManifestId"`
	KnowledgeGenerationID      string `json:"knowledgeGenerationId"`
	CoverageGenerationID       string `json:"coverageGenerationId"`
	RelationshipVersion        string `json:"relationshipVersion"`
	CatalogVersion             string `json:"catalogVersion"`
	CatalogDigest              string `json:"catalogDigest"`
	SemanticSchemaVersion      string `json:"semanticSchemaVersion"`
}

type SemanticVertex struct {
	Scope         `json:"scope"`
	Family        string `json:"family"`
	ID            string `json:"id"`
	LogicalID     string `json:"logicalId,omitempty"`
	AssetType     string `json:"assetType,omitempty"`
	AssetID       string `json:"assetId,omitempty"`
	AssertionID   string `json:"assertionId,omitempty"`
	UnitIdentity  string `json:"unitIdentity,omitempty"`
	Layer         string `json:"layer,omitempty"`
	Kind          string `json:"kind,omitempty"`
	MappingMode   string `json:"mappingMode,omitempty"`
	Reason        string `json:"reason,omitempty"`
	ContentDigest string `json:"contentDigest"`
}

type SemanticEdge struct {
	Scope               `json:"scope"`
	Family              string  `json:"family"`
	ID                  string  `json:"id"`
	SourceID            string  `json:"sourceId"`
	TargetID            string  `json:"targetId"`
	Code                string  `json:"code"`
	Confidence          float64 `json:"confidence"`
	ProjectionOrdinal   string  `json:"projectionOrdinal"`
	RelationshipVersion string  `json:"relationshipVersion,omitempty"`
	ContentDigest       string  `json:"contentDigest"`
}

type SemanticProjectionRequest struct {
	Scope          Scope                 `json:"scope"`
	Projection     ProjectionIdentity    `json:"projection"`
	ManifestStatus string                `json:"manifestStatus"`
	Source         SemanticSourceBinding `json:"source"`
	Vertices       []SemanticVertex      `json:"vertices"`
	Edges          []SemanticEdge        `json:"edges"`
}

type SemanticProjectionReceipt struct {
	Projection           ProjectionIdentity `json:"projection"`
	ProjectedVertexCount int                `json:"projectedVertexCount"`
	ProjectedEdgeCount   int                `json:"projectedEdgeCount"`
}

type SemanticQueryBudget struct {
	MaxAssertions   int `json:"maxAssertions"`
	MaxTargets      int `json:"maxTargets"`
	MaxTraceSteps   int `json:"maxTraceSteps"`
	TimeoutMS       int `json:"timeoutMs"`
	MaxPayloadBytes int `json:"maxPayloadBytes"`
}

type SemanticQueryRequest struct {
	Scope     Scope               `json:"scope"`
	AssetType string              `json:"assetType"`
	AssetID   string              `json:"assetId"`
	Budget    SemanticQueryBudget `json:"budget"`
}

type SemanticAssertionResult struct {
	AssertionID      string  `json:"assertionId"`
	SemanticIdentity string  `json:"semanticIdentity"`
	Layer            string  `json:"layer"`
	Confidence       float64 `json:"confidence"`
}

type SemanticTarget struct {
	UnitIdentity  string `json:"unitIdentity"`
	Layer         string `json:"layer"`
	CanonicalName string `json:"canonicalName"`
}

type SemanticTargets struct {
	BIZ  []SemanticTarget `json:"BIZ"`
	SYS  []SemanticTarget `json:"SYS"`
	TECH []SemanticTarget `json:"TECH"`
}

type SemanticTraceStep struct {
	RelationshipIdentity   string `json:"relationshipIdentity"`
	SourceSemanticIdentity string `json:"sourceSemanticIdentity"`
	TargetSemanticIdentity string `json:"targetSemanticIdentity"`
	RelationCode           string `json:"relationCode"`
}

type SemanticQueryResult struct {
	Status            string                    `json:"status"`
	Source            string                    `json:"source"`
	Projection        ProjectionIdentity        `json:"projection"`
	MappingMode       string                    `json:"mappingMode"`
	Assertions        []SemanticAssertionResult `json:"assertions"`
	Targets           SemanticTargets           `json:"targets"`
	TracePath         []SemanticTraceStep       `json:"tracePath,omitempty"`
	Reason            string                    `json:"reason,omitempty"`
	Partial           bool                      `json:"partial"`
	TruncationReasons []string                  `json:"truncationReasons"`
}

type SemanticClient interface {
	ProjectSemantic(context.Context, SemanticProjectionRequest) (SemanticProjectionReceipt, error)
	QueryArchitecture(context.Context, SemanticQueryRequest, ProjectionIdentity) (SemanticQueryResult, error)
}

type ActiveManifestResolver interface {
	ResolveActive(context.Context, Scope) (ProjectionIdentity, error)
}
