import { pathToFileURL } from "node:url";

import {
  LegacyRelationMigrationError,
  legacyRelationMigrationRegistry,
  normalizeLegacyAssetLink,
  type CanonicalAssetLink,
  type LegacyAssetLink
} from "../apps/mcp-server/src/relationships/legacy-migration.js";
import { selfDesignAssetLinks } from "../prisma/data/specforge-self-design.js";

interface LegacyRelationIssue {
  relationType: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
}

export interface LegacyRelationCheckReport {
  migrationVersion: string;
  totalLinks: number;
  unregisteredRelations: LegacyRelationIssue[];
  ambiguousRelations: LegacyRelationIssue[];
}

type LegacyLinkNormalizer = (link: LegacyAssetLink) => CanonicalAssetLink[];

export function checkLegacyRelations(
  links: readonly LegacyAssetLink[],
  normalize: LegacyLinkNormalizer = normalizeLegacyAssetLink
): LegacyRelationCheckReport {
  const unregisteredRelations: LegacyRelationIssue[] = [];
  const ambiguousRelations: LegacyRelationIssue[] = [];

  for (const link of links) {
    try {
      normalize(link);
    } catch (error) {
      if (!(error instanceof LegacyRelationMigrationError)) throw error;

      const issue = toIssue(link);
      if (error.code === "LEGACY_RELATION_UNKNOWN") unregisteredRelations.push(issue);
      if (error.code === "LEGACY_RELATION_AMBIGUOUS") ambiguousRelations.push(issue);
    }
  }

  return {
    migrationVersion: legacyRelationMigrationRegistry.version,
    totalLinks: links.length,
    unregisteredRelations,
    ambiguousRelations
  };
}

export function getLegacyRelationCheckExitCode(report: LegacyRelationCheckReport): 0 | 1 {
  return report.unregisteredRelations.length > 0 || report.ambiguousRelations.length > 0 ? 1 : 0;
}

function toIssue(link: LegacyAssetLink): LegacyRelationIssue {
  return {
    relationType: link.relationType,
    sourceType: link.sourceType,
    sourceId: link.sourceId,
    targetType: link.targetType,
    targetId: link.targetId
  };
}

function run(): void {
  const report = checkLegacyRelations(selfDesignAssetLinks);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = getLegacyRelationCheckExitCode(report);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) run();
