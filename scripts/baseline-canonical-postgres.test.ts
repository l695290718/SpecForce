import { describe, expect, it } from "vitest";

import {
  HISTORICAL_BASELINE_MIGRATIONS,
  computeMissingLinkDigest,
  selectHistoricalBaselineMigrations,
  validateBaselinePreconditions
} from "./baseline-canonical-postgres.js";

describe("brownfield PostgreSQL baseline guards", () => {
  it("computes an order-independent digest for missing link identities", () => {
    expect(computeMissingLinkDigest(["b", "a"])).toBe(computeMissingLinkDigest(["a", "b"]));
    expect(computeMissingLinkDigest(["a", "b"])).not.toBe(computeMissingLinkDigest(["a", "c"]));
  });

  it("selects only the explicit historical allowlist", () => {
    expect(selectHistoricalBaselineMigrations([
      HISTORICAL_BASELINE_MIGRATIONS[0],
      "20260919000000_unique_active_scan_governance",
      "unreviewed"
    ])).toEqual([HISTORICAL_BASELINE_MIGRATIONS[0]]);
  });

  it("blocks unsafe apply preconditions", () => {
    expect(validateBaselinePreconditions({
      databaseName: "wrong_database",
      backupSizeBytes: 0,
      expectedGapDigest: "expected",
      actualGapDigest: "actual",
      unexpectedIndexes: ["unexpected_index"],
      activeGovernanceDuplicates: [{ kind: "EXTRACTOR_CATALOG" }],
      scopeNullCounts: { DesignAsset: 1 },
      historicalMigrationsPresent: []
    })).toEqual([
      "DATABASE_NAME_MISMATCH",
      "BACKUP_REQUIRED",
      "MISSING_LINK_DIGEST_MISMATCH",
      "UNEXPECTED_SCHEMA_DRIFT",
      "ACTIVE_GOVERNANCE_DUPLICATE",
      "SCOPE_NULL_DATA",
      "HISTORICAL_MIGRATION_ALLOWLIST_INCOMPLETE"
    ]);
  });

  it("allows a reviewed canonical audit before apply", () => {
    expect(validateBaselinePreconditions({
      databaseName: "specforge_canonical",
      backupSizeBytes: 100,
      expectedGapDigest: "same",
      actualGapDigest: "same",
      unexpectedIndexes: [],
      activeGovernanceDuplicates: [],
      scopeNullCounts: { DesignAsset: 0, Proposal: 0, ContextPack: 0, AssetLink: 0 },
      historicalMigrationsPresent: [...HISTORICAL_BASELINE_MIGRATIONS]
    })).toEqual([]);
  });
});
