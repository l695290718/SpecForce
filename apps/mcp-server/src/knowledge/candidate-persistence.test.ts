import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SemanticCandidateBatch } from "@specforge/core";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
const state = vi.hoisted(() => ({
  outbox: undefined as undefined | { idempotencyKey: string; payload: Record<string, unknown> },
  assertions: new Map<string, Record<string, unknown>>(),
  observationSessionId: "scan-session-1"
}));

const transaction = vi.hoisted(() => ({
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  federationOutbox: {
    findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: { idempotencyKey: string } } }) => state.outbox?.idempotencyKey === where.applicationServiceId_scopePath_idempotencyKey.idempotencyKey ? state.outbox : null),
    findMany: vi.fn(async () => state.outbox ? [state.outbox] : []),
    create: vi.fn(async ({ data }: { data: { idempotencyKey: string; payload: Record<string, unknown> } }) => {
      state.outbox = { idempotencyKey: data.idempotencyKey, payload: data.payload };
      return data;
    })
  },
  sourceObservation: {
    findMany: vi.fn(async ({ where }: { where: { id?: { in?: string[] } } }) => (where.id?.in ?? []).map((id) => ({ id, normalizedDigest: `${id}-digest`, payload: { scanSessionId: state.observationSessionId } })))
  },
  knowledgeAssertion: {
    findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: { id: string } } }) => state.assertions.get(where.applicationServiceId_scopePath_id.id) ?? null),
    upsert: vi.fn(async ({ create }: { create: Record<string, unknown> & { id: string } }) => {
      state.assertions.set(create.id, create);
      return create;
    })
  }
}));

const database = vi.hoisted(() => ({
  knowledgeScanSession: {
    findMany: vi.fn().mockResolvedValue([{
      dbId: "scan-db-1",
      id: "scan-session-1",
      applicationServiceId: "com.huawei.celon.desiner",
      scopePath: "designer",
      actorId: "semantic-agent",
      connectorId: "connector-1",
      designChangeSessionId: "design-session-1",
      status: "READY_FOR_ANALYSIS",
      observationCount: 1
    }])
  },
  $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
}));

vi.mock("../persistence", () => ({
  ensureMcpPersistenceSchema: vi.fn().mockResolvedValue(undefined),
  prisma: database,
  resolveWritableScope: vi.fn((_actor, requested) => requested),
  writableActor: vi.fn(() => ({ actorType: "agent", actorId: "semantic-agent", grants: [] }))
}));
vi.mock("./persistence", () => ({ createKnowledgeReviewBundle: vi.fn() }));

import { semanticBatchDigest, semanticCandidateId, submitSemanticCandidateBatch, validateSemanticCandidateBatch } from "./candidate-persistence";

function batch(overrides: Partial<SemanticCandidateBatch> = {}): SemanticCandidateBatch {
  return {
    sessionId: "scan-session-1",
    sequence: 0,
    complete: true,
    provenance: { agent: "claude-code", model: "enterprise-model", runId: "run-1" },
    candidates: [{
      semanticIdentity: "orders.api",
      normalizedDigest: "candidate-digest",
      factType: "api-contract",
      layer: "SYS",
      aspect: "contract",
      value: { canonicalContent: { summary: "Orders API" }, localizedContent: { zh: { summary: "订单 API" } } },
      confidence: 0.92,
      matchingEvidence: ["source:orders"],
      counterEvidence: [],
      unresolvedQuestions: [],
      evidenceRefs: ["evidence:orders"],
      sourceObservationIds: ["source:scan-session-1:orders"],
      domainCluster: "orders",
      identityDecision: "UNAMBIGUOUS"
    }],
    ...overrides
  };
}

beforeEach(() => {
  state.outbox = undefined;
  state.assertions.clear();
  state.observationSessionId = "scan-session-1";
  vi.clearAllMocks();
});

describe("semantic candidate batch persistence", () => {
  it("derives stable candidate and batch identities", () => {
    const input = batch();
    expect(semanticBatchDigest(input)).toMatch(/^[a-f0-9]{64}$/u);
    expect(semanticBatchDigest(input)).toBe(semanticBatchDigest(structuredClone(input)));
    expect(semanticCandidateId(input.sessionId, input.candidates[0]!)).toBe(semanticCandidateId(input.sessionId, structuredClone(input.candidates[0]!)));
  });

  it("rejects unbounded or malformed batches before persistence", () => {
    expect(() => validateSemanticCandidateBatch(batch({ candidates: [] }))).toThrow("SEMANTIC_CANDIDATE_BATCH_EMPTY");
    expect(() => validateSemanticCandidateBatch(batch({ sequence: -1 }))).toThrow("SEMANTIC_CANDIDATE_BATCH_SEQUENCE_INVALID");
    expect(() => validateSemanticCandidateBatch(batch({ candidates: Array.from({ length: 101 }, () => batch().candidates[0]!) }))).toThrow("SEMANTIC_CANDIDATE_BATCH_LIMIT_EXCEEDED");
  });

  it("persists candidate risk and returns an identical retry idempotently", async () => {
    const first = await submitSemanticCandidateBatch({ architectureScope: scope, batch: batch() });
    const second = await submitSemanticCandidateBatch({ architectureScope: scope, batch: batch() });

    expect(first).toMatchObject({ acceptedSequence: 0, idempotent: false, complete: true });
    expect(second).toMatchObject({ acceptedSequence: 0, idempotent: true, acceptedBatchDigest: first.acceptedBatchDigest });
    expect(transaction.knowledgeAssertion.upsert).toHaveBeenCalledOnce();
    expect([...state.assertions.values()][0]).toMatchObject({ riskTier: "T1", domainCluster: "orders", generatedByActorId: "semantic-agent" });
  });

  it("rejects conflicting reuse of an accepted sequence", async () => {
    await submitSemanticCandidateBatch({ architectureScope: scope, batch: batch() });
    await expect(submitSemanticCandidateBatch({ architectureScope: scope, batch: batch({ complete: false }) })).rejects.toThrow("SEMANTIC_CANDIDATE_BATCH_IDEMPOTENCY_CONFLICT");
  });

  it("rejects new sequences after a final semantic batch while allowing its identical retry", async () => {
    const finalReceipt = await submitSemanticCandidateBatch({ architectureScope: scope, batch: batch() });
    await expect(submitSemanticCandidateBatch({ architectureScope: scope, batch: batch({ sequence: 1, previousBatchDigest: finalReceipt.acceptedBatchDigest, complete: false }) })).rejects.toThrow("SEMANTIC_CANDIDATE_BATCH_ALREADY_FINALIZED");
    await expect(submitSemanticCandidateBatch({ architectureScope: scope, batch: batch() })).resolves.toMatchObject({ idempotent: true });
  });

  it("rejects observations whose payload belongs to another Scan Session", async () => {
    state.observationSessionId = "scan-session-sibling";
    await expect(submitSemanticCandidateBatch({ architectureScope: scope, batch: batch() })).rejects.toThrow("SEMANTIC_CANDIDATE_OBSERVATION_SESSION_MISMATCH");
  });

  it("rejects a Scope assertion that differs from the persisted Session", async () => {
    await expect(submitSemanticCandidateBatch({ architectureScope: { ...scope, scopePath: "sibling" }, batch: batch() })).rejects.toThrow("SCOPE_MISMATCH");
  });
});
