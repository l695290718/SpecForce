import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../persistence";
import { appendFederationOutbox, listConnectors, listPersistedCanonicalFederatedFacts, promoteCandidate, reconcilePersistedScope, recordObservation, registerConnector } from "./persistence";

const designerScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;
const policyScope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
} as const;
const siblingScope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
} as const;

const connector = {
  id: "designer-connector",
  kind: "repository",
  capabilities: ["OBSERVE"],
  status: "ACTIVE",
  secretReference: "secret://designer"
} as const;
const observation = {
  id: "observation-1",
  sourceNamespace: "github",
  externalAssetType: "api",
  externalId: "payments-api",
  payload: { version: 1 },
  normalizedDigest: "digest-1",
  sourceVersion: "abc123",
  observedAt: "2026-07-19T00:00:00.000Z",
  status: "CANDIDATE",
  provenance: {
    sourceSystem: "github",
    connectorInstanceId: connector.id,
    observedAt: "2026-07-19T00:00:00.000Z"
  },
  idempotencyKey: "observation:github:payments-api:abc123"
} as const;

type Row = Record<string, unknown>;
const rows = { connectors: [] as Row[], observations: [] as Row[], outbox: [] as Row[], mappings: [] as Row[], policies: [] as Row[], sessions: [] as Row[] };
let failOutbox = false;
let observationUpsertCalls = 0;
let outboxUpsertCalls = 0;
const candidateFact = {
  id: "fact-1", assetType: "api", schemaVersion: "1", payload: { name: "Payments API" }, localizedContent: { en: { name: "Payments API", description: "Payments interface" }, zh: { name: "支付 API", description: "支付接口" } }, normalizedDigest: "digest-1", authority: "EXTERNAL", confidence: 1,
  provenance: { sourceSystem: "github", connectorInstanceId: connector.id, observedAt: observation.observedAt }
} as const;

