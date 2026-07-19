# Federation Hardening Slice 2D

## Scope

This slice makes audit repair operational through a protected MCP maintenance tool and completes the bilingual synchronization-blocked design fact. It does not change federation outbox, connector, or source-version behavior.

## Implemented

- Registered `retry_federated_audit_finalization` as an audited MCP maintenance tool.
- The tool requires authenticated `asset:read`, `asset:write`, and `governance:run` claims plus exact application-service read/write Scope grants.
- Retry requests bind the target audit to the exact Scope persisted in its Scope-first audit input summary. Missing or cross-Scope audit records fail closed, so callers cannot retry arbitrary audit IDs from another Scope.
- Successful repair and repeated repair are idempotent. The maintenance invocation itself receives durable audit creation/finalization.
- Added `localizedContent.en` and `localizedContent.zh` to the federated design-fact manifest record, and recorded owner, reason, and retry trigger in the manifest, `docs/TODO.md`, and ADR-0010.

## Evidence

- `$vitest = (Resolve-Path 'node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs').Path; node $vitest run src/federation/tools.test.ts src/federation/persistence.test.ts --root apps/mcp-server` passed: **2 files, 80 tests passed**.
- `$vitest = (Resolve-Path 'node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs').Path; node $vitest run scripts/design-fact-manifest.test.ts --root .` passed: **3 tests passed**.
- `pnpm --filter @specforge/core typecheck` passed.
- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `git diff --check` passed.
- Baseline manifest JSON parsed successfully.

## MCP Synchronization Blocked

**Owner:** SpecForge Architecture.

**Reason:** `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are absent, so MCP persistence and read-back cannot be verified.

**Retry trigger:** Configure reachable PostgreSQL and exact Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured federation check, then read back sync receipts, IDs, Scope, canonical English fields, Chinese overlays, links, and evidence. No synchronization success is claimed.

## 中文本地化状态

本轮已将审计修复接入受保护的 MCP 维护工具，并完成联邦同步阻塞事实的英文规范字段和中文覆盖。MCP 同步仍受阻；负责人是 SpecForge Architecture，原因是当前环境缺少 `DATABASE_URL`、`SPECFORGE_APPLICATION_SERVICE_ID` 和 `SPECFORGE_SCOPE_PATH`。配置 PostgreSQL 和精确 Scope 后，运行同步、检查、联邦检查并回读同步收据，是允许重试的条件。
