import { describe, expect, it } from "vitest";
import { filterEligibleLinks, runAttestationBackfill, type BackfillLink } from "./backfill-integration-attestations";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

function link(overrides: Partial<BackfillLink> = {}): BackfillLink {
  return {
    id: "link-1",
    sourceType: "evidence",
    sourceId: "evidence-1",
    targetType: "integration",
    targetId: "integration-1",
    relationType: "VALIDATES",
    description: "Observed call",
    architectureScope: scope,
    ...overrides
  };
}

describe("integration attestation backfill", () => {
  it("keeps only exact-scope evidence VALIDATES integration links", () => {
    expect(filterEligibleLinks([
      link(),
      link({ id: "adr-link", targetType: "adr" }),
      link({ id: "other-scope", architectureScope: { ...scope, scopePath: "other" } }),
      link({ id: "wrong-case", relationType: "validates" })
    ], scope).map((item) => item.id)).toEqual(["link-1", "wrong-case"]);
  });

  it("does not write in dry-run mode", async () => {
    const writes: string[] = [];
    const report = await runAttestationBackfill({ scope, mode: "dry-run", batchSize: 500 }, {
      listLinks: async () => [link()],
      writeLink: async (item) => { writes.push(item.id); },
      listCanonical: async () => new Set()
    });

    expect(writes).toEqual([]);
    expect(report).toMatchObject({ scanned: 1, eligible: 1, upserted: 0, noOp: 0, failed: 0, parity: "NOT_RUN" });
  });

  it("is replay-safe and reports canonical parity", async () => {
    const writes: string[] = [];
    const report = await runAttestationBackfill({ scope, mode: "apply", batchSize: 1 }, {
      listLinks: async () => [link(), link({ id: "link-2", sourceId: "evidence-2", targetId: "integration-2" })],
      writeLink: async (item) => { writes.push(item.id); },
      listCanonical: async (ids) => new Set(ids)
    });

    expect(writes).toEqual(["link-1", "link-2"]);
    expect(report).toMatchObject({ scanned: 2, eligible: 2, upserted: 0, noOp: 2, failed: 0, parity: "COMPLETE" });
  });

  it("fails closed when a canonical relationship is missing", async () => {
    const report = await runAttestationBackfill({ scope, mode: "apply", batchSize: 500 }, {
      listLinks: async () => [link()],
      writeLink: async () => undefined,
      listCanonical: async () => new Set()
    });

    expect(report.parity).toBe("INCOMPLETE");
    expect(report.failed).toBe(1);
    expect(report.failures[0]?.id).toBe("link-1");
  });
});
