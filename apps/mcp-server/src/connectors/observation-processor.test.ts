import { describe, expect, it } from "vitest";
import type { ArchitectureScopeRef } from "@specforge/core";
import { classifyObservationChange, processContinuousObservationEvent, type ObservationProcessorRepository, type PersistedObservationRecord } from "./observation-processor";

const scope: ArchitectureScopeRef = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner" };
const observation: PersistedObservationRecord = { id: "observation-1", architectureScope: scope, connectorId: "connector-1", sourceNamespace: "cmdb", externalAssetType: "application-service", externalId: "svc-1", operation: "UPSERT", normalizedDigest: "digest-new", sourceVersion: "v1", payload: { name: "Orders" }, deletionReason: null, provenance: {} };

function repository(overrides: Partial<ObservationProcessorRepository> = {}): ObservationProcessorRepository {
  return { hasProcessedEvent: async () => false, getObservation: async () => observation, findCurrentAsset: async () => null, saveCandidate: async () => ({ candidateId: "candidate-1" }), recordProcessedEvent: async () => undefined, ...overrides };
}

describe("continuous observation processor", () => {
  it("classifies unchanged, new, conflict and tombstone changes", () => {
    expect(classifyObservationChange({ operation: "UPSERT", normalizedDigest: "same", currentDigest: "same", authoritySource: null, sourceNamespace: "cmdb" })).toBe("UNCHANGED");
    expect(classifyObservationChange({ operation: "UPSERT", normalizedDigest: "new", currentDigest: null, authoritySource: null, sourceNamespace: "cmdb" })).toBe("CANDIDATE");
    expect(classifyObservationChange({ operation: "UPSERT", normalizedDigest: "new", currentDigest: "old", authoritySource: "manual", sourceNamespace: "cmdb" })).toBe("CONFLICTED");
    expect(classifyObservationChange({ operation: "TOMBSTONE", normalizedDigest: "deleted", currentDigest: "old", authoritySource: null, sourceNamespace: "cmdb" })).toBe("TOMBSTONED");
  });

  it("loads persisted content and creates a scoped candidate", async () => {
    const saved: string[] = [];
    const result = await processContinuousObservationEvent({ id: "event-1", architectureScope: scope, observationId: observation.id, connectorId: observation.connectorId, sourceNamespace: observation.sourceNamespace }, repository({ saveCandidate: async ({ architectureScope, observation: row }) => { expect(architectureScope).toEqual(scope); expect(row.payload).toEqual({ name: "Orders" }); saved.push(row.id); return { candidateId: "candidate-1" }; } }));
    expect(result).toMatchObject({ classification: "CANDIDATE", candidateId: "candidate-1", idempotent: false });
    expect(saved).toEqual(["observation-1"]);
  });

  it("is idempotent on Outbox replay and rejects Scope mismatch", async () => {
    await expect(processContinuousObservationEvent({ id: "event-1", architectureScope: scope, observationId: observation.id, connectorId: observation.connectorId, sourceNamespace: observation.sourceNamespace }, repository({ hasProcessedEvent: async () => true }))).resolves.toMatchObject({ idempotent: true, reason: "outbox-replay" });
    await expect(processContinuousObservationEvent({ id: "event-2", architectureScope: { ...scope, scopePath: "scope/other" }, observationId: observation.id, connectorId: observation.connectorId, sourceNamespace: observation.sourceNamespace }, repository())).rejects.toThrow("OBSERVATION_SCOPE_MISMATCH");
  });
});
