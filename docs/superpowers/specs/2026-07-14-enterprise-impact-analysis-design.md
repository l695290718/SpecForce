# SpecForge Enterprise Relationship and Impact Analysis Design

Date: 2026-07-14

Status: Approved design

## 1. Purpose

SpecForge treats relationship-driven impact analysis as a primary product capability. The system must explain how a proposed design change propagates across APIs, data models, entities, fields, events, rules, state machines, quality requirements, observability designs, ADRs, and application services.

The target is an enterprise deployment on Huawei private cloud or on-premises Kubernetes. A production installation may contain hundreds of millions of relationships. The design must therefore support horizontal graph-query scale, exact application-service Scope isolation, auditable MCP writes, explainable impact paths, and recoverable projections.

The first delivery analyzes design assets inside one authorized application-service Scope. Authorized cross-service traversal remains a later feature, but all contracts must carry an explicit allowed Scope set so that the boundary can be extended without redesigning the engine.

## 2. Current-State Assessment

The current implementation provides a useful foundation but not transitive impact analysis:

- PostgreSQL `AssetLink` rows store string source and target identifiers, a free-form relationship type, and exact Scope columns.
- The graph builder derives some edges from asset payloads and appends persisted `AssetLink` edges.
- Proposal impact analysis reads only the Proposal's explicit `impactedAssets` list.
- Governance, affected domains, risk level, and implementation tasks are calculated only for those directly declared assets.
- Persisted relationships are not traversed to discover indirect impact.

This creates four limitations:

1. Asset JSON references and `AssetLink` records form two relationship sources with no unified lifecycle.
2. Relationship type, direction, propagation, provenance, confidence, and validity are not governed by an ontology.
3. Nested structures such as data entities, fields, and API operations are not independently addressable graph nodes.
4. Impact results do not contain path evidence, graph version, truncation state, or a reproducible authorization snapshot.

## 3. Design Principles

1. English technical codes are canonical. Chinese is presentation content only.
2. A relationship fact and an impact propagation rule are different concepts.
3. PostgreSQL is the transactional source of truth; the graph database is a rebuildable query projection.
4. Every graph operation is Scope-constrained before traversal and verified again after traversal.
5. Complete analysis means the reachable graph was exhausted under the approved propagation rules. Budget exhaustion must return `PARTIAL`, never a false complete result.
6. Every impact conclusion must be explainable by one or more typed paths.
7. Domain services depend on a `GraphStore` contract, not nGQL, Cypher, or SQL.
8. The enterprise design is benchmarked against representative graph shape and skew, not only total edge count.

## 4. Relationship Ontology

Relationships use stable English codes and a canonical fact direction. Propagation may follow the fact direction, the reverse direction, both, or neither.

| Code | Canonical fact direction | Default propagation |
| --- | --- | --- |
| `OWNS` | Domain to Asset | Aggregate only; terminal |
| `PROVIDES` | Service to API | Strong, both directions |
| `CONSUMES` | Service to API | API change propagates to consumer |
| `READS` | API or Service to Entity | Entity change propagates to reader |
| `WRITES` | API or Service to Entity | Strong, both directions |
| `REFERENCES` | Entity to Entity | Medium, both directions |
| `CONTAINS` | DataModel to Entity or Field | Both directions |
| `EMITS` | Service or API to Event | Strong, both directions |
| `SUBSCRIBES` | Service to Event | Event change propagates to subscriber |
| `CARRIES` | Event to Entity or Field | Both directions |
| `GOVERNS` | Rule to Asset | Asset change includes governing rule |
| `CONTROLS` | StateMachine to Entity or API | Both directions |
| `VERIFIES` | Quality requirement to Asset | Include as context; terminal |
| `OBSERVES` | Observability design to Asset | Include as context; terminal |
| `DECIDES` | ADR to Asset | Include as context; terminal |
| `IMPACTS` | Proposal to Asset | Analysis root |
| `GENERATES` | Proposal to ContextPack | No propagation |

Each ontology definition contains:

```text
code
allowedSourceTypes
allowedTargetTypes
forwardPropagation
reversePropagation
strength
defaultConfidence
terminal
description
version
```

The traversal engine reads ontology definitions. It does not hard-code a switch statement for individual relationship codes.

## 5. Addressable Graph Model

`DesignAsset` remains the aggregate and bilingual content source. `AssetNode` makes the aggregate and important nested elements independently addressable.

Examples:

