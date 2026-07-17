import { describe, expect, it } from "vitest";

import {
  LegacyRelationMigrationError,
  legacyRelationMigrationRegistry,
  type LegacyAssetLink
} from "../apps/mcp-server/src/relationships/legacy-migration.js";
import { checkLegacyRelations, getLegacyRelationCheckExitCode } from "./check-legacy-relations.js";

const link = (relationType: string): LegacyAssetLink => ({
  sourceType: "domain",
  sourceId: "domain-specforge-platform",
  targetType: "api",
  targetId: "api-specforge-web-console",
  relationType
});

describe("checkLegacyRelations", () => {
  it("reports the registry version and no issues when every seed link normalizes", () => {
    const report = checkLegacyRelations([link("owns"), link("reads-writes")]);

    expect(report).toEqual({
      migrationVersion: legacyRelationMigrationRegistry.version,
      totalLinks: 2,
      unregisteredRelations: [],
      ambiguousRelations: []
    });
  });

  it("records unknown and ambiguous legacy relations and marks the report unsuccessful", () => {
    const report = checkLegacyRelations(
      [link("owns"), link("obsolete"), link("depends-on")],
      (legacyLink) => {
        if (legacyLink.relationType === "obsolete") {
          throw new LegacyRelationMigrationError("LEGACY_RELATION_UNKNOWN", legacyLink.relationType);
        }
        if (legacyLink.relationType === "depends-on") {
          throw new LegacyRelationMigrationError("LEGACY_RELATION_AMBIGUOUS", legacyLink.relationType);
        }
        return [];
      }
    );

    expect(report.unregisteredRelations).toEqual([{
      relationType: "obsolete",
      sourceType: "domain",
      sourceId: "domain-specforge-platform",
      targetType: "api",
      targetId: "api-specforge-web-console"
    }]);
    expect(report.ambiguousRelations).toEqual([{
      relationType: "depends-on",
      sourceType: "domain",
      sourceId: "domain-specforge-platform",
      targetType: "api",
      targetId: "api-specforge-web-console"
    }]);
    expect(getLegacyRelationCheckExitCode(report)).toBe(1);
  });
});
