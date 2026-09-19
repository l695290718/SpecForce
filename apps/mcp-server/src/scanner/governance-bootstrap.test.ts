import { describe, expect, it } from "vitest";
import { defaultSystemScanGovernanceInputs, portableReleaseBootstrapInput } from "./governance-bootstrap";

describe("system scan governance bootstrap", () => {
  it("publishes one versioned record for every governance kind", () => {
    const records = defaultSystemScanGovernanceInputs();
    expect(records).toHaveLength(6);
    expect(new Set(records.map((record) => record.kind)).size).toBe(6);
    expect(records.every((record) => record.version === "1.0.0" && record.signature.startsWith("bootstrap:"))).toBe(true);
  });

  it("declares the full asset family and bounded production budget", () => {
    const inference = defaultSystemScanGovernanceInputs().find((record) => record.kind === "ASSET_INFERENCE_POLICY")!;
    const scanner = defaultSystemScanGovernanceInputs().find((record) => record.kind === "SCANNER_GOVERNANCE_PROFILE")!;
    expect((inference.payload.assetFamilies as string[])).toContain("typedRelationship");
    expect((scanner.payload.budgets as Record<string, number>).maxObservationsPerSession).toBe(100_000);
  });

  it("parses an explicit portable release without inventing a default artifact", () => {
    expect(portableReleaseBootstrapInput(undefined)).toBeNull();
    const result = portableReleaseBootstrapInput(JSON.stringify({ releaseId: "scanner-release:portable", artifactKind: "PORTABLE_SCRIPT" }));
    expect(result).toMatchObject({ status: "ACTIVE", manifest: { artifactKind: "PORTABLE_SCRIPT" } });
  });
});