```text
dataModel/customer-model
dataEntity/customer-model.Customer
dataField/customer-model.Customer.email
api/customer-query
apiOperation/customer-query.GET./customers/{id}
event/customer-updated
businessRule/customer-email-format
```

### 5.1 AssetNode Registry

```text
dbId UUID
enterpriseId
applicationServiceId
scopePath
nodeType
logicalId
rootAssetType
rootAssetId
parentNodeId
nodePath
displayName
metadata JSONB
version
lifecycleStatus
createdAt
updatedAt
```

The logical uniqueness constraint is:

```text
(enterpriseId, applicationServiceId, scopePath, nodeType, logicalId)
```

The graph vertex key is a deterministic hash of the same identity. Original identity fields remain vertex properties for explanation, auditing, and collision verification.

### 5.2 Relationship Current State

```text
dbId UUID
enterpriseId
applicationServiceId
scopePath
sourceNodeId UUID
targetNodeId UUID
relationType
strength
confidence
source
sourceReference
validFrom
validTo
version
metadata JSONB
createdAt
updatedAt
```

Source values include `mcp`, `asset-parser`, `openapi`, `asyncapi`, `manual`, and future runtime collectors. Foreign keys guarantee endpoint integrity in PostgreSQL.

Current relationships are partitioned first by enterprise or architecture tenancy and then by a key that distributes source-node write and read load. The final partition count is selected by benchmark and deployment capacity, not fixed in the domain model.

### 5.3 Relationship History

`RelationshipEvent` is append-only and time-partitioned. It records create, update, invalidate, and delete operations with actor, channel, prior version, new version, and correlation identifiers. Retention policy may archive old partitions to enterprise object storage while preserving replayability.

## 6. Enterprise Storage Architecture

The production architecture uses PostgreSQL as the transaction and audit source and NebulaGraph as the distributed graph-query projection.

```text
MCP / Parser / Importer
        |
RelationshipCommandService
        |
        +--> PostgreSQL
        |      DesignAsset
        |      AssetNodeRegistry
        |      RelationshipCurrent
        |      RelationshipEvent
        |      TransactionalOutbox
        |
        +--> Outbox event
                  |
             GraphProjector
                  |
             NebulaGraph
                  |
          GraphQueryService
                  |
        ImpactAnalysisService
```

NebulaGraph is selected for the approved deployment profile because it is an open-source, distributed, shared-nothing graph store with partitioned storage, Multi Group Raft, high availability, and private-cluster deployment support.

One Space is used per enterprise environment or per product-family environment. A Space is not created for every application service. Vertices and edges always carry enterprise, Scope, type, version, and provenance properties.

PostgreSQL remains sufficient for development, automated tests, and small installations through `PostgresGraphStore`. Enterprise production uses `NebulaGraphStore`.

## 7. Projection and Consistency

The relationship command and outbox event are committed in one PostgreSQL transaction. `GraphProjector` consumes events and performs idempotent vertex and edge updates.

Projection state includes:

```text
partitionId
lastEventId
projectionVersion
projectedAt
status
error
```

Every impact request declares a `requiredGraphVersion` derived from its change set:

- If the graph checkpoint has reached that version, analysis starts immediately.
- If the graph is slightly behind, the request may wait within a bounded interval.
- Otherwise, it becomes an asynchronous analysis job.
- The result records the actual graph checkpoint used.

No code path silently reads stale graph data and labels the result current. Rebuild consists of a PostgreSQL current-state snapshot followed by RelationshipEvent replay from the snapshot checkpoint.

## 8. Scope Authorization

NebulaGraph is never exposed directly to Web, MCP, or Agent clients. Only `GraphQueryService` has database credentials.

Every traversal plan contains a non-empty `allowedScopes` set. For the first delivery, that set contains exactly the selected application service. Authorization runs before query compilation. The graph adapter compiles Scope predicates into the graph query and validates every returned vertex and edge again.

```text
Agent / Web / MCP
       |
Architecture Authorization
       |
TraversalPlan with allowedScopes
       |
GraphQueryService
       |
NebulaGraphStore
```

An unauthorized Scope discovered in input, traversal, or output terminates the request and creates a security audit event. Filtering a global result after traversal is prohibited because it leaks existence and wastes capacity.

## 9. GraphStore Contract

Domain services issue engine-neutral plans:

```ts
interface GraphTraversalPlan {
  startNodes: NodeKey[];
  allowedScopes: ScopeRef[];
  relationRules: RelationTraversalRule[];
  maxDepth: number;
  maxNodes: number;
  maxPaths: number;
  graphVersion?: number;
}
```

