import { Prisma } from "@prisma/client";
import { contentDigest, type ArchitectureScopeRef } from "@specforge/core";
import { prisma, ensureMcpPersistenceSchema, readableScope } from "../persistence";

export type AuthoredRevisionOperation = "UPSERT" | "DELETE";

export interface AuthoredAssetRevisionInput {
  architectureScope: ArchitectureScopeRef;
  assetType: string;
  assetId: string;
  operation: AuthoredRevisionOperation;
  payload: unknown;
  actorType: string;
  actorId: string;
  channel: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface AuthoredAssetRevisionReceipt extends ArchitectureScopeRef {
  catalogVersion: bigint;
  assetType: string;
  assetId: string;
  operation: AuthoredRevisionOperation;
  contentDigest: string;
  idempotent: boolean;
}

export interface AuthoredCatalogRevision {
  dbId: string;
  applicationServiceId: string;
  scopePath: string;
  catalogVersion: bigint;
  assetType: string;
  assetId: string;
  operation: AuthoredRevisionOperation;
  payload: unknown;
  contentDigest: string;
  actorType: string;
  actorId: string;
  channel: string;
  correlationId: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface AuthoredCatalogRevisionPage {
  revisions: AuthoredCatalogRevision[];
  nextCursor?: string;
}

export async function appendAuthoredAssetRevision(
  transaction: Prisma.TransactionClient,
  input: AuthoredAssetRevisionInput
): Promise<AuthoredAssetRevisionReceipt> {
  const scope = exactScope(input.architectureScope);
  const existing = await transaction.authoredAssetRevision.findUnique({
    where: {
      applicationServiceId_scopePath_idempotencyKey: {
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        idempotencyKey: input.idempotencyKey
      }
    }
  });
  if (existing) return receiptFromRow(existing, true);

  const digest = contentDigest({
    architectureScope: scope,
    assetType: input.assetType,
    assetId: input.assetId,
    operation: input.operation,
    payload: input.payload
  });
  const cursor = await transaction.authoredCatalogCursor.upsert({
    where: { applicationServiceId_scopePath: scope },
    create: { ...scope, nextVersion: 1n },
    update: { nextVersion: { increment: 1 } }
  });
  try {
    const row = await transaction.authoredAssetRevision.create({
      data: {
        ...scope,
        catalogVersion: cursor.nextVersion,
        assetType: input.assetType,
        assetId: input.assetId,
        operation: input.operation,
        payload: input.payload as Prisma.InputJsonValue,
        contentDigest: digest,
        actorType: input.actorType,
        actorId: input.actorId,
        channel: input.channel,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey
      }
    });
    return receiptFromRow(row, false);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const concurrent = await transaction.authoredAssetRevision.findUnique({
        where: {
          applicationServiceId_scopePath_idempotencyKey: {
            applicationServiceId: scope.applicationServiceId,
            scopePath: scope.scopePath,
            idempotencyKey: input.idempotencyKey
          }
        }
      });
      if (concurrent) return receiptFromRow(concurrent, true);
    }
    throw error;
  }
}

export async function getAuthoredCatalogWatermark(scopeInput: ArchitectureScopeRef): Promise<{ architectureScope: ArchitectureScopeRef; catalogVersion: bigint; digest: string }> {
  const scope = readableScope(scopeInput.applicationServiceId);
  assertExactScope(scope, scopeInput);
  await ensureMcpPersistenceSchema();
  const cursor = await prisma.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } });
  const catalogVersion = cursor?.nextVersion ?? 0n;
  const digest = await catalogDigest(scope, catalogVersion);
  return { architectureScope: scope, catalogVersion, digest };
}

export async function loadAuthoredCatalogRevisionPage(
  scopeInput: ArchitectureScopeRef,
  catalogVersion: bigint,
  cursor?: string,
  limit = 200
): Promise<AuthoredCatalogRevisionPage> {
  const scope = readableScope(scopeInput.applicationServiceId);
  assertExactScope(scope, scopeInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("CATALOG_PAGE_LIMIT_INVALID");
  await ensureMcpPersistenceSchema();
  const after = cursor ? decodeCursor(cursor) : undefined;
  const rows = await prisma.authoredAssetRevision.findMany({
    where: {
      ...scope,
      catalogVersion: { lte: catalogVersion },
      ...(after ? {
        OR: [
          { assetType: { gt: after.assetType } },
          { assetType: after.assetType, assetId: { gt: after.assetId } },
          { assetType: after.assetType, assetId: after.assetId, catalogVersion: { gt: after.catalogVersion } }
        ]
      } : {})
    },
    orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }],
    take: limit + 1
  });
  const page = rows.slice(0, limit).map(revisionFromRow);
  const last = page.at(-1);
  return { revisions: page, ...(rows.length > limit && last ? { nextCursor: encodeCursor(last) } : {}) };
}

export function encodeCatalogRevisionCursor(row: Pick<AuthoredCatalogRevision, "assetType" | "assetId" | "catalogVersion">): string {
  return encodeCursor(row);
}

async function catalogDigest(scope: ArchitectureScopeRef, catalogVersion: bigint): Promise<string> {
  const rows = await prisma.authoredAssetRevision.findMany({
    where: { ...scope, catalogVersion: { lte: catalogVersion } },
    select: { assetType: true, assetId: true, catalogVersion: true, operation: true, contentDigest: true },
    orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }]
  });
  return contentDigest({ scope, catalogVersion, revisions: rows });
}

function exactScope(input: ArchitectureScopeRef): ArchitectureScopeRef {
  if (!input.applicationServiceId?.trim() || !input.scopePath?.trim()) throw new Error("Architecture scope is required.");
  return { applicationServiceId: input.applicationServiceId, scopePath: input.scopePath };
}

function assertExactScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): void {
  if (left.applicationServiceId !== right.applicationServiceId || left.scopePath !== right.scopePath) throw new Error("SCOPE_MISMATCH");
}

function receiptFromRow(row: { applicationServiceId: string; scopePath: string; catalogVersion: bigint; assetType: string; assetId: string; operation: string; contentDigest: string }, idempotent: boolean): AuthoredAssetRevisionReceipt {
  return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, catalogVersion: row.catalogVersion, assetType: row.assetType, assetId: row.assetId, operation: row.operation as AuthoredRevisionOperation, contentDigest: row.contentDigest, idempotent };
}

function revisionFromRow(row: any): AuthoredCatalogRevision {
  return { dbId: row.dbId, applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, catalogVersion: row.catalogVersion, assetType: row.assetType, assetId: row.assetId, operation: row.operation as AuthoredRevisionOperation, payload: row.payload, contentDigest: row.contentDigest, actorType: row.actorType, actorId: row.actorId, channel: row.channel, correlationId: row.correlationId, idempotencyKey: row.idempotencyKey, createdAt: row.createdAt.toISOString() };
}

function encodeCursor(row: Pick<AuthoredCatalogRevision, "assetType" | "assetId" | "catalogVersion">): string {
  return Buffer.from(JSON.stringify({ assetType: row.assetType, assetId: row.assetId, catalogVersion: row.catalogVersion.toString() }), "utf8").toString("base64url");
}

function decodeCursor(value: string): { assetType: string; assetId: string; catalogVersion: bigint } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.assetType !== "string" || typeof parsed.assetId !== "string" || typeof parsed.catalogVersion !== "string") throw new Error("invalid");
    return { assetType: parsed.assetType, assetId: parsed.assetId, catalogVersion: BigInt(parsed.catalogVersion) };
  } catch {
    throw new Error("CATALOG_CURSOR_INVALID");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
