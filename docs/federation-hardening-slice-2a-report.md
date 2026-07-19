# Federation Hardening Slice 2A Report

## Status

Implemented and locally verified. This slice is limited to candidate-bound promotion and MCP permission authorization. Outbox, connector-state, and observation-version hardening remain deferred to the next slice.

## Implemented

- `promote_candidate_fact` now accepts only `candidateId`, `approvalReason`, and exact `architectureScope` at the public boundary. Any additional caller key is rejected with `CANDIDATE_INPUT_UNSUPPORTED`.
- Promotion derives the canonical envelope from the persisted candidate observation, including canonical payload, complete bilingual `en`/`zh` localization, digest, source provenance, mapped `assetId`, policy authority, and exact Scope. Candidate digest, provenance, mapping, authority, and localization mismatches fail closed.
- MCP authorization now requires every declared permission claim and the corresponding exact Scope grant. Reconciliation requires both `asset:read` and `governance:run`; writes require `asset:write`; reads require `asset:read`.
- MCP observation digest construction excludes the embedded localization overlay from the canonical payload digest so the persisted candidate can be promoted without caller-provided canonical content.

## TDD Evidence

- Red tests covered caller payload/digest/localization overrides, incomplete candidate localization, missing mapped `assetId`, candidate provenance/digest mismatch, public promotion schema authority, and missing permission claims with valid Scope grants.
- Green tests verify durable audit handling remains active for denied and failed MCP calls.

## Final Verification

- `node .\\node_modules\\vitest\\vitest.mjs run packages\\core\\src\\__tests__\\federation.test.ts scripts\\reconcile-federated-facts.test.ts apps\\mcp-server\\src\\federation\\persistence.test.ts apps\\mcp-server\\src\\federation\\tools.test.ts`: passed 4 files, 101 tests.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `pnpm --filter @specforge/core typecheck`: passed.
- `git diff --check`: passed with only Windows line-ending warnings.

## Environment Boundary

Live PostgreSQL/MCP synchronization checks were not run because the configured database and MCP environment are unavailable. This report does not claim overall federation hardening completion.

### 中文本地化

本轮仅完成候选事实绑定提升和 MCP 权限声明校验，未开始 Outbox、连接器状态或观察版本加固。公共提升工具只接受候选 ID、审批理由和精确 Scope；正式信封、双语内容、摘要、来源、资产映射和权威策略均由持久化候选派生。每项声明权限都必须同时存在于认证声明和精确 Scope 授权中。聚焦测试 101 个通过，两个包的类型检查通过；由于环境不可用，未声明真实 PostgreSQL/MCP 同步完成。
