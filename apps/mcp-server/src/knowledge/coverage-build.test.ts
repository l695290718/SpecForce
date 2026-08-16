import { describe, expect, it } from "vitest";
import { createCoverageBuildService } from "./coverage-build.js";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const request = { architectureScope: scope, baselineId: "baseline-v6", generationId: "generation-1", profileId: "generic-system", profileVersion: "2", coverageSchemaVersion: "coverage.v1", catalogVersion: 12n, catalogDigest: "catalog-digest", relationshipVersion: "7", relationshipDigest: "relationship-digest", query: { assetTypes: ["api"] } };

describe("coverage build submission", () => {
  it("creates and reuses an exact-Scope build by immutable input key", async () => {
    const jobs: any[] = [];
    const client = {
      knowledgeBaseline: { findUnique: async () => ({ status: "PUBLISHED", publishedAt: new Date() }) },
      architectureCoverageBuildJob: {
        findUnique: async ({ where }: any) => jobs.find((job) => where.applicationServiceId_scopePath_buildKey ? job.applicationServiceId === where.applicationServiceId_scopePath_buildKey.applicationServiceId && job.scopePath === where.applicationServiceId_scopePath_buildKey.scopePath && job.buildKey === where.applicationServiceId_scopePath_buildKey.buildKey : job.id === where.applicationServiceId_scopePath_id.id) ?? null,
        create: async ({ data }: any) => { const row = { dbId: "db-1", attempt: 1, rowCount: 0, coveredCount: 0, blockedCount: 0, notEvaluatedCount: 0, checkpoint: {}, ...data }; jobs.push(row); return row; }
      }
    } as any;
    const service = createCoverageBuildService({ client, authorizeScope: (value) => value, ensureSchema: async () => undefined });

    const first = await service.request(request);
    const second = await service.request(request);

    expect(first).toMatchObject({ applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, status: "QUEUED", idempotent: false });
    expect(second).toMatchObject({ jobId: first.jobId, buildKey: first.buildKey, idempotent: true });
    expect(jobs).toHaveLength(1);
  });

  it("rejects a profile outside the governed generic-system policy", async () => {
    const service = createCoverageBuildService({ authorizeScope: (value) => value, ensureSchema: async () => undefined, client: { knowledgeBaseline: { findUnique: async () => null } } as any });
    await expect(service.request({ ...request, profileId: "custom-profile" })).rejects.toThrow("COVERAGE_PROFILE_UNSUPPORTED");
  });

  it("does not allow a forged scope path to pass authorization", async () => {
    const service = createCoverageBuildService({ authorizeScope: () => { throw new Error("SCOPE_MISMATCH"); }, ensureSchema: async () => undefined, client: {} as any });
    await expect(service.request({ ...request, architectureScope: { ...scope, scopePath: "other/service" } })).rejects.toThrow("SCOPE_MISMATCH");
  });
});
