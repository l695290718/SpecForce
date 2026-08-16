import { describe, expect, it } from "vitest";
import { contentDigest } from "@specforge/core";
import { PrismaCoverageBuildRepository, type CoverageBuildJob, type CoverageProjectionRow } from "./coverage-repository.js";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/orders/service" };
const job: CoverageBuildJob = { ...scope, id: "job-1", buildKey: "build-key", baselineId: "baseline-v6", generationId: "generation-1", profileId: "generic-system", profileVersion: "2", coverageSchemaVersion: "coverage.v1", catalogVersion: "12", catalogDigest: "catalog-digest", relationshipVersion: "7", relationshipDigest: "relationship-digest", query: { assetTypes: ["api"] }, inputDigest: "input-digest", status: "BUILDING", attempt: 1, leaseOwner: "projector-1", checkpoint: {}, rowCount: 0, coveredCount: 0, blockedCount: 0, notEvaluatedCount: 0 };

function row(overrides: Partial<CoverageProjectionRow> = {}): CoverageProjectionRow {
  const base = { ...scope, generationId: job.generationId, baselineId: job.baselineId, manifestId: "coverage-manifest:generation-1", assetType: "api", assetId: "api-1", role: "MEMBERSHIP" as const, status: "COVERED" as const, pathEvidence: [], rowDigest: "row-1" };
  return { ...base, ...overrides };
}

function fakePrisma() {
  const storedRows = new Map<string, any>();
  const jobState: any = { ...job };
  const manifests = new Map<string, any>();
  const client: any = {
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(client),
    $queryRawUnsafe: async () => [],
    architectureCoverageBuildJob: {
      updateMany: async ({ where, data }: any) => {
        if (jobState.id !== where.id || jobState.leaseOwner !== where.leaseOwner || jobState.status !== where.status) return { count: 0 };
        Object.assign(jobState, data);
        return { count: 1 };
      },
      update: async ({ data }: any) => { Object.assign(jobState, data); return jobState; },
      findFirst: async () => jobState
    },
    architectureAssetCoverageProjection: {
      upsert: async ({ create, update }: any) => { const key = `${create.applicationServiceId}|${create.scopePath}|${create.generationId}|${create.assetType}|${create.assetId}`; const value = { ...(storedRows.get(key) ?? {}), ...update, ...create }; storedRows.set(key, value); return value; },
      findMany: async () => [...storedRows.values()].sort((left, right) => `${left.assetType}:${left.assetId}`.localeCompare(`${right.assetType}:${right.assetId}`))
    },
    architectureCoverageManifest: {
      findUnique: async ({ where }: any) => manifests.get(`${where.applicationServiceId_scopePath_id.applicationServiceId}|${where.applicationServiceId_scopePath_id.scopePath}|${where.applicationServiceId_scopePath_id.id}`) ?? null,
      create: async ({ data }: any) => { const value = { dbId: "manifest-db", ...data }; manifests.set(`${data.applicationServiceId}|${data.scopePath}|${data.id}`, value); return value; }
    }
  };
  return { client, storedRows, jobState, manifests };
}

describe("immutable coverage repository", () => {
  it("writes rows idempotently with complete exact-Scope identities", async () => {
    const fake = fakePrisma();
    const repository = new PrismaCoverageBuildRepository(fake.client);
    const first = row();
    expect(await repository.writeBatch(job, "projector-1", [first], { assetType: "api" })).toBe(true);
    expect(await repository.writeBatch(job, "projector-1", [first], { assetType: "api" })).toBe(true);
    expect(fake.storedRows).toHaveLength(1);
    expect(fake.jobState.rowCount).toBe(1);
  });

  it("rejects rows from another Scope before persistence", async () => {
    const repository = new PrismaCoverageBuildRepository(fakePrisma().client);
    await expect(repository.writeBatch(job, "projector-1", [row({ scopePath: "other/service" })])).rejects.toThrow("COVERAGE_ROW_SCOPE_MISMATCH");
  });

  it("publishes only when counts and immutable content digest close", async () => {
    const fake = fakePrisma();
    const repository = new PrismaCoverageBuildRepository(fake.client);
    const covered = row();
    const blocked = row({ assetId: "api-2", status: "BLOCKED", role: "TRACEABILITY", reasonCode: "MISSING_TYPED_PATH", rowDigest: "row-2" });
    await repository.writeBatch(job, "projector-1", [covered, blocked]);
    const digestRows = [covered, blocked].sort((left, right) => `${left.assetType}:${left.assetId}`.localeCompare(`${right.assetType}:${right.assetId}`));
    const digest = contentDigest({ scope, generationId: job.generationId, inputDigest: job.inputDigest, rows: digestRows.map((value) => ({ assetType: value.assetType, assetId: value.assetId, role: value.role, status: value.status, terminalMemberId: value.terminalMemberId ?? null, pathEvidence: value.pathEvidence ?? [], reasonCode: value.reasonCode ?? null, diagnosticRef: value.diagnosticRef ?? null, sourceDigest: value.sourceDigest ?? null, rowDigest: value.rowDigest })) });
    const manifest = await repository.publish(job, "projector-1", { inputDigest: job.inputDigest, contentDigest: digest, rowCount: 2, coveredCount: 1, blockedCount: 1, notEvaluatedCount: 0 });
    expect(manifest).toMatchObject({ ...scope, generationId: job.generationId, publicationState: "PUBLISHED", rowCount: 2, blockedCount: 1 });
    expect(fake.jobState.status).toBe("READY");
  });

  it("rejects a result whose input digest is not the leased job input", async () => {
    const repository = new PrismaCoverageBuildRepository(fakePrisma().client);
    await expect(repository.publish(job, "projector-1", { inputDigest: "different", contentDigest: "content", rowCount: 0, coveredCount: 0, blockedCount: 0, notEvaluatedCount: 0 })).rejects.toThrow("COVERAGE_INPUT_DIGEST_MISMATCH");
  });
});
