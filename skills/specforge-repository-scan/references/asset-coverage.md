# Asset Coverage

The scanner produces deterministic source observations first. The calling Agent adds semantic candidates only after reading the bounded evidence returned for the exact application-service Scope.

| Family | Typical deterministic evidence | Semantic handoff |
| --- | --- | --- |
| `api` | OpenAPI, GraphQL, Protobuf, framework routes | operation identity, behavior, auth and compatibility |
| `dataModel` | Prisma, SQL, ORM declarations, typed entities | business meaning, invariants and relationships |
| `event` | AsyncAPI, broker calls, consumers/producers | event semantics, ordering and delivery guarantees |
| `businessRule` | validators, policy annotations, documented rules | canonical English and Chinese rule content |
| `stateMachine` | transition code, enum/state declarations, tests | states, transitions and guards |
| `integration` | deployment, config, outbound clients and dependencies | dependency purpose and ownership |
| `quality` / `observability` | tests, alerts, metrics, tracing and logs | quality intent and operational expectations |
| `adr` / `proposal` / `contextPack` | explicitly marked authored documents | preserve declared status; do not infer approval |
| `typedRelationship` | source references and contract/entity links | submit directional relationship candidates |

`UNSUPPORTED` or extractor failure for a required capability blocks the scan. `NOT_APPLICABLE` remains visible and does not block. A deterministic observation is never an accepted design fact by itself.