Implementations are:

- `NebulaGraphStore` for enterprise production;
- `PostgresGraphStore` for development and small deployments;
- `InMemoryGraphStore` for deterministic unit tests.

The contract returns nodes, typed edges, evidence paths, frontier information, graph version, elapsed time, and truncation reasons.

## 10. Impact Analysis Pipeline

### 10.1 Change Normalization

A Proposal is normalized into changed nodes and typed changes:

```text
ADD
MODIFY
DELETE
RENAME
TYPE_CHANGE
CONSTRAINT_CHANGE
SECURITY_CHANGE
BEHAVIOR_CHANGE
```

The normalized record includes changed fields, previous and proposed versions, compatibility classification, and explicit roots.

### 10.2 Traversal Planning

The planner combines:

- explicit change roots;
- authorized Scope;
- ontology version;
- change-specific propagation rules;
- asset criticality;
- execution mode and budgets;
- required graph version.

The engine analyzes the complete reachable chain under those rules. Hop count is not the business boundary.

### 10.3 Execution Modes

Interactive preview:

- renders two degrees initially;
- has a three-second request budget;
- has a default 1,000-node budget;
- returns `PARTIAL` when any budget is exceeded;
- permits progressive expansion.

Full analysis:

- executes asynchronously;
- follows the complete reachable chain;
- has a configurable defensive maximum depth, initially 12;
- supports cancellation, retry, checkpointing, and resumable frontier processing;
- uses deployment-specific node and path budgets.

The depth of 12 is a safety guard, not a completeness claim. Reaching it produces a truncated result and records the unexplored frontier.

### 10.4 Impact Evaluation

Impact is determined by change semantics and relationship semantics, not distance alone. Results use these certainty classes:

- `DIRECT`: explicitly changed by the Proposal;
- `DEFINITE`: propagation rules determine impact;
- `POSSIBLE`: a valid path exists but human confirmation is required;
- `CONTEXTUAL`: relevant rule, ADR, quality, or observability context;
- `NOT_IMPACTED`: explicitly excluded by a rule.

Risk combines change breaking level, relation strength, asset criticality, confidence, governance failures, and ownership. Distance may influence confidence but never automatically eliminates a strong dependency.

### 10.5 Explainability

Each impacted node stores one primary path and up to three alternative evidence paths:

```text
node
impactLevel
certainty
depth
primaryPath
alternativePaths
matchedRules
confidence
recommendedActions
owner
scope
```

Path deduplication prevents repeated nodes in one path. Alternative paths are ranked by certainty, strength, confidence, and length.

## 11. Impact Analysis Persistence

`ImpactAnalysisRun` records:

```text
id
proposalId
applicationServiceId
status
stopReason
assetVersion
relationshipVersion
ontologyVersion
requiredGraphVersion
actualGraphCheckpoint
authorizationSnapshot
budgets
startedAt
completedAt
summary
unexploredFrontierCount
```

Statuses include `QUEUED`, `WAITING_FOR_PROJECTION`, `RUNNING`, `COMPLETE`, `PARTIAL`, `FAILED`, and `CANCELLED`.

Result nodes and paths may be stored in normalized result tables for query and export, with a compact JSON snapshot retained for reproducibility.

## 12. Service Boundaries

### RelationshipOntologyService

Owns relationship type definitions, endpoint constraints, propagation semantics, and ontology versions.

### RelationshipCommandService

Validates MCP commands, node identity, Scope, endpoint compatibility, and provenance. Writes PostgreSQL current state, event history, and outbox atomically.

### GraphProjector

Consumes outbox events, updates NebulaGraph idempotently, reports lag, and maintains checkpoints.

### GraphQueryService

Authorizes and compiles traversal plans, executes bounded graph queries, validates output Scope, and returns engine-neutral paths.

### ImpactAnalysisService

Normalizes change sets, builds traversal plans, evaluates impact, persists runs, and exposes preview, asynchronous analysis, status, and explanation operations.

The modules may initially run in the existing monorepo and deployment, but their interfaces and ownership remain independent.

## 13. MCP Surface

The target MCP operations are:

```text
upsert_asset_relationship
delete_asset_relationship
get_asset_upstream
get_asset_downstream
preview_change_impact
analyze_change_impact
get_impact_analysis
explain_asset_impact
```

Writes require exact architecture Scope and produce audit records. Reads require `applicationServiceId`, resolve an authorized Scope set, and never default to a global graph.

