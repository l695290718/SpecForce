import { describe, expect, it } from "vitest";
import { buildScanReport, scanFilePath } from "../index";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org-example/product-orders/com.example.orders" };

describe("deterministic local scanner contract", () => {
  it("classifies structural sources without claiming business meaning", () => {
    expect(scanFilePath("contracts/openapi-orders.yaml")).toMatchObject({ sourceKind: "openapi", observationType: "api-contract" });
    expect(scanFilePath("src/order-service.ts")).toMatchObject({ sourceKind: "repository", observationType: "source-file" });
    expect(scanFilePath("README.md")).toMatchObject({ sourceKind: "document", observationType: "documentation" });
    expect(scanFilePath("deploy/docker-compose.yaml")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
    expect(scanFilePath(".github/workflows/release.yml")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
    expect(scanFilePath("deploy/bootstrap.Dockerfile")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
    expect(scanFilePath("deploy/bootstrap.Dockerfile.dockerignore")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
    expect(scanFilePath("deploy/scripts/start.ps1")).toMatchObject({ sourceKind: "repository", observationType: "system-component" });
    expect(scanFilePath("node_modules/pkg/index.js")).toBeUndefined();
  });

  it("treats explicit exclusions and out-of-policy files as non-blocking while retaining required unsupported evidence", () => {
    const report = buildScanReport({ rootLabel: "orders", architectureScope: scope, files: [
      { path: "src/order.ts", content: "export const order = true;", sizeBytes: 27 },
      { path: "node_modules/pkg/index.js", content: "ignored", sizeBytes: 7 },
      { path: "notes/decision.txt", content: "not scanned", sizeBytes: 11 },
      { path: "deploy/platform.conf", content: "unclassified deployment input", sizeBytes: 29 }
    ] });
    expect(report.coverage).toMatchObject({ indexedFiles: 1, excludedFiles: 1, outOfPolicyFiles: 1, requiredUnsupportedFiles: 1, unsupportedFiles: 1, complete: false, blockingRuleIds: ["required-deployment-declaration"] });
    expect(report.coverage.representativeEntries).toHaveLength(3);
  });

  it("recognizes governed deployment declarations before applying the required-unsupported guard", () => {
    const report = buildScanReport({ rootLabel: "orders", architectureScope: scope, files: [
      { path: ".github/workflows/release.yml", content: "name: Release", sizeBytes: 13 },
      { path: "deploy/runtime.yaml", content: "version: v1", sizeBytes: 11 }
    ] });
    expect(report.coverage).toMatchObject({ indexedFiles: 2, requiredUnsupportedFiles: 0, complete: true });
  });

  it("builds a stable manifest and report digest while keeping source content out of observations", () => {
    const files = [
      { path: "src/order.ts", content: "export const order = true;", sizeBytes: 27 },
      { path: "contracts/openapi-orders.yaml", content: "openapi: 3.0.0", sizeBytes: 15 },
      { path: "README.md", content: "# Orders", sizeBytes: 8 }
    ];
    const first = buildScanReport({ rootLabel: "orders", architectureScope: scope, files, generatedAt: "2026-08-02T00:00:00.000Z" });
    const second = buildScanReport({ rootLabel: "orders", architectureScope: scope, files: [...files].reverse(), generatedAt: "2026-08-02T12:00:00.000Z" });
    expect(first.manifestDigest).toBe(second.manifestDigest);
    expect(first.reportDigest).toBe(second.reportDigest);
    expect(first.observations.every((observation) => !JSON.stringify(observation).includes("openapi: 3.0.0"))).toBe(true);
    expect(first.coverage.complete).toBe(true);
  });
});
