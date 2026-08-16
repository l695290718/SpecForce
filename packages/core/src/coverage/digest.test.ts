import { describe, expect, it } from "vitest";
import { coverageBuildKey, coverageInputDigest } from "./policy";
import type { CoverageBuildKeyInput } from "./types";

const base: CoverageBuildKeyInput = {
  architectureScope: { applicationServiceId: "com.example.orders", scopePath: "org/product/orders/service" },
  baselineId: "knowledge-baseline:orders:1",
  generationId: "generation-1",
  profileId: "generic-system",
  profileVersion: "2",
  coverageSchemaVersion: "coverage.v1",
  catalogVersion: "catalog-7",
  catalogDigest: "catalog-digest",
  relationshipVersion: "relationship-8",
  relationshipDigest: "relationship-digest",
  query: { assetTypes: ["api", "dataModel"], status: "COVERED" }
};

describe("coverage digests", () => {
  it("canonicalizes object key order and excludes attempts and timestamps", () => {
    const reordered = { ...base, query: { status: "COVERED", assetTypes: ["api", "dataModel"] }, attempt: 9, createdAt: "2026-08-16T01:00:00.000Z" };
    expect(coverageInputDigest(base)).toBe(coverageInputDigest(reordered));
    expect(coverageBuildKey(base)).toBe(coverageBuildKey({ ...reordered }));
  });

  it("changes when any pinned waterline or query changes", () => {
    expect(coverageBuildKey(base)).not.toBe(coverageBuildKey({ ...base, catalogDigest: "changed" }));
    expect(coverageBuildKey(base)).not.toBe(coverageBuildKey({ ...base, relationshipVersion: "relationship-9" }));
    expect(coverageBuildKey(base)).not.toBe(coverageBuildKey({ ...base, query: { status: "BLOCKED" } }));
  });
});
