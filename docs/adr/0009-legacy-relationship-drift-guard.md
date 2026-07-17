# ADR-0009: Legacy Relationship Drift Guard

Status: Accepted

## Context

Relationship labels in seed data are a design fact. MCP seed normalization protects the write path, but a newly introduced historical label could otherwise remain undiscovered until a database seed runs.

## Decision

Provide a repository check that evaluates every self-design AssetLink against the versioned legacy migration registry before MCP persistence. The check emits a structured report containing the registry version, inspected-link count, and every unknown or ambiguous relation. It fails closed when any unsupported relation is found and is available as a package command for local development and CI.

## Consequences

The relationship ontology and migration registry remain the sole vocabulary authority. A seed author must either use a canonical relation or add an ADR-backed, tested migration rule before adding a historical label. MCP remains the only system write boundary.

## 中文说明

设计数据中的关系词属于设计事实。新增漂移检查器会在 MCP 写入前核对每条种子关系，输出包含迁移版本、检查数量及未知/歧义关系的结构化报告；发现未登记关系即失败。新增历史关系必须先补充经过测试且有 ADR 依据的迁移规则。