beforeEach(() => {
  process.env.SPECFORGE_MCP_SEED = "1";
  rows.connectors.length = 0;
  rows.observations.length = 0;
  rows.outbox.length = 0;
  rows.mappings.length = 0;
  rows.policies.length = 0;
  rows.sessions.length = 0;
  failOutbox = false;
  observationUpsertCalls = 0;
  outboxUpsertCalls = 0;
  const client = prisma as unknown as Record<string, unknown>;
  client.connectorInstance = {
    upsert: vi.fn(async ({ create, update, where }: { create: Row; update: Row; where: { applicationServiceId_scopePath_id: Row } }) => {
      const key = where.applicationServiceId_scopePath_id;
      const existing = rows.connectors.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath);
      if (existing) return Object.assign(existing, update);
      rows.connectors.push(create);
      return create;
    }),
    findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: Row } }) => rows.connectors.find((row) => {
      const key = where.applicationServiceId_scopePath_id;
      return row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath;
    }) ?? null),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => rows.connectors.find((row) => row.id === where.id) ?? null),
    findMany: vi.fn(async ({ where }: { where: Row }) => rows.connectors.filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath))
  };
  client.externalIdentityMapping = {
    findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_connectorId_sourceNamespace_externalAssetType_externalId: Row } }) => {
      const key = where.applicationServiceId_scopePath_connectorId_sourceNamespace_externalAssetType_externalId;
      return rows.mappings.find((row) => Object.entries(key).every(([name, value]) => row[name] === value)) ?? null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows.mappings.find((row) => Object.entries(where).every(([name, value]) => row[name] === value)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Row }) => rows.mappings.filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath))
  };
  client.authorityPolicy = {
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows.policies.find((row) => Object.entries(where).every(([name, value]) => row[name] === value)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Row }) => rows.policies.filter((row) => Object.entries(where).every(([name, value]) => row[name] === value)))
  };
  client.designChangeSession = { findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: Row } }) => {
    const key = where.applicationServiceId_scopePath_id;
    return rows.sessions.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath) ?? null;
  }) };
  client.reconciliationSnapshot = { upsert: vi.fn() };
  client.sourceObservation = {
    findUnique: vi.fn(async ({ where }: { where: Row }) => {
      const key = (where.applicationServiceId_scopePath_id ?? where.applicationServiceId_scopePath_idempotencyKey) as Row;
      return rows.observations.find((row) => Object.entries(key).every(([name, value]) => row[name] === value)) ?? null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows.observations.find((row) => Object.entries(where).every(([name, value]) => row[name] === value)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Row }) => rows.observations.filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath && (where.status === undefined || row.status === where.status))),
    update: vi.fn(async ({ where, data }: { where: { applicationServiceId_scopePath_id: Row }; data: Row }) => {
      const row = rows.observations.find((candidate) => Object.entries(where.applicationServiceId_scopePath_id).every(([name, value]) => candidate[name] === value));
      return Object.assign(row!, data);
    }),
    upsert: vi.fn(async ({ where, create }: { where: { applicationServiceId_scopePath_idempotencyKey: Row }; create: Row }) => {
      const key = where.applicationServiceId_scopePath_idempotencyKey;
      const existing = rows.observations.find((row) => Object.entries(key).every(([name, value]) => row[name] === value));
      if (existing) return existing;
      rows.observations.push(create);
      return create;
    })
  };
  client.federationOutbox = {
    findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: Row } }) => rows.outbox.find((row) => Object.entries(where.applicationServiceId_scopePath_idempotencyKey).every(([name, value]) => row[name] === value)) ?? null),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { ...data, dbId: `outbox-${rows.outbox.length + 1}`, availableAt: data.availableAt ?? new Date(), sentAt: null, attemptCount: 0, lastError: null };
      rows.outbox.push(row);
      return row;
    }),
    upsert: vi.fn(async ({ where, create }: { where: { applicationServiceId_scopePath_idempotencyKey: Row }; create: Row }) => {
      const key = where.applicationServiceId_scopePath_idempotencyKey;
      const existing = rows.outbox.find((row) => Object.entries(key).every(([name, value]) => row[name] === value));
      if (existing) return existing;
      const row = { ...create, dbId: `outbox-${rows.outbox.length + 1}`, availableAt: create.availableAt ?? new Date(), sentAt: null, attemptCount: 0, lastError: null };
      rows.outbox.push(row);
      return row;
    })
  };
  client.$transaction = vi.fn(async (operation: (transaction: Row) => Promise<unknown>) => {
    const snapshot = structuredClone(rows);
    try { return await operation({
    sourceObservation: {
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: Row } }) => rows.observations.find((row) => row.idempotencyKey === where.applicationServiceId_scopePath_idempotencyKey.idempotencyKey && row.applicationServiceId === where.applicationServiceId_scopePath_idempotencyKey.applicationServiceId && row.scopePath === where.applicationServiceId_scopePath_idempotencyKey.scopePath) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => { rows.observations.push(data); return data; }),
      upsert: vi.fn(async ({ where, create }: { where: { applicationServiceId_scopePath_idempotencyKey: Row }; create: Row }) => {
        observationUpsertCalls++;
        const key = where.applicationServiceId_scopePath_idempotencyKey;
        const existing = rows.observations.find((row) => Object.entries(key).every(([name, value]) => row[name] === value));
        if (existing) return existing;
        rows.observations.push(create); return create;
      }),
      update: vi.fn(async ({ data }: { data: Row }) => data)
    },
    federationOutbox: {
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: Row } }) => rows.outbox.find((row) => row.idempotencyKey === where.applicationServiceId_scopePath_idempotencyKey.idempotencyKey && row.applicationServiceId === where.applicationServiceId_scopePath_idempotencyKey.applicationServiceId && row.scopePath === where.applicationServiceId_scopePath_idempotencyKey.scopePath) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (failOutbox) throw new Error("OUTBOX_WRITE_FAILED");
        const row = { ...data, dbId: `outbox-${rows.outbox.length + 1}`, availableAt: data.availableAt ?? new Date(), sentAt: null, attemptCount: 0, lastError: null };
        rows.outbox.push(row);
        return row;
      }),
      upsert: vi.fn(async ({ where, create }: { where: { applicationServiceId_scopePath_idempotencyKey: Row }; create: Row }) => {
        outboxUpsertCalls++;
        const key = where.applicationServiceId_scopePath_idempotencyKey;
        const existing = rows.outbox.find((row) => Object.entries(key).every(([name, value]) => row[name] === value));
        if (existing) return existing;
        if (failOutbox) throw new Error("OUTBOX_WRITE_FAILED");
        const row = { ...create, dbId: `outbox-${rows.outbox.length + 1}`, availableAt: create.availableAt ?? new Date(), sentAt: null, attemptCount: 0, lastError: null };
        rows.outbox.push(row);
        return row;
      })
    },
    designChangeSession: {
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: Row } }) => {
        const key = where.applicationServiceId_scopePath_id;
        return rows.sessions.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath) ?? null;
      })
    }
    }); } catch (error) { Object.assign(rows, snapshot); throw error; }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SPECFORGE_MCP_SEED;
});

