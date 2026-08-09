import {
  CONTINUOUS_OBSERVATION_CONTRACT_VERSION,
  CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE,
  computeContinuousBatchIntegrity,
  type ContinuousObservationBatch
} from "../federation/continuous";
import type { ArchitectureScopeRef } from "../architecture/types";
import {
  type ConnectorDeliveryGateway,
  type ConnectorObservationPage,
  type ConnectorPollResult,
  type ConnectorRuntimeOptions,
  type ConnectorRuntimeState,
  type ConnectorRuntimeStatus,
  type ConnectorSourceAdapter
} from "./types";

const TERMINAL_CODES = new Set([
  "SCOPE_MISMATCH",
  "CONNECTOR_NOT_FOUND",
  "CONNECTOR_NOT_ACTIVE",
  "CONNECTOR_CAPABILITY_MISSING",
  "OBSERVATION_BATCH_CONTRACT_MISMATCH",
  "OBSERVATION_BATCH_CONTRACT_UNSUPPORTED",
  "OBSERVATION_BATCH_INPUT_INVALID"
]);

export class ConnectorRuntimeError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
  }
}

export class ConnectorRuntime {
  private state: ConnectorRuntimeState = "IDLE";
  private failureCount = 0;
  private nextRetryAt: Date | null = null;
  private lastError: string | undefined;
  private readonly maxObservationsPerBatch: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: ConnectorRuntimeOptions) {
    this.maxObservationsPerBatch = boundedPositiveInteger(options.maxObservationsPerBatch ?? CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE, CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE);
    this.baseBackoffMs = boundedPositiveInteger(options.baseBackoffMs ?? 1_000, 1);
    this.maxBackoffMs = Math.max(this.baseBackoffMs, boundedPositiveInteger(options.maxBackoffMs ?? 60_000, this.baseBackoffMs));
    this.now = options.now ?? (() => new Date());
    assertScope(options.architectureScope, options.architectureScope);
    if (!options.connectorId || !options.source.sourceNamespace || !options.source.kind) throw new ConnectorRuntimeError("CONNECTOR_CONFIGURATION_INVALID");
  }

  status(): ConnectorRuntimeStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextRetryAt: this.nextRetryAt?.toISOString() ?? null,
      ...(this.lastError ? { lastError: this.lastError } : {})
    };
  }

  start(): ConnectorRuntimeStatus {
    if (this.state === "STOPPED" || this.state === "FAILED") return this.status();
    this.state = "RUNNING";
    return this.status();
  }

  stop(): ConnectorRuntimeStatus {
    this.state = "STOPPED";
    this.nextRetryAt = null;
    return this.status();
  }

  async pollOnce(signal?: AbortSignal): Promise<ConnectorPollResult> {
    if (this.state === "STOPPED") return { status: "STOPPED", runtime: this.status() };
    const current = this.now();
    if (this.state === "BACKOFF" && this.nextRetryAt && current.getTime() < this.nextRetryAt.getTime()) {
      return { status: "BACKOFF", runtime: this.status() };
    }
    this.state = "RUNNING";
    try {
      const registration = await this.options.gateway.getConnector(this.options.architectureScope, this.options.connectorId);
      if (!registration) throw new ConnectorRuntimeError("CONNECTOR_NOT_FOUND");
      assertScope(this.options.architectureScope, registration.architectureScope);
      if (registration.id !== this.options.connectorId) throw new ConnectorRuntimeError("CONNECTOR_NOT_FOUND");
      if (registration.kind !== this.options.source.kind) throw new ConnectorRuntimeError("CONNECTOR_KIND_MISMATCH");
      if (registration.status !== "ACTIVE") throw new ConnectorRuntimeError("CONNECTOR_NOT_ACTIVE");
      if (!registration.capabilities.includes("OBSERVE")) throw new ConnectorRuntimeError("CONNECTOR_CAPABILITY_MISSING");

      const checkpoint = await this.options.gateway.getCursor(this.options.architectureScope, this.options.connectorId, this.options.source.sourceNamespace);
      if (checkpoint && checkpoint.contractVersion !== CONTINUOUS_OBSERVATION_CONTRACT_VERSION) {
        throw new ConnectorRuntimeError("OBSERVATION_BATCH_CONTRACT_MISMATCH");
      }
      const page = await this.options.source.poll({
        architectureScope: this.options.architectureScope,
        checkpoint,
        maxObservations: this.maxObservationsPerBatch,
        signal
      });
      validatePage(this.options.architectureScope, this.options.source, page, this.maxObservationsPerBatch);
      if (page.observations.length === 0 && !page.hasMore) {
        this.resetAfterSuccess();
        return { status: "IDLE", runtime: this.status() };
      }
      const batch = buildBatch(this.options.architectureScope, this.options.connectorId, this.options.source.sourceNamespace, checkpoint, page);
      const receipt = await this.options.gateway.submitBatch({ architectureScope: this.options.architectureScope, batch });
      const accepted = receipt as { batchDigest?: string; idempotent?: boolean } | undefined;
      this.resetAfterSuccess();
      return {
        status: "DELIVERED",
        sequence: batch.sequence,
        batchDigest: accepted?.batchDigest ?? batch.batchDigest,
        idempotent: accepted?.idempotent === true,
        hasMore: page.hasMore,
        sourceCursor: page.sourceCursor,
        runtime: this.status()
      };
    } catch (error) {
      return this.handleFailure(error);
    }
  }

  async runUntilStopped(input: { signal?: AbortSignal; pollIntervalMs?: number; sleep?: (milliseconds: number) => Promise<void> }): Promise<void> {
    const sleep = input.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const pollIntervalMs = Math.max(1, input.pollIntervalMs ?? 10_000);
    this.start();
    while (this.state !== "STOPPED" && !input.signal?.aborted) {
      const result = await this.pollOnce(input.signal);
      if (result.status === "FAILED") return;
      const delay = result.status === "BACKOFF" ? this.retryDelayMs() : pollIntervalMs;
      await sleep(delay);
    }
  }

  private handleFailure(error: unknown): ConnectorPollResult {
    const code = safeCode(error);
    this.lastError = code;
    if (TERMINAL_CODES.has(code) || code === "CONNECTOR_CONFIGURATION_INVALID" || code === "CONNECTOR_KIND_MISMATCH") {
      this.state = "FAILED";
      this.nextRetryAt = null;
      return { status: "FAILED", code, runtime: this.status() };
    }
    this.failureCount += 1;
    this.state = "BACKOFF";
    this.nextRetryAt = new Date(this.now().getTime() + this.retryDelayMs());
    return { status: "BACKOFF", runtime: this.status() };
  }

  private retryDelayMs(): number {
    return Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** Math.max(0, this.failureCount - 1));
  }

  private resetAfterSuccess(): void {
    this.failureCount = 0;
    this.nextRetryAt = null;
    this.lastError = undefined;
    this.state = "IDLE";
  }
}

