import { prisma } from "../db";
import type { ArchitectureScopeRef } from "@specforge/core";
import type { ThreeACoverageReport } from "./workspace-loader";

export async function loadThreeACoverageReport(scope: ArchitectureScopeRef): Promise<ThreeACoverageReport | undefined> {
  const manifest = await prisma.architectureCoverageManifest.findFirst({ where: { ...scope, publicationState: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] });
  if (!manifest) return undefined;
  const rows = await prisma.architectureAssetCoverageProjection.findMany({ where: { ...scope, generationId: manifest.generationId }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }], take: 100 });
  const cursor = await prisma.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } });
  const relationship = await prisma.relationshipEvent.aggregate({ where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, _max: { graphVersion: true } });
  return {
    freshness: (cursor?.nextVersion ?? 0n).toString() === manifest.catalogVersion.toString() && (relationship._max.graphVersion ?? 0n).toString() === manifest.relationshipVersion.toString() ? "CURRENT" : "STALE",
    manifest: { id: manifest.id, generationId: manifest.generationId, inputDigest: manifest.inputDigest, contentDigest: manifest.contentDigest, catalogVersion: manifest.catalogVersion.toString(), relationshipVersion: manifest.relationshipVersion.toString(), rowCount: manifest.rowCount, coveredCount: manifest.coveredCount, blockedCount: manifest.blockedCount, notEvaluatedCount: manifest.notEvaluatedCount },
    rows: rows.map((row) => ({ assetType: row.assetType, assetId: row.assetId, role: row.role, status: row.status, terminalMemberId: row.terminalMemberId, pathEvidence: row.pathEvidence, reasonCode: row.reasonCode, diagnosticRef: row.diagnosticRef, sourceDigest: row.sourceDigest, rowDigest: row.rowDigest }))
  };
}
