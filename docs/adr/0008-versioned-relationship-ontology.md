# ADR-0008: Versioned Relationship Ontology

Status: Accepted

## Context

SpecForge self-design data contains historical relation labels such as `calls`, `records`, and `emitted-by`. Rejecting these labels during MCP seeding leaves the design graph incomplete. Accepting them without an ontology would make endpoint validation and impact analysis unreliable.

## Decision

Adopt `specforge.relationships.v2`. It adds constrained canonical codes for API invocation, event persistence and origin, integration connectivity, requirements, state-machine use, and proposal implementation links. The MCP migration registry maps historical labels to these canonical codes. Every canonical relation has explicit endpoint types and propagation semantics.

## Consequences

Seed data continues to enter through MCP and is validated against the ontology. Unsupported legacy labels fail closed. Consumers must retain the ontology version with persisted graph data so future migrations are explicit.

## 中文说明

采用 `specforge.relationships.v2`。历史关系词通过 MCP 迁移注册表归一化为受端点约束、具备影响传播语义的正式关系码；未登记的关系仍然直接拒绝，避免图谱出现不可解释的边。