## 14. Failure Semantics

| Condition | Required behavior |
| --- | --- |
| Projection behind required version | Wait briefly or queue analysis |
| NebulaGraph unavailable | `GRAPH_STORE_UNAVAILABLE`; retain retryable job |
| Query timeout | `PARTIAL` with frontier and timeout reason |
| Node budget exceeded | `NODE_BUDGET_EXCEEDED` |
| Path budget exceeded | Preserve node results and mark path truncation |
| Unauthorized Scope | Terminate and write security audit |
| Missing relationship endpoint | Reject write or place ingestion record in quarantine |
| Ontology version changed | Preserve old result; new run uses new version |
| Duplicate graph event | Idempotent no-op or version update |

There is no automatic fallback from enterprise graph traversal to an unbounded PostgreSQL recursive query during an outage.

## 15. Observability and SLOs

Required metrics include:

- outbox backlog and oldest-event age;
- projection lag and checkpoint by partition;
- edge write and replay throughput;
- graph query P50, P95, and P99 latency;
- traversed nodes, paths, depth, and frontier size;
- `PARTIAL` rate by stop reason;
- Scope authorization rejection count;
- hot graph partitions and storage skew;
- impact job queue time, completion rate, and retry rate.

Initial service objectives are:

```text
Projection lag P95 < 10 seconds
Two-degree preview P95 < 2 seconds
Background analysis job success > 99.9 percent
No acknowledged relationship event loss
Zero unauthorized traversal results
```

The values are release gates subject to validation on the target private-cloud topology.

## 16. Test and Capacity Strategy

1. Unit tests cover propagation direction, ontology validation, change classification, risk evaluation, cycle prevention, and truncation states.
2. Contract tests require PostgreSQL, NebulaGraph, and in-memory GraphStore implementations to return the same domain semantics for shared fixtures.
3. Integration tests cover transaction outbox, projection, checkpoints, replay, duplicate delivery, and rebuild.
4. Security tests cover same logical ID in different Scopes, unauthorized Scope input, mid-path unauthorized nodes, and output verification.
5. Failure tests cover graph-node loss, message duplication, delayed projection, timeouts, and interrupted resumable jobs.
6. Golden business scenarios cover API to Entity to Field to Event to Consumer paths and expected certainty classifications.
7. Capacity tests progress through 1 million, 10 million, and 100 million edges, including high-degree hubs, skewed Scope sizes, and worst-case depth.

Capacity acceptance records hardware, partition count, replication, graph shape, edge-property size, write rate, concurrent query profile, and cache state. A claim that the system supports 100 million relationships requires meeting preview latency, projection lag, and complete-analysis throughput targets on a representative dataset.

## 17. Delivery Boundary

The approved first delivery includes:

- relation ontology and versioned propagation policies;
- addressable nested asset nodes;
- PostgreSQL relationship current state, history, and outbox;
- GraphStore abstraction;
- NebulaGraph production adapter and PostgreSQL development adapter;
- idempotent graph projection and checkpointing;
- exact single-application-service Scope traversal;
- two-degree interactive preview and asynchronous complete analysis;
- explainable paths, partial-result semantics, audit, metrics, and scale tests.

The first delivery excludes:

- user-facing cross-application-service traversal;
- runtime tracing and deployment lineage collectors;
- source-code symbol extraction;
- automatic OpenAPI, AsyncAPI, and database-schema ingestion beyond the interfaces needed to add them later;
- graph algorithms unrelated to dependency and impact traversal.

## 18. Industry References

- DataHub Lineage Impact Analysis defaults to one degree to control expensive queries while supporting upstream and downstream dependency analysis: <https://docs.datahub.com/docs/act-on-metadata/impact-analysis>
- Neo4j documents variable-length paths and warns that broad, deep patterns can produce very large path sets; predicates should prune traversal: <https://neo4j.com/docs/cypher-manual/current/patterns/variable-length-paths/>
- PostgreSQL recursive CTEs support hierarchical and dependency traversal and remain suitable for the development adapter and bounded relational use cases: <https://www.postgresql.org/docs/current/queries-with.html>
- NebulaGraph Storage Service uses distributed partitions and Multi Group Raft for consistency and availability: <https://docs.nebula-graph.io/3.8.0/1.introduction/3.nebula-graph-architecture/4.storage-service/>
- OpenLineage separates runtime run events from design-time job and dataset metadata, informing future lineage collectors: <https://openlineage.io/docs/spec/object-model/>
