# Parallel Governance Workstreams Design

**Status:** Approved for implementation planning after exact-Scope preflight; implementation is not complete.

**Design Change Session:** `design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb`

**Owning Scope:** `com.huawei.celon.desiner`

**Scope Path:** `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Intent

Advance three independent governance increments while preserving the existing MCP-only write boundary, exact application-service isolation, PostgreSQL authority, and fail-closed behavior:

1. establish a provider-neutral production `ScopedPrincipal` authorization boundary;
2. add a provider-neutral CodeHub/CI attestation verification contract without claiming a CodeHub adapter;
3. reconcile stale backlog and bilingual design-fact documentation with the implemented Phase 3 state.

## Parallelization Boundary

The identity and attestation workstreams may proceed in parallel because they communicate through stable interfaces only. Identity owns principal construction and grant evaluation. Attestation consumes an injected principal and a verified repository/Scope binding; it must not own token parsing or provider-specific identity logic. Documentation reconciliation is independent and may proceed in parallel as a repository-only record update, but it must not mark runtime capabilities complete.

NebulaGraph live projection and authorized multi-service comparison remain outside this batch. The former requires external runtime evidence; the latter depends on the production authorization contract.

## Workstream A: ScopedPrincipal Authorization

Introduce a provider-neutral principal model containing actor type, stable subject, tenant, granted application-service Scopes, actions, credential provenance, and an authorization decision reference. The MCP HTTP boundary may authenticate a bearer credential through an injected verifier, but persistence and tools receive only the normalized principal. Development seed claims remain explicitly development-only.

Authorization rules:

- exact `applicationServiceId` and `scopePath` are required for every operation;
- parent or sibling Scope grants do not authorize a child operation;
- read, write, governance, and graph permissions remain distinct;
- missing, malformed, expired, revoked, or provider-unavailable credentials fail closed;
- every allow or deny decision is auditable without persisting raw credentials;
- a token may grant multiple application services, but each operation evaluates one exact Scope.

The first increment supplies the contract, verifier port, claims normalization, decision evidence, and tests. It does not select an enterprise IdP or implement OAuth discovery.

## Workstream B: CodeHub/CI Attestation Contract

Add a provider-neutral verification service for a CI job to validate a committed tree against one or more short-lived SpecForge Change Attestations. It reuses the existing Ed25519 payload and exact-Scope semantics.

Required checks:

- repository identity, commit/tree digest, Scope mapping, and multi-Scope coverage;
- signature, key status, expiry, revocation, and policy version;
- valid converged Design Change Session and complete evidence;
- detection of missing proof and local-hook bypass through committed-tree recomputation;
- deterministic failure codes and redacted audit diagnostics.

This increment exposes a stable CI verification contract and local fixture tests. CodeHub/CodeArts API calls, protected-branch status registration, and external merge blocking remain deferred backlog facts.

## Workstream C: Design-Fact Reconciliation

Update repository records so English canonical statements and complete Chinese overlays agree with the actual delivery state:

- Phase 3 continuous-observation governance core is complete;
- live connectors, polling/webhooks, automatic promotion, outbound proposals, external `APPLY`, and capacity certification remain deferred;
- CodeHub enforcement remains deferred while the provider-neutral contract is developed;
- the canonical Docker PostgreSQL authority is `localhost:15433/specforge_canonical` through the existing tunnel;
- transient MCP synchronization failures remain tracked with owner, retry trigger, and evidence.

No documentation update may claim a production connector, external merge gate, or Nebula projection closure without its own implementation, verification, MCP synchronization, and read-back evidence.

## Non-Goals

- no direct database writes from Web, CLI, or CI;
- no cross-Scope data join or comparison view;
- no real enterprise identity-provider integration in this increment;
- no CodeHub/CodeArts deployment or protected-branch configuration;
- no graph-store authority change;
- no automatic promotion of observed facts.

## Acceptance Criteria

1. Scoped principal normalization and exact-Scope authorization tests pass for missing, parent, sibling, multi-Scope, read/write, and revoked-credential cases.
2. CI attestation verification tests pass for valid proof, stale tree, missing Scope coverage, invalid signature, expired/revoked key, non-converged session, and `--no-verify` fixture cases.
3. Repository records are bilingual, internally consistent, and identify deferred production capability separately from verified local behavior.
4. Focused commands and results are recorded in the matching ADR/Evidence assets.
5. The same design-change session is closed through MCP as `CONVERGED` only after implementation, tests, MCP synchronization, and read-back succeed.

## 中文说明

本设计在保持 MCP-only 写入、精确应用服务 Scope 隔离、PostgreSQL 权威和失败即阻断的前提下，推进三条可并行治理增量：生产 `ScopedPrincipal` 权限边界、与 CodeHub/CI 对接无关的变更证明校验契约，以及设计事实清单和双语文档对齐。

身份权限负责主体标准化和授权决策；Attestation 只消费标准化主体和仓库/Scope 绑定，不负责解析具体身份提供商。CodeHub/CodeArts 真实适配器、受保护分支配置和外部合入阻断仍是独立待办。NebulaGraph 实时投影和跨应用服务比较也不属于本批次。

所有英文规范字段必须存在，面向人的决策内容必须提供完整中文覆盖。只有实现、验证、MCP 同步和回读全部完成，才能关闭同一 Design Change Session 为 `CONVERGED`。
