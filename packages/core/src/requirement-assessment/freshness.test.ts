import { describe, expect, it } from "vitest";
import { invalidationReason } from "./freshness";

describe("requirement assessment freshness", () => {
  const base = { snapshotDigest: "digest-1", currentDigest: "digest-1", reconciliationStatus: "CONVERGED", briefSuperseded: false };

  it("invalidates superseded briefs, changed evidence, and blocked reconciliation", () => {
    expect(invalidationReason({ ...base, briefSuperseded: true })).toBe("BRIEF_SUPERSEDED");
    expect(invalidationReason({ ...base, currentDigest: "digest-2" })).toBe("EVIDENCE_SNAPSHOT_CHANGED");
    expect(invalidationReason({ ...base, reconciliationStatus: "BLOCKED" })).toBe("RECONCILIATION_NOT_CONVERGED");
  });

  it("keeps a converged assessment valid while its evidence waterline is unchanged", () => {
    expect(invalidationReason(base)).toBeNull();
  });
});