export function buildBatch(
  architectureScope: ArchitectureScopeRef,
  connectorId: string,
  sourceNamespace: string,
  checkpoint: { acceptedSequence: number; acceptedBatchDigest: string | null } | null,
  page: ConnectorObservationPage
): ContinuousObservationBatch {
  const batchWithoutDigest = {
    contractVersion: CONTINUOUS_OBSERVATION_CONTRACT_VERSION,
    architectureScope,
    connectorId,
    sourceNamespace,
    sequence: (checkpoint?.acceptedSequence ?? -1) + 1,
    previousBatchDigest: checkpoint?.acceptedBatchDigest ?? null,
    sourceCursor: page.sourceCursor,
    observedAt: page.observedAt,
    observations: page.observations,
    coverage: page.coverage
  } satisfies Omit<ContinuousObservationBatch, "payloadDigest" | "batchDigest">;
  return { ...batchWithoutDigest, ...computeContinuousBatchIntegrity(batchWithoutDigest) };
}

function validatePage(scope: ArchitectureScopeRef, source: ConnectorSourceAdapter, page: ConnectorObservationPage, maxObservations: number): void {
  if (!page || typeof page !== "object" || !page.sourceVersion || !page.observedAt || !Array.isArray(page.observations)) throw new ConnectorRuntimeError("OBSERVATION_BATCH_INPUT_INVALID");
  if (page.observations.length > maxObservations || page.observations.length > CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE) throw new ConnectorRuntimeError("OBSERVATION_BATCH_BUDGET_EXCEEDED");
  if (page.hasMore && !page.sourceCursor) throw new ConnectorRuntimeError("OBSERVATION_BATCH_INPUT_INVALID");
  const ids = new Set<string>();
  for (const observation of page.observations) {
    if (!observation.id || !observation.externalAssetType || !observation.externalId || !observation.sourceVersion || !observation.payload || typeof observation.payload !== "object") throw new ConnectorRuntimeError("OBSERVATION_BATCH_INPUT_INVALID");
    if (ids.has(`${observation.externalAssetType}:${observation.externalId}:${observation.sourceVersion}`)) throw new ConnectorRuntimeError("OBSERVATION_BATCH_DUPLICATE_IDENTITY");
    ids.add(`${observation.externalAssetType}:${observation.externalId}:${observation.sourceVersion}`);
  }
  if (source.sourceNamespace.length === 0 || scope.applicationServiceId.length === 0 || scope.scopePath.length === 0) throw new ConnectorRuntimeError("CONNECTOR_CONFIGURATION_INVALID");
}

function assertScope(expected: ArchitectureScopeRef, actual: ArchitectureScopeRef): void {
  if (expected.applicationServiceId !== actual.applicationServiceId || expected.scopePath !== actual.scopePath) throw new ConnectorRuntimeError("SCOPE_MISMATCH");
}

function safeCode(error: unknown): string {
  if (error instanceof ConnectorRuntimeError) return error.code;
  if (error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message)) return error.message;
  return "CONNECTOR_RUNTIME_FAILURE";
}

function boundedPositiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
