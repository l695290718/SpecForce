import type { ArchitectureScopeRef, ContinuousObservationV2, ObservationOperation } from "@specforge/core";

export type ObservationChangeClass = "UNCHANGED" | "CANDIDATE" | "TOMBSTONED" | "CONFLICTED";

export interface PersistedObservationRecord {
  id: string;
  architectureScope: ArchitectureScopeRef;
  connectorId: string;
  sourceNamespace: string;
  externalAssetType: string;
  externalId: string;
  operation: ObservationOperation;
  normalizedDigest: string;
  sourceVersion: string;
  payload: Record<string, unknown>;
  deletionReason: string | null;
  provenance: Record<string, unknown>;
}

export interface ObservationProcessorRepository {
  hasProcessedEvent(scope: ArchitectureScopeRef, eventId: string): Promise<boolean>;
  getObservation(scope: ArchitectureScopeRef, observationId: string): Promise<PersistedObservationRecord | null>;
  findCurrentAsset(scope: ArchitectureScopeRef, externalAssetType: string, externalId: string): Promise<{ id: string; normalizedDigest: string; authoritySource: string | null } | null>;
  saveCandidate(input: { architectureScope: ArchitectureScopeRef; observation: PersistedObservationRecord; classification: ObservationChangeClass; reason: string }): Promise<{ candidateId: string }>;
  recordProcessedEvent(scope: ArchitectureScopeRef, eventId: string, result: ObservationProcessResult): Promise<void>;
}

export interface ContinuousObservationAcceptedEvent {
  id: string;
  architectureScope: ArchitectureScopeRef;
  observationId: string;
  connectorId: string;
  sourceNamespace: string;
}

export interface ObservationProcessResult {
  eventId: string;
  observationId: string;
  classification: ObservationChangeClass;
  candidateId: string | null;
  reason: string;
  idempotent: boolean;
}

export async function processContinuousObservationEvent(event: ContinuousObservationAcceptedEvent, repository: ObservationProcessorRepository): Promise<ObservationProcessResult> {
  const scope = exactScope(event.architectureScope);
  if (await repository.hasProcessedEvent(scope, event.id)) return { eventId: event.id, observationId: event.observationId, classification: "UNCHANGED", candidateId: null, reason: "outbox-replay", idempotent: true };
  const observation = await repository.getObservation(scope, event.observationId);
  if (!observation) throw new Error("OBSERVATION_NOT_FOUND");
  if (observation.architectureScope.applicationServiceId !== scope.applicationServiceId || observation.architectureScope.scopePath !== scope.scopePath || observation.connectorId !== event.connectorId || observation.sourceNamespace !== event.sourceNamespace) throw new Error("OBSERVATION_SCOPE_MISMATCH");
  const current = await repository.findCurrentAsset(scope, observation.externalAssetType, observation.externalId);
  const classification = classifyObservationChange({ operation: observation.operation, normalizedDigest: observation.normalizedDigest, currentDigest: current?.normalizedDigest ?? null, authoritySource: current?.authoritySource ?? null, sourceNamespace: observation.sourceNamespace });
  const reason = reasonFor(classification, current);
  const candidateId = classification === "UNCHANGED" ? null : (await repository.saveCandidate({ architectureScope: scope, observation, classification, reason })).candidateId;
  const result = { eventId: event.id, observationId: observation.id, classification, candidateId, reason, idempotent: false };
  await repository.recordProcessedEvent(scope, event.id, result);
  return result;
}

export function classifyObservationChange(input: { operation: ObservationOperation; normalizedDigest: string; currentDigest: string | null; authoritySource: string | null; sourceNamespace: string }): ObservationChangeClass {
  if (input.operation === "TOMBSTONE") return "TOMBSTONED";
  if (input.currentDigest && input.currentDigest === input.normalizedDigest) return "UNCHANGED";
  if (input.authoritySource && input.authoritySource !== input.sourceNamespace) return "CONFLICTED";
  return "CANDIDATE";
}

function exactScope(scope: ArchitectureScopeRef): ArchitectureScopeRef {
  if (!scope.applicationServiceId?.trim() || !scope.scopePath?.trim()) throw new Error("OBSERVATION_SCOPE_REQUIRED");
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

function reasonFor(classification: ObservationChangeClass, current: { id: string; normalizedDigest: string; authoritySource: string | null } | null): string {
  if (classification === "TOMBSTONED") return "source-tombstone-requires-review";
  if (classification === "CONFLICTED") return `authority-conflict:${current?.authoritySource ?? "unknown"}`;
  if (classification === "CANDIDATE") return current ? "authoritative-asset-changed" : "new-external-identity";
  return "digest-unchanged";
}
