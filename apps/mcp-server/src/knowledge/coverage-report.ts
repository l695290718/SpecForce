import { ensureMcpPersistenceSchema, prisma, readableScope } from "../persistence";
import type { ArchitectureScopeRef, CoverageRole, CoverageStatus } from "@specforge/core";

export interface Get3aCoverageReportInput {
  architectureScope: ArchitectureScopeRef;
  generationId?: string;
  role?: CoverageRole;
  status?: CoverageStatus;
  assetType?: string;
  reasonCode?: string;
  limit?: number;
  cursor?: string;
}

export interface Get3aCoverageReportResult extends ArchitectureScopeRef {
  freshness: "CURRENT" | "STALE";
  manifest?: { id: string; generationId: string; inputDigest: string; contentDigest: string; catalogVersion: string; relationshipVersion: string; rowCount: number; coveredCount: number; blockedCount: number; notEvaluatedCount: number };
  rows: Array<Record<string, unknown>>;
  nextCursor?: string;
}

export async function get3aCoverageReport(input: Get3aCoverageReportInput, client: typeof prisma = prisma, ensureSchema: () => Promise<unknown> = ensureMcpPersistenceSchema): Promise<Get3aCoverageReportResult> {
  const scope = readableScope(input.architectureScope.applicationServiceId);
  if (scope.scopePath !== input.architectureScope.scopePath) throw new Error("Scope read is not authorized.");
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("COVERAGE_REPORT_LIMIT_INVALID");
  await ensureSchema();
  const manifest = await client.architectureCoverageManifest.findFirst({
    where: { ...scope, publicationState: "PUBLISHED", ...(input.generationId ? { generationId: input.generationId } : {}) },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
  });
  if (!manifest) return { ...scope, freshness: "STALE", rows: [] };
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  const rows = await client.architectureAssetCoverageProjection.findMany({
    where: {
      ...scope,
      generationId: manifest.generationId,
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.assetType ? { assetType: input.assetType } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(cursor ? { OR: [{ assetType: { gt: cursor.assetType } }, { assetType: cursor.assetType, assetId: { gt: cursor.assetId } }] } : {})
    },
    orderBy: [{ assetType: "asc" }, { assetId: "asc" }],
    take: limit + 1
  });
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  const cursorValue = last && rows.length > limit ? encodeCursor(last) : undefined;
  const current = await currentWaterlines(scope, client);
  return {
    ...scope,
    freshness: current.catalogVersion === manifest.catalogVersion.toString() && current.relationshipVersion === manifest.relationshipVersion.toString() ? "CURRENT" : "STALE",
    manifest: { id: manifest.id, generationId: manifest.generationId, inputDigest: manifest.inputDigest, contentDigest: manifest.contentDigest, catalogVersion: manifest.catalogVersion.toString(), relationshipVersion: manifest.relationshipVersion.toString(), rowCount: manifest.rowCount, coveredCount: manifest.coveredCount, blockedCount: manifest.blockedCount, notEvaluatedCount: manifest.notEvaluatedCount },
    rows: selected.map((row) => ({ assetType: row.assetType, assetId: row.assetId, role: row.role, status: row.status, terminalMemberId: row.terminalMemberId, pathEvidence: row.pathEvidence, reasonCode: row.reasonCode, diagnosticRef: row.diagnosticRef, sourceDigest: row.sourceDigest, rowDigest: row.rowDigest })),
    ...(cursorValue ? { nextCursor: cursorValue } : {})
  };
}

async function currentWaterlines(scope: ArchitectureScopeRef, client: typeof prisma): Promise<{ catalogVersion: string; relationshipVersion: string }> {
  const cursor = await client.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } });
  const relationship = await client.relationshipEvent.aggregate({ where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, _max: { graphVersion: true } });
  return { catalogVersion: (cursor?.nextVersion ?? 0n).toString(), relationshipVersion: (relationship._max.graphVersion ?? 0n).toString() };
}

function encodeCursor(row: { assetType: string; assetId: string }): string { return Buffer.from(JSON.stringify({ assetType: row.assetType, assetId: row.assetId }), "utf8").toString("base64url"); }
function decodeCursor(value: string): { assetType: string; assetId: string } { try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; if (typeof parsed.assetType !== "string" || typeof parsed.assetId !== "string") throw new Error("invalid"); return { assetType: parsed.assetType, assetId: parsed.assetId }; } catch { throw new Error("COVERAGE_CURSOR_INVALID"); } }
