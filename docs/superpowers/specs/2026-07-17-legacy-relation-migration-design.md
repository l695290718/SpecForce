# Legacy Relation Migration

## Purpose

Historical SpecForge AssetLinks use product vocabulary that predates the strict relationship ontology. The migration must preserve intent without weakening scope isolation, typed impact analysis, or MCP-only persistence.

## Decision

Introduce an explicit, versioned legacy relation migration registry. The registry is the sole compatibility boundary between historical AssetLink vocabulary and canonical relationship codes. Seed and import flows normalize links through the registry before MCP persistence and ontology validation.

## Registry Contract

Each mapping contains a legacy relation type, allowed source and target asset types, one or more canonical output relationships, direction, description transformation, ADR ID, and deprecation status. A mapping may split one legacy link into multiple canonical relationships. It may not silently drop a link or broaden a relationship ontology definition.

Mappings initially cover:

| Legacy relation | Canonical output | Rule |
| --- | --- | --- |
| `reads-writes` | `READS`, `WRITES` | Split into two asset-identical facts with explicit descriptions. |
| `calls` | `CONSUMES` or `PROVIDES` | Resolve only from explicit source/target role metadata; otherwise block as ambiguous. |
| `contains` for API contracts | `CONTAINS` | Preserve as API-contract aggregation. |
| `writes` or `reads` against a data model | `WRITES` or `READS` | Preserve as aggregate-model access; entity/field links remain the preferred precision. |

## Failure Behavior

Unknown, ambiguous, scope-mismatched, or ontology-invalid links fail before persistence. The caller records a bilingual backlog fact containing the original relation, source, target, reason, owner, and retry trigger. The seed/import run returns a non-zero status and cannot claim completion.

## Consistency Controls

- Registry tests cover every mapping and ambiguity case.
- Seed tests require all historical links to normalize into ontology-valid canonical links.
- MCP integration tests prove normalized links are written through `link_assets` and are queryable in the scoped asset graph.
- CI rejects unregistered legacy vocabulary and registry entries without ADR evidence.
- The migration registry itself is represented as a bilingual ADR, Proposal link, business rule, and typed asset relationships through MCP.

## Scope

The first implementation operates only on self-design seed AssetLinks in `com.huawei.celon.desiner`. It does not introduce a generic cross-enterprise migration service or loosen the existing ontology for unknown relationships.
