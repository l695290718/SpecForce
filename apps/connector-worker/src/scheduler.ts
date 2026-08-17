import {
  computeContinuousObservationBatchV2Integrity,
  CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION,
  type ConnectorObservationPageV2,
  type ConnectorRunDescriptor,
  type ConnectorV2SourceAdapter,
  type ConnectorV2WorkerGateway
} from "@specforge/core";
import { ConnectorAdapterRegistry } from "./adapter-registry";
import { EnvironmentSecretResolver, type SecretResolver } from "./secret-resolver";

export interface ConnectorSchedulerOptions {
  gateway: ConnectorV2WorkerGateway;
  registry: ConnectorAdapterRegistry;
  secrets?: SecretResolver;
  owner: string;
  batchLimit?: number;
  now?: () => Date;
}

export interface ConnectorTickResult {
  claimed: number;
  delivered: number;
  finalized: number;
  failed: number;
  failures: Array<{ runId: string; code: string }>;
}

export class ConnectorScheduler {
  private readonly gateway: ConnectorV2WorkerGateway;
  private readonly registry: ConnectorAdapterRegistry;
  private readonly secrets: SecretResolver;
  private readonly owner: string;
  private readonly batchLimit: number;
  private readonly now: () => Date;

  constructor(options: ConnectorSchedulerOptions) {
    if (!options.owner.trim()) throw new Error("CONNECTOR_WORKER_OWNER_REQUIRED");
    if (!Number.isInteger(options.batchLimit ?? 10) || (options.batchLimit ?? 10) < 1 || (options.batchLimit ?? 10) > 100) throw new Error("CONNECTOR_WORKER_BATCH_LIMIT_INVALID");
    this.gateway = options.gateway;
    this.registry = options.registry;
    this.secrets = options.secrets ?? new EnvironmentSecretResolver();
    this.owner = options.owner;
    this.batchLimit = options.batchLimit ?? 10;
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<ConnectorTickResult> {
    const result: ConnectorTickResult = { claimed: 0, delivered: 0, finalized: 0, failed: 0, failures: [] };
    const runs = await this.gateway.listDueRuns(this.now(), this.batchLimit);
    for (const run of runs) {
      try {
        const claimed = await this.gateway.claimRun({ runId: run.id, owner: this.owner, now: this.now() });
        result.claimed += 1;
        const adapter = this.registry.create({ kind: claimed.run.kind, contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION, mappingVersion: claimed.run.mappingVersion, configuration: claimed.run.configuration, secrets: this.secrets });
        const page = await adapter.poll({ run: claimed.run, fencingToken: claimed.fencingToken });
        const batch = this.createBatch(claimed.run, claimed.fencingToken, page);
        await this.gateway.submitBatch({ run: claimed.run, fencingToken: claimed.fencingToken, batch });
        result.delivered += 1;
        await this.gateway.heartbeat({ run: claimed.run, owner: this.owner, fencingToken: claimed.fencingToken, now: this.now() });
        if (page.isLastPage && claimed.run.mode === "FULL_SNAPSHOT") {
          await this.gateway.finalize({ run: claimed.run, fencingToken: claimed.fencingToken, observedAt: page.observedAt, sourceVersion: page.sourceVersion });
          result.finalized += 1;
        }
      } catch (error) {
        const code = errorCode(error);
        result.failed += 1;
        result.failures.push({ runId: run.id, code });
        await this.gateway.recordFailure({ run, code, message: safeMessage(error), now: this.now() });
      }
    }
    return result;
  }

  private createBatch(run: ConnectorRunDescriptor, fencingToken: number, page: ConnectorObservationPageV2) {
    const base = {
      contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION as typeof CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION,
      architectureScope: run.architectureScope,
      connectorId: run.connectorId,
      sourceNamespace: run.sourceNamespace,
      runId: run.id,
      fencingToken: String(fencingToken),
      mode: run.mode,
      snapshotId: run.snapshotId,
      mappingVersion: run.mappingVersion,
      mappingDigest: run.mappingDigest,
      inventoryBoundaryDigest: run.inventoryBoundaryDigest,
      sequence: run.acceptedSequence + 1,
      previousBatchDigest: run.acceptedBatchDigest,
      pageIndex: run.acceptedSequence + 1,
      isLastPage: page.isLastPage,
      sourceCursor: page.sourceCursor,
      sourceHighWaterMark: page.sourceHighWaterMark,
      observedAt: page.observedAt,
      coverage: page.coverage,
      observations: page.observations,
      payloadDigest: "",
      batchDigest: ""
    };
    return { ...base, ...computeContinuousObservationBatchV2Integrity(base) };
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message)) return error.message;
  return "CONNECTOR_WORKER_RUN_FAILED";
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Connector run failed";
  return error.message.replace(/(password|secret|token|authorization)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]");
}

export function adapterIdentity(adapter: ConnectorV2SourceAdapter): string {
  return `${adapter.kind}:${adapter.sourceNamespace}`;
}