describe("federation persistence", () => {
  it("rejects an observation whose Scope differs from the connector Scope", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await expect(recordObservation({ ...observation, connectorId: connector.id, architectureScope: siblingScope })).rejects.toThrow("SCOPE_MISMATCH");
  });

  it("records an observation and pending outbox event atomically", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    expect(rows.observations).toHaveLength(1);
    expect(rows.outbox).toEqual([expect.objectContaining({ status: "PENDING", applicationServiceId: designerScope.applicationServiceId, scopePath: designerScope.scopePath })]);
    expect((prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction).toHaveBeenCalledOnce();
  });

  it("keeps identical external identities isolated between application services", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await registerConnector({ ...connector, architectureScope: policyScope });
    await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    await recordObservation({ ...observation, connectorId: connector.id, architectureScope: policyScope });
    expect(rows.observations).toHaveLength(2);
    expect(rows.observations.map((row) => row.applicationServiceId)).toEqual([designerScope.applicationServiceId, policyScope.applicationServiceId]);
  });

  it("replays an observation idempotency key without another outbox event", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    const first = await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    const replay = await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    expect(replay).toEqual(first);
    expect(rows.outbox).toHaveLength(1);
  });

  it("concurrently upserts one observation and one outbox receipt", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    const [first, replay] = await Promise.all([recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope }), recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })]);
    expect(replay).toEqual(first);
    expect(rows.observations).toHaveLength(1);
    expect(rows.outbox).toHaveLength(1);
    expect(observationUpsertCalls).toBeGreaterThan(0);
    expect(outboxUpsertCalls).toBeGreaterThan(0);
  });

  it("rolls back the observation when its outbox write fails", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    failOutbox = true;
    await expect(recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })).rejects.toThrow("OUTBOX_WRITE_FAILED");
    expect(rows.observations).toHaveLength(0);
  });

  it("does not persist a snapshot during read-only reconciliation", async () => {
    await reconcilePersistedScope({ architectureScope: designerScope, acceptedFacts: [] });
    expect((prisma as unknown as { reconciliationSnapshot: { upsert: ReturnType<typeof vi.fn> } }).reconciliationSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("loads only persisted promoted canonical facts inside the exact Scope", async () => {
    rows.observations.push({
      ...observation,
      ...designerScope,
      status: "PROMOTED",
      payload: promotedFactPayload()
    });
    rows.observations.push({
      ...rows.observations[0]!,
      id: "other-scope-observation",
      ...policyScope
    });

    await expect(listPersistedCanonicalFederatedFacts(designerScope)).resolves.toEqual([expect.objectContaining({ id: "fact-1", architectureScope: designerScope, status: "PROMOTED" })]);
    expect((prisma as unknown as { sourceObservation: { findMany: ReturnType<typeof vi.fn> } }).sourceObservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...designerScope, status: "PROMOTED" } }));
  });

  it("fails closed when a promoted row does not contain an exact-Scope canonical envelope", async () => {
    rows.observations.push({ ...observation, ...designerScope, status: "PROMOTED", payload: { id: "raw-observation" } });
    await expect(listPersistedCanonicalFederatedFacts(designerScope)).rejects.toThrow("CANONICAL_FACT_INVALID");
  });

  it.each([
    ["relationshipRefs", { relationshipRefs: ["valid", 42] }],
    ["evidenceRefs", { evidenceRefs: ["valid", null] }],
    ["designChangeSessionId", { designChangeSessionId: 42 }],
    ["provenance externalIdentity", { provenance: { ...promotedFactPayload().provenance as Row, externalIdentity: 42 } }],
    ["provenance externalVersion", { provenance: { ...promotedFactPayload().provenance as Row, externalVersion: 42 } }],
    ["provenance sourceTimestamp", { provenance: { ...promotedFactPayload().provenance as Row, sourceTimestamp: 42 } }],
    ["provenance repositoryCommit", { provenance: { ...promotedFactPayload().provenance as Row, repositoryCommit: 42 } }],
    ["localized English content", { localizedContent: { en: "invalid", zh: { name: "支付 API" } } }],
    ["confidence", { confidence: 2 }]
  ] as const)("rejects malformed %s in persisted canonical envelopes", async (_field, overrides) => {
    rows.observations.push({ ...observation, ...designerScope, status: "PROMOTED", payload: promotedFactPayload(overrides) });
    await expect(listPersistedCanonicalFederatedFacts(designerScope)).rejects.toThrow("CANONICAL_FACT_INVALID");
  });

  it("rejects a federation outbox session from another Scope", async () => {
    rows.sessions.push({ id: "session-1", ...policyScope });
    await expect(appendFederationOutbox({ eventType: "TEST", payload: {}, idempotencyKey: "session-outbox", designChangeSessionId: "session-1", architectureScope: designerScope })).rejects.toThrow("DESIGN_CHANGE_SESSION_SCOPE_MISMATCH");
  });

  it("rejects a federation outbox session that does not exist in Scope", async () => {
    await expect(appendFederationOutbox({ eventType: "TEST", payload: {}, idempotencyKey: "missing-session-outbox", designChangeSessionId: "missing-session", architectureScope: designerScope })).rejects.toThrow("DESIGN_CHANGE_SESSION_SCOPE_MISMATCH");
  });

  it("rejects promotion without complete Chinese localization", async () => {
    arrangePromotion();
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: { ...candidateFact, localizedContent: { en: candidateFact.localizedContent.en, zh: {} } } })).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("rejects a partial Chinese localization overlay for a human-facing fact", async () => {
    arrangePromotion();
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: { ...candidateFact, localizedContent: { en: candidateFact.localizedContent.en, zh: { name: "支付 API" } } } })).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("rejects a human-facing fact without an English canonical overlay", async () => {
    arrangePromotion();
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: { ...candidateFact, localizedContent: { zh: candidateFact.localizedContent.zh } } })).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("rejects promotion without an explicit humanFacing signal", async () => {
    arrangePromotion();
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, fact: candidateFact } as unknown as Parameters<typeof promoteCandidate>[0])).rejects.toThrow("HUMAN_FACING_REQUIRED");
  });

  it("rejects promotion when authority policy disables it", async () => {
    arrangePromotion({ promotionMode: "DISABLED" });
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).rejects.toThrow("POLICY_DISABLED");
  });

  it("rejects promotion with an ambiguous identity mapping", async () => {
    arrangePromotion({ matchStatus: "AMBIGUOUS" });
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).rejects.toThrow("IDENTITY_CONFLICT");
  });

  it("rejects a candidate whose Scope differs from the requested Scope", async () => {
    arrangePromotion();
    Object.assign(rows.mappings[0]!, policyScope);
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).rejects.toThrow("SCOPE_MISMATCH");
  });

  it.each(["REJECTED", "TOMBSTONED", "CONFLICTED"])('rejects a %s candidate', async (status) => {
    arrangePromotion({ status });
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).rejects.toThrow("CANDIDATE_STATUS_INVALID");
  });

  it("rejects multiple applicable authority policies", async () => {
    arrangePromotion();
    rows.policies.push({ ...rows.policies[0]!, id: "policy-2", policyVersion: "2" });
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).rejects.toThrow("AUTHORITY_POLICY_AMBIGUOUS");
  });

  it("rejects promotion without an applicable authority policy", async () => {
    arrangePromotion();
    rows.policies.length = 0;
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).rejects.toThrow("AUTHORITY_MISSING");
  });

  it("promotes a valid scoped candidate", async () => {
    arrangePromotion();
    await expect(promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact })).resolves.toMatchObject({ id: candidateFact.id, status: "PROMOTED", architectureScope: designerScope });
    expect(rows.observations[0]).toMatchObject({ status: "PROMOTED", ...designerScope, payload: expect.objectContaining({ id: candidateFact.id, status: "PROMOTED", architectureScope: designerScope }) });
  });

  it("retires an earlier revision and reconciles only the current canonical fact", async () => {
    arrangePromotion();
    await promoteCandidate({ candidateId: observation.id, architectureScope: designerScope, humanFacing: true, fact: candidateFact });
    rows.observations.push({
      ...observation,
      id: "observation-2",
      connectorId: connector.id,
      sourceVersion: "def456",
      idempotencyKey: "observation:github:payments-api:def456",
      normalizedDigest: "digest-2",
      payload: { version: 2 },
      observedAt: new Date("2026-07-20T00:00:00.000Z"),
      ...designerScope
    });

    await promoteCandidate({
      candidateId: "observation-2",
      architectureScope: designerScope,
      humanFacing: true,
      fact: { ...candidateFact, payload: { name: "Payments API v2" }, normalizedDigest: "digest-2" }
    });

    expect(rows.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: observation.id, status: "TOMBSTONED" }),
      expect.objectContaining({ id: "observation-2", status: "PROMOTED" })
    ]));
    const currentFacts = await listPersistedCanonicalFederatedFacts(designerScope);
    expect(currentFacts).toHaveLength(1);
    expect(currentFacts[0]).toMatchObject({ id: candidateFact.id, normalizedDigest: "digest-2", payload: { name: "Payments API v2" } });
    await expect(reconcilePersistedScope({ architectureScope: designerScope, acceptedFacts: currentFacts })).resolves.toMatchObject({ status: "CONVERGED", issues: [] });
  });
});

