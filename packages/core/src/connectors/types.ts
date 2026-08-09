import type { ArchitectureScopeRef } from "../architecture/types";
import type { ConnectorCapability, ConnectorStatus } from "../federation/types";
import type { ContinuousObservation, ContinuousObservationBatch } from "../federation/continuous";

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
