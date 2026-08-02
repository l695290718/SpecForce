import { validateScanReport, type ArchitectureScopeRef, type PersistedScanReport, type ScanReport } from "@specforge/core";
import { Prisma } from "@prisma/client";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";

export interface SubmitScanReportInput {
  id: string;
  connectorId: string;
  designChangeSessionId: string;
  architectureScope: ArchitectureScopeRef;
  report: ScanReport;
}

export async function submitScanReport(input: SubmitScanReportInput): Promise<PersistedScanReport> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (input.report.architectureScope.applicationServiceId !== scope.applicationServiceId || input.report.architectureScope.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  if (!input.id || !input.connectorId || !input.designChangeSessionId) throw new Error("SCAN_REPORT_IDENTITY_REQUIRED");
  validateScanReport(input.report);
  await ensureMcpPersistenceSchema();
  const row = await prisma.$transaction(async (transaction) => {
    const session = await transaction.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (["BLOCKED", "CLOSED"].includes(session.status)) throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");
    const connector = await transaction.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.connectorId } } });
    if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
    if (connector.status !== "ACTIVE") throw new Error("CONNECTOR_NOT_ACTIVE");
    if (!Array.isArray(connector.capabilities) || !connector.capabilities.includes("OBSERVE")) throw new Error("CONNECTOR_CAPABILITY_MISSING");
    const existing = await transaction.knowledgeScanReport.findUnique({ where: { applicationServiceId_scopePath_reportDigest: { ...scope, reportDigest: input.report.reportDigest } } });
    if (existing) return existing;
    for (const observation of input.report.observations) {
      const idempotencyKey = `scan-observation:${input.report.reportDigest}:${observation.id}`;
      await transaction.sourceObservation.upsert({
        where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey } },
        create: { ...scope, id: `source:${input.report.reportDigest}:${observation.id}`, connectorId: input.connectorId, sourceNamespace: "local-scanner", externalAssetType: observation.observationType, externalId: observation.sourcePath, payload: jsonValue({ ...observation.payload, scanReportId: input.id, reportDigest: input.report.reportDigest }), normalizedDigest: observation.normalizedDigest, sourceVersion: input.report.scannerVersion, observedAt: new Date(input.report.generatedAt), status: "CANDIDATE", provenance: jsonValue({ sourceSystem: "local-scanner", connectorInstanceId: input.connectorId, observedAt: input.report.generatedAt }), idempotencyKey },
        update: {}
      });
    }
    const observationIds = input.report.observations.map((observation) => `source:${input.report.reportDigest}:${observation.id}`);
    const status = input.report.coverage.complete ? "RECEIVED" : "BLOCKED";
    const created = await transaction.knowledgeScanReport.create({ data: { ...scope, id: input.id, designChangeSessionId: input.designChangeSessionId, scannerId: input.report.scannerId, scannerVersion: input.report.scannerVersion, rootLabel: input.report.rootLabel, manifest: jsonValue(input.report.manifest), observationIds: jsonValue(observationIds), coverage: jsonValue(input.report.coverage), manifestDigest: input.report.manifestDigest, reportDigest: input.report.reportDigest, status, generatedAt: new Date(input.report.generatedAt) } });
    await transaction.designChangeSession.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } }, data: { status: status === "RECEIVED" ? "WAITING_FOR_REVIEW" : "CONFLICTED" } });
    await transaction.federationOutbox.upsert({ where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: `scan-report:${input.report.reportDigest}` } }, create: { ...scope, eventType: "FEDERATION_SCAN_REPORT_RECEIVED", payload: jsonValue({ scanReportId: input.id, reportDigest: input.report.reportDigest, observationCount: input.report.observations.length, coverage: input.report.coverage }), idempotencyKey: `scan-report:${input.report.reportDigest}`, status: "PENDING", designChangeSessionId: input.designChangeSessionId }, update: {} });
    return created;
  });
  return persistedScanReport(row, (row.observationIds as string[] | undefined) ?? input.report.observations.map((observation) => `source:${input.report.reportDigest}:${observation.id}`));
}

function persistedScanReport(row: any, observationIds: string[]): PersistedScanReport {
  return { id: row.id, designChangeSessionId: row.designChangeSessionId, scannerId: row.scannerId, scannerVersion: row.scannerVersion, rootLabel: row.rootLabel, manifest: row.manifest, coverage: row.coverage, manifestDigest: row.manifestDigest, reportDigest: row.reportDigest, status: row.status, generatedAt: row.generatedAt.toISOString(), architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, observationIds };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
