# Idempotent Projection Publication Evidence

- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:9a29d910-4fca-4c94-beaa-f2fa96fbc512`
- Related ADR: `adr-readable-3a-architecture-mapping`

## Decision

`ProjectionManifest` publication is immutable and idempotent within the exact application-service Scope. Same-content retries reuse the existing row; content-identity conflicts fail closed. PostgreSQL remains authoritative and graph projections remain derived.

## Verification

| Check | Result |
|---|---|
| `pnpm exec vitest run apps/knowledge-projector/src/repository.test.ts` | PASS: 1 file, 7 tests |
| `pnpm --filter @specforge/knowledge-projector typecheck` | PASS |
| `git diff --check` | PASS |
| Docker projector build with `NPM_REGISTRY=https://registry.npmmirror.com` | PASS |
| Projector health endpoint | HTTP 200; current v6 build `READY` |
| New duplicate `P2002` after projector restart | NONE observed |
| `POST http://localhost:3010/api/architecture/3a/query` using exact v6 identity | HTTP 200; `availability=READY`, `source=ARCHITECTURE_UNIT_PROJECTION` |

## Health supersession follow-up

The original health response was `HTTP 200`, `status=degraded`, `failed=4` because it counted four historical v1 attempts. The health query now counts unresolved failed `buildKey` values only when no later same-profile, same-schema `READY` job exists. After rebuilding and restarting the Docker projector:

- `pnpm exec vitest run apps/knowledge-projector/src/repository.test.ts` -> PASS: 1 file, 9 tests.
- `pnpm --filter @specforge/knowledge-projector typecheck` -> PASS.
- Projector health -> HTTP 200, `status=ok`, `code=OK`, `failed=0`, `queued=0`, `building=0`.
- 3A `unitGraph` read-back -> HTTP 200, `availability=READY`, 50 nodes and 48 edges.

## Operational interpretation

The health summary still reports `degraded` because four historical failed build attempts remain stored for diagnosis. They are not the current v6 publication. The current v6 manifest is `projection-manifest:projection-generation:a5f2d9f6895b032648c4cab7dff81462aa36e2e9a406fffdec94562f7bd092ac:1`, bound to `knowledge-baseline:designer:3a:v6` and generation `projection-generation:a5f2d9f6895b032648c4cab7dff81462aa36e2e9a406fffdec94562f7bd092ac:1`.

## 幂等投影发布证据

本次变更在精确的 Designer 应用服务 Scope 内完成。相同内容重试复用已有 Manifest，内容身份冲突拒绝覆盖；PostgreSQL 仍是权威存储，图投影仍是派生结果。测试、类型检查、差异检查、Docker 投影器构建和 3010 端口的 3A HTTP 读回均通过。健康摘要中的 `degraded` 仅表示数据库中保留了 4 条历史失败构建记录；当前 v6 构建为 `READY`。

健康状态后续修复后，投影器返回 `status=ok`、`failed=0`；历史 v1 失败不再阻塞当前 v6 的可用性。
