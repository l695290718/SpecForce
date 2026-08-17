import type { ArchitectureScopeRef } from "../architecture/types";
import type { ConnectorCapability, ConnectorStatus } from "../federation/types";
import type { ContinuousObservation, ContinuousObservationBatch, ContinuousObservationBatchV2, ContinuousObservationV2, ObservationRunMode } from "../federation/continuous";
import type { ConnectorRunStatus } from "../federation/types";

export type ConnectorRuntimeState = "IDLE" | "RUNNING" | "BACKOFF" | "STOPPED" | "FAILED";

export interface ConnectorRegistrationSnapshot {
  id: string;
  kind: string;
  capabilities: readonly ConnectorCapability[];
  status: ConnectorStatus;
  architectureScope: ArchitectureScopeRef;
}

export interface ConnectorCheckpoint {
  contractVersion: string;
  acceptedSequence: number;
  acceptedBatchDigest: string | null;
  sourceCursor: string | null;
}

export interface ConnectorObservationPage {
  sourceCursor: string | null;
  sourceVersion: string;
  observedAt: string;
  observations: ContinuousObservation[];
  coverage: Record<string, unknown>;
  hasMore: boolean;
}

export interface ConnectorSourcePollInput {
  architectureScope: ArchitectureScopeRef;
  checkpoint: ConnectorCheckpoint | null;
  maxObservations: number;
  signal?: AbortSignal;
}

export interface ConnectorSourceAdapter {
  readonly kind: string;
  readonly sourceNamespace: string;
  poll(input: ConnectorSourcePollInput): Promise<ConnectorObservationPage>;
}

export interface ConnectorDeliveryGateway {
  getConnector(architectureScope: ArchitectureScopeRef, connectorId: string): Promise<ConnectorRegistrationSnapshot | null>;
  getCursor(architectureScope: ArchitectureScopeRef, connectorId: string, sourceNamespace: string): Promise<ConnectorCheckpoint | null>;
  submitBatch(input: { architectureScope: ArchitectureScopeRef; batch: ContinuousObservationBatch }): Promise<unknown>;
}

export interface ConnectorRuntimeStatus {
  state: ConnectorRuntimeState;
  failureCount: number;
  nextRetryAt: string | null;
  lastError?: string;
}

export type ConnectorPollResult =
  | { status: "DELIVERED"; sequence: number; batchDigest: string; idempotent: boolean; hasMore: boolean; sourceCursor: string | null; runtime: ConnectorRuntimeStatus }
  | { status: "IDLE"; runtime: ConnectorRuntimeStatus }
  | { status: "BACKOFF"; runtime: ConnectorRuntimeStatus }
  | { status: "STOPPED"; runtime: ConnectorRuntimeStatus }
  | { status: "FAILED"; code: string; runtime: ConnectorRuntimeStatus };

export interface ConnectorRuntimeOptions {
  architectureScope: ArchitectureScopeRef;
  connectorId: string;
  source: ConnectorSourceAdapter;
  gateway: ConnectorDeliveryGateway;
  maxObservationsPerBatch?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  now?: () => Date;
}

export interface ConnectorRunDescriptor {
  id: string;
  connectorId: string;
  kind: string;
  configuration: Record<string, unknown>;
  sourceNamespace: string;
  mode: ObservationRunMode;
  snapshotId: string | null;
  mappingVersion: string;
  mappingDigest: string;
  inventoryBoundaryDigest: string;
  acceptedSequence: number;
  acceptedBatchDigest: string | null;
  sourceCursor: string | null;
  sourceHighWaterMark: string | null;
  status: ConnectorRunStatus;
  architectureScope: ArchitectureScopeRef;
}

export interface ConnectorObservationPageV2 {
  sourceCursor: string | null;
  sourceHighWaterMark: string | null;
  sourceVersion: string;
  observedAt: string;
  observations: ContinuousObservationV2[];
  coverage: Record<string, unknown>;
  isLastPage: boolean;
}

export interface ConnectorV2SourcePollInput {
  run: ConnectorRunDescriptor;
  fencingToken: number;
  signal?: AbortSignal;
}

export interface ConnectorV2SourceAdapter {
  readonly kind: string;
  readonly sourceNamespace: string;
  poll(input: ConnectorV2SourcePollInput): Promise<ConnectorObservationPageV2>;
}

export interface ConnectorV2WorkerGateway {
  listDueRuns(now: Date, limit: number): Promise<ConnectorRunDescriptor[]>;
  claimRun(input: { runId: string; owner: string; now: Date }): Promise<{ run: ConnectorRunDescriptor; fencingToken: number }>;
  heartbeat(input: { run: ConnectorRunDescriptor; owner: string; fencingToken: number; now: Date }): Promise<void>;
  submitBatch(input: { run: ConnectorRunDescriptor; fencingToken: number; batch: ContinuousObservationBatchV2 }): Promise<{ batchDigest: string; idempotent: boolean }>;
  finalize(input: { run: ConnectorRunDescriptor; fencingToken: number; observedAt: string; sourceVersion: string }): Promise<void>;
  recordFailure(input: { run: ConnectorRunDescriptor; code: string; message: string; now: Date }): Promise<void>;
}
