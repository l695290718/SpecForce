import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { contentDigest, type ArchitectureScopeRef } from "@specforge/core";
import { prisma } from "../persistence";
import { loadActiveSystemScanGovernance, publishSystemScanGovernanceRecord, upsertScopeScanRuntimeProfile } from "./governance-persistence";

const enabled = process.env.SPECFORGE_CONTINUOUS_INTEGRATION === "1";
const scope: ArchitectureScopeRef = { applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" };

describe.skipIf(!enabled)("system scan governance persistence", () => {
  const createdVersions: Array<{ kind: string; version: string }> = [];

  afterAll(async () => {
    for (const key of createdVersions) {
      await prisma.systemScanGovernanceRecord.delete({ where: { kind_version: key } });
    }
  });

  it("publishes an immutable version and returns an identical retry", async () => {
    const kind = "EXTRACTOR_CATALOG" as const;
    const payload = { budgets: { maxObservationsPerBatch: 500, maxBatchBytes: 1_000_000, maxExcerptBytes: 8192, maxSourceFileBytes: 10_000_000, maxObservationsPerSession: 100_000 } };
    const version = `test-${randomUUID()}`;
    const input = { id: `system:extractor-catalog:test:${randomUUID()}`, kind, version, payload, signature: "test-signature", keyId: "test-key" };
    createdVersions.push({ kind, version });
    const first = await publishSystemScanGovernanceRecord(input);
    const retry = await publishSystemScanGovernanceRecord(input);
    expect(retry.contentDigest).toBe(first.contentDigest);
    expect(first.contentDigest).toBe(contentDigest({ kind, version: "test-1", payload }));
    await expect(publishSystemScanGovernanceRecord({ ...input, payload: { changed: true } })).rejects.toThrow("SYSTEM_SCAN_GOVERNANCE_VERSION_CONFLICT");
  });

  it("stores the runtime profile under the exact Scope", async () => {
    const id = `test-runtime-${Date.now()}`;
    const profile = await upsertScopeScanRuntimeProfile({ id, architectureScope: scope, frameworkHints: ["nestjs"], sensitivePaths: ["deploy/secrets/**"] });
    expect(profile.architectureScope).toEqual(scope);
    expect((await prisma.scopeScanRuntimeProfile.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id } } }))?.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    await prisma.scopeScanRuntimeProfile.delete({ where: { applicationServiceId_scopePath_id: { ...scope, id } } });
  });

  it("loads only active records", async () => {
    const records = await loadActiveSystemScanGovernance();
    expect(records.every((record) => record.status === "ACTIVE")).toBe(true);
  });
});
