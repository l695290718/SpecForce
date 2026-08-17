import type { ArchitectureScopeRef, ConnectorRunDescriptor, ConnectorV2WorkerGateway } from "@specforge/core";
import { createConnectorRun, finalizeContinuousSnapshot, getConnectorRun, heartbeatConnectorLease, recordConnectorRunFailure, submitContinuousObservationBatchV2, claimConnectorRun } from "@specforge/mcp-server/connectors/v2-persistence";
import { prisma } from "@specforge/mcp-server/persistence";

export interface PrismaConnectorWorkerGatewayOptions { architectureScope: ArchitectureScopeRef; }

export class PrismaConnectorWorkerGateway implements ConnectorV2WorkerGateway {
  private readonly scope: ArchitectureScopeRef;
  constructor(options: PrismaConnectorWorkerGatewayOptions) { this.scope = options.architectureScope; }

  async listDueRuns(now: Date, limit: number): Promise<ConnectorRunDescriptor[]> {
    const runs = await prisma.connectorRun.findMany({ where: { ...this.scope, status: "QUEUED", queuedAt: { lte: now } }, orderBy: { queuedAt: "asc" }, take: limit });
    return Promise.all(runs.map((run) => this.descriptor(run)));
  }

  async claimRun(input: { runId: string; owner: string; now: Date }) {
    const lease = await claimConnectorRun({ architectureScope: this.scope, runId: input.runId, owner: input.owner, now: input.now });
    const run = await getConnectorRun(this.scope, input.runId);
    if (!run) throw new Error("CONNECTOR_RUN_NOT_FOUND");
    return { run: await this.descriptor(run), fencingToken: lease.fencingToken };
  }

  async heartbeat(input: { run: ConnectorRunDescriptor; owner: string; fencingToken: number; now: Date }) {
    await heartbeatConnectorLease({ architectureScope: this.scope, connectorId: input.run.connectorId, sourceNamespace: input.run.sourceNamespace, owner: input.owner, fencingToken: input.fencingToken, now: input.now });
  }

  async submitBatch(input: Parameters<ConnectorV2WorkerGateway["submitBatch"]>[0]) { return submitContinuousObservationBatchV2({ architectureScope: this.scope, batch: input.batch }); }

  async finalize(input: { run: ConnectorRunDescriptor; fencingToken: number; observedAt: string; sourceVersion: string }) {
    if (input.run.mode !== "FULL_SNAPSHOT" || !input.run.snapshotId) return;
    await finalizeContinuousSnapshot({ architectureScope: this.scope, runId: input.run.id, fencingToken: input.fencingToken, snapshotId: input.run.snapshotId, inventoryBoundaryDigest: input.run.inventoryBoundaryDigest, sourceVersion: input.sourceVersion, observedAt: input.observedAt });
  }

  async recordFailure(input: { run: ConnectorRunDescriptor; code: string; message: string; now: Date }) { await recordConnectorRunFailure({ architectureScope: this.scope, runId: input.run.id, code: input.code, message: input.message, now: input.now }); }

  private async descriptor(run: { id: string; connectorId: string; sourceNamespace: string; mode: string; snapshotId: string | null; mappingVersion: string; mappingDigest: string; inventoryBoundaryDigest: string; acceptedSequence: number; acceptedBatchDigest: string | null; sourceCursor: string | null; sourceHighWaterMark: string | null; status: string }): Promise<ConnectorRunDescriptor> {
    const connector = await prisma.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...this.scope, id: run.connectorId } } });
    if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
    if (run.mode !== "FULL_SNAPSHOT" && run.mode !== "DELTA") throw new Error("CONNECTOR_RUN_MODE_INVALID");
    return { ...run, kind: connector.kind, configuration: record(connector.configuration), mode: run.mode, status: run.status as ConnectorRunDescriptor["status"], architectureScope: this.scope };
  }
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