function arrangePromotion(overrides: Row = {}) {
  rows.observations.push({ ...observation, connectorId: connector.id, ...designerScope, observedAt: new Date(observation.observedAt), ...overrides });
  rows.mappings.push({ id: "mapping-1", connectorId: connector.id, sourceNamespace: observation.sourceNamespace, externalAssetType: observation.externalAssetType, externalId: observation.externalId, assetType: candidateFact.assetType, assetId: candidateFact.id, matchStatus: "UNAMBIGUOUS", normalizedDigest: observation.normalizedDigest, ...designerScope, ...overrides });
  rows.policies.push({ id: "policy-1", assetType: candidateFact.assetType, fieldPath: "$", authority: "EXTERNAL", promotionMode: "AUTO", policyVersion: "1", ...designerScope, ...overrides });
}

function promotedFactPayload(overrides: Row = {}): Row {
  return {
    id: "fact-1",
    architectureScope: designerScope,
    assetType: "api",
    schemaVersion: "1",
    payload: { name: "Payments API" },
    localizedContent: { en: { name: "Payments API" }, zh: { name: "支付 API" } },
    normalizedDigest: "digest-1",
    provenance: { sourceSystem: "github", connectorInstanceId: connector.id, observedAt: observation.observedAt },
    authority: "EXTERNAL",
    confidence: 1,
    status: "PROMOTED",
    ...overrides
  };
}
