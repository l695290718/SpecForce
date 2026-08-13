import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentDigest } from "@specforge/core";
import { prisma } from "../persistence";
import { appendFederationOutbox, archiveFederationOutbox, closeDesignChangeSession, createDesignChangeSession, listConnectors, listPersistedCanonicalFederatedFacts, promoteCandidate, reconcilePersistedScope, recordObservation, registerConnector } from "./persistence";

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
  payload: { name: "Payments API", localizedContent: { en: { name: "Payments API", description: "Payments interface" }, zh: { name: "支付 API", description: "支付接口" } } },
  normalizedDigest: contentDigest({ name: "Payments API" }),
  sourceVersion: "abc123",
  observedAt: "2026-07-19T00:00:00.000Z",
  status: "CANDIDATE",
  provenance: {
    sourceSystem: "github",
    connectorInstanceId: connector.id,
    externalIdentity: "api:payments-api",
    externalVersion: "abc123",
    observedAt: "2026-07-19T00:00:00.000Z"
  },
  idempotencyKey: "observation:github:payments-api:abc123"
} as const;

type Row = Record<string, unknown>;
const rows = { connectors: [] as Row[], observations: [] as Row[], outbox: [] as Row[], mappings: [] as Row[], policies: [] as Row[], sessions: [] as Row[] };
let failOutbox = false;
let failPromotionUpdate = false;
let observationUpsertCalls = 0;
let outboxUpsertCalls = 0;
let promotionLockCalls = 0;
let advisoryLockKeys: string[] = [];
let transactionTail = Promise.resolve();
const candidateFact = {
  id: "fact-1", assetType: "api", schemaVersion: "1", payload: { name: "Payments API" }, localizedContent: { en: { name: "Payments API", description: "Payments interface" }, zh: { name: "支付 API", description: "支付接口" } }, normalizedDigest: observation.normalizedDigest, authority: "EXTERNAL", confidence: 1,
  provenance: observation.provenance
} as const;
const candidateLocalizedContent = observation.payload.localizedContent;
const changeSession = {
  id: "session-1",
  actorId: "caller-agent",
  intent: "Review the Payments API contract.",
  affectedFactIds: ["fact-1"],
  expectedEvidenceRefs: [],
  status: "OPEN"
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
  failPromotionUpdate = false;
  observationUpsertCalls = 0;
  outboxUpsertCalls = 0;
  promotionLockCalls = 0;
  advisoryLockKeys = [];
  transactionTail = Promise.resolve();
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
  client.designChangeSession = {
    findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: Row } }) => {
      const key = where.applicationServiceId_scopePath_id;
      return rows.sessions.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath) ?? null;
    }),
    update: vi.fn(async ({ where, data }: { where: { applicationServiceId_scopePath_id: Row }; data: Row }) => {
      const key = where.applicationServiceId_scopePath_id;
      const row = rows.sessions.find((candidate) => candidate.id === key.id && candidate.applicationServiceId === key.applicationServiceId && candidate.scopePath === key.scopePath);
      return Object.assign(row!, data, { updatedAt: new Date() });
    })
  };
  client.reconciliationSnapshot = { upsert: vi.fn() };
  client.sourceObservation = {
    findUnique: vi.fn(async ({ where }: { where: Row }) => {
      const key = (where.applicationServiceId_scopePath_id ?? where.applicationServiceId_scopePath_idempotencyKey) as Row;
      return rows.observations.find((row) => Object.entries(key).every(([name, value]) => row[name] === value)) ?? null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => rows.observations.find((row) => Object.entries(where).every(([name, value]) => row[name] === value)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Row }) => rows.observations.filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath && statusMatches(row.status, where.status))),
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
    const predecessor = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await predecessor;
    const snapshot = structuredClone(rows);
    try { return await operation({
    auditLog: { create: vi.fn(async ({ data }: { data: Row }) => data) },
    connectorInstance: {
      upsert: vi.fn(async ({ create, update, where }: { create: Row; update: Row; where: { applicationServiceId_scopePath_id: Row } }) => {
        const key = where.applicationServiceId_scopePath_id;
        const existing = rows.connectors.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath);
        if (existing) return Object.assign(existing, update);
        rows.connectors.push(create); return create;
      }),
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: Row } }) => {
        const key = where.applicationServiceId_scopePath_id;
        return rows.connectors.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => rows.connectors.find((row) => row.id === where.id) ?? null)
    },
    sourceObservation: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const key = (where.applicationServiceId_scopePath_id ?? where.applicationServiceId_scopePath_idempotencyKey) as Row;
        return rows.observations.find((row) => Object.entries(key).every(([name, value]) => row[name] === value)) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => rows.observations.find((row) => Object.entries(where).every(([name, value]) => row[name] === value)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => rows.observations.filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath && statusMatches(row.status, where.status))),
      create: vi.fn(async ({ data }: { data: Row }) => { rows.observations.push(data); return data; }),
      upsert: vi.fn(async ({ where, create }: { where: { applicationServiceId_scopePath_idempotencyKey: Row }; create: Row }) => {
        observationUpsertCalls++;
        const key = where.applicationServiceId_scopePath_idempotencyKey;
        const existing = rows.observations.find((row) => Object.entries(key).every(([name, value]) => row[name] === value));
        if (existing) return existing;
        rows.observations.push(create); return create;
      }),
      update: vi.fn(async ({ where, data }: { where: { applicationServiceId_scopePath_id: Row }; data: Row }) => {
        if (failPromotionUpdate && data.status === "PROMOTED") throw new Error("PROMOTION_WRITE_FAILED");
        const row = rows.observations.find((candidate) => Object.entries(where.applicationServiceId_scopePath_id).every(([name, value]) => candidate[name] === value));
        return Object.assign(row!, data);
      })
    },
    externalIdentityMapping: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const key = where.applicationServiceId_scopePath_connectorId_sourceNamespace_externalAssetType_externalId as Row;
        return rows.mappings.find((row) => Object.entries(key).every(([name, value]) => row[name] === value)) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => rows.mappings.find((row) => Object.entries(where).every(([name, value]) => row[name] === value)) ?? null)
    },
    authorityPolicy: {
      findMany: vi.fn(async ({ where }: { where: Row }) => rows.policies.filter((row) => Object.entries(where).every(([name, value]) => row[name] === value)))
    },
    $executeRawUnsafe: vi.fn(async (...args: unknown[]) => {
      promotionLockCalls++;
      advisoryLockKeys.push(String(args[1]));
      return [];
    }),
    federationOutbox: {
      findMany: vi.fn(async ({ where, take }: { where: Row; take: number }) => rows.outbox
        .filter((row) => row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath && statusMatches(row.status, where.status) && (row.createdAt as Date) < (where.createdAt as { lt: Date }).lt)
        .slice(0, take)
        .map((row) => ({ dbId: row.dbId, eventType: row.eventType, status: row.status, createdAt: row.createdAt, designChangeSessionId: row.designChangeSessionId }))),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const ids = new Set(((where.dbId as { in: string[] }).in));
        const matches = rows.outbox.filter((row) => ids.has(String(row.dbId)) && row.applicationServiceId === where.applicationServiceId && row.scopePath === where.scopePath && statusMatches(row.status, where.status));
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      }),
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
      upsert: vi.fn(async ({ create, update, where }: { create: Row; update: Row; where: { applicationServiceId_scopePath_id: Row } }) => {
        const key = where.applicationServiceId_scopePath_id;
        const existing = rows.sessions.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath);
        if (existing) return Object.assign(existing, update);
        const created = { ...create, openedAt: create.openedAt ?? new Date(), updatedAt: new Date() };
        rows.sessions.push(created); return created;
      }),
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_id: Row } }) => {
        const key = where.applicationServiceId_scopePath_id;
        return rows.sessions.find((row) => row.id === key.id && row.applicationServiceId === key.applicationServiceId && row.scopePath === key.scopePath) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { applicationServiceId_scopePath_id: Row }; data: Row }) => {
        const key = where.applicationServiceId_scopePath_id;
        const row = rows.sessions.find((candidate) => candidate.id === key.id && candidate.applicationServiceId === key.applicationServiceId && candidate.scopePath === key.scopePath);
        return Object.assign(row!, data, { updatedAt: new Date() });
      })
    }
    }); } catch (error) { Object.assign(rows, snapshot); throw error; } finally { release(); }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SPECFORGE_MCP_SEED;
});

describe("federation persistence", () => {
  it("registers one exact-Scope connector delivery event", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });

    expect(rows.outbox).toEqual([expect.objectContaining({
      eventType: "FEDERATION_CONNECTOR_REGISTERED",
      status: "PENDING",
      applicationServiceId: designerScope.applicationServiceId,
      scopePath: designerScope.scopePath,
      idempotencyKey: expect.stringContaining("FEDERATION_CONNECTOR_REGISTERED")
    })]);
  });

  it("replays connector registration without another delivery event", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await registerConnector({ ...connector, architectureScope: designerScope });

    expect(rows.connectors).toHaveLength(1);
    expect(rows.outbox).toHaveLength(1);
  });

  it("archives a bounded historical Outbox slice without deleting payload records", async () => {
    rows.outbox.push(
      { dbId: "outbox-old-1", eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CREATED", status: "PENDING", payload: { keep: true }, createdAt: new Date("2026-08-01T00:00:00.000Z"), designChangeSessionId: "session-1", ...designerScope },
      { dbId: "outbox-current", eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CREATED", status: "PENDING", payload: { keep: true }, createdAt: new Date("2026-08-13T00:00:00.000Z"), designChangeSessionId: "session-1", ...designerScope },
      { dbId: "outbox-other-scope", eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CREATED", status: "PENDING", payload: { keep: true }, createdAt: new Date("2026-08-01T00:00:00.000Z"), designChangeSessionId: "session-1", ...policyScope }
    );

    const result = await archiveFederationOutbox({
      architectureScope: designerScope,
      before: "2026-08-13T00:00:00.000Z",
      statuses: ["PENDING"],
      limit: 1,
      reason: "Superseded historical events after exact-Scope operational reconciliation."
    });

    expect(result).toMatchObject({ architectureScope: designerScope, archivedCount: 1, archivedIds: ["outbox-old-1"] });
    expect(rows.outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ dbId: "outbox-old-1", status: "ARCHIVED", payload: { keep: true }, ...designerScope }),
      expect.objectContaining({ dbId: "outbox-current", status: "PENDING", ...designerScope }),
      expect.objectContaining({ dbId: "outbox-other-scope", status: "PENDING", ...policyScope })
    ]));
  });

  it("keeps connector registration delivery keys and references isolated by Scope", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await registerConnector({ ...connector, architectureScope: policyScope });

    expect(rows.outbox).toHaveLength(2);
    expect(new Set(rows.outbox.map((row) => row.idempotencyKey)).size).toBe(2);
    expect(rows.outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ applicationServiceId: designerScope.applicationServiceId, scopePath: designerScope.scopePath }),
      expect.objectContaining({ applicationServiceId: policyScope.applicationServiceId, scopePath: policyScope.scopePath })
    ]));
  });

  it("rolls back connector registration when its delivery event fails", async () => {
    failOutbox = true;

    await expect(registerConnector({ ...connector, architectureScope: designerScope })).rejects.toThrow("OUTBOX_WRITE_FAILED");

    expect(rows.connectors).toHaveLength(0);
    expect(rows.outbox).toHaveLength(0);
  });

  it.each([
    ["SUSPENDED", ["OBSERVE"]],
    ["REVOKED", ["OBSERVE"]],
    ["ACTIVE", []]
  ] as const)("rejects observation for connector status/capability %s/%j inside the transaction", async (status, capabilities) => {
    await registerConnector({ ...connector, status, capabilities, architectureScope: designerScope });

    await expect(recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })).rejects.toThrow(
      status !== "ACTIVE" ? "CONNECTOR_NOT_ACTIVE" : "CONNECTOR_CAPABILITY_MISSING"
    );
    expect(rows.observations).toHaveLength(0);
  });

  it("rechecks an active OBSERVE connector and records the observation", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });

    await expect(recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })).resolves.toMatchObject({ id: observation.id });
    expect(rows.observations).toHaveLength(1);
  });

  it("serializes a concurrent revoke before observation and records no invalid observation", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    advisoryLockKeys = [];

    const [revoke, observe] = await Promise.allSettled([
      registerConnector({ ...connector, status: "REVOKED", architectureScope: designerScope }),
      recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })
    ]);

    expect(revoke.status).toBe("fulfilled");
    expect(observe).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: "CONNECTOR_NOT_ACTIVE" }) });
    expect(rows.connectors).toEqual([expect.objectContaining({ id: connector.id, status: "REVOKED", ...designerScope })]);
    expect(rows.observations).toHaveLength(0);
    expect(advisoryLockKeys.filter((key) => key.endsWith(`|connector|${connector.id}`))).toHaveLength(2);
  });

  it("rejects an observation whose Scope differs from the connector Scope", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await expect(recordObservation({ ...observation, connectorId: connector.id, architectureScope: siblingScope })).rejects.toThrow("SCOPE_MISMATCH");
  });

  it("records an observation and pending outbox event atomically", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    expect(rows.observations).toHaveLength(1);
    expect(rows.outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "FEDERATION_CONNECTOR_REGISTERED", status: "PENDING", applicationServiceId: designerScope.applicationServiceId, scopePath: designerScope.scopePath }),
      expect.objectContaining({ eventType: "FEDERATION_OBSERVATION_RECORDED", status: "PENDING", applicationServiceId: designerScope.applicationServiceId, scopePath: designerScope.scopePath })
    ]));
    expect((prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction).toHaveBeenCalledTimes(2);
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
    expect(rows.outbox).toHaveLength(2);
  });

  it("concurrently upserts one observation and one outbox receipt", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    const [first, replay] = await Promise.all([recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope }), recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })]);
    expect(replay).toEqual(first);
    expect(rows.observations).toHaveLength(1);
    expect(rows.outbox).toHaveLength(2);
    expect(observationUpsertCalls).toBeGreaterThan(0);
    expect(outboxUpsertCalls).toBeGreaterThan(0);
  });

  it("rolls back the observation when its outbox write fails", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    failOutbox = true;
    await expect(recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope })).rejects.toThrow("OUTBOX_WRITE_FAILED");
    expect(rows.observations).toHaveLength(0);
    expect(rows.outbox).toHaveLength(1);
  });

  it("loads canonical facts inside persistence during read-only reconciliation", async () => {
    rows.observations.push({ ...observation, ...designerScope, observedAt: new Date(observation.observedAt), status: "PROMOTED", payload: promotedFactPayload() });
    await reconcilePersistedScope({ architectureScope: designerScope });
    expect((prisma as unknown as { sourceObservation: { findMany: ReturnType<typeof vi.fn> } }).sourceObservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ...designerScope, status: "PROMOTED" } }));
    expect((prisma as unknown as { reconciliationSnapshot: { upsert: ReturnType<typeof vi.fn> } }).reconciliationSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("does not accept caller-injected canonical facts during reconciliation", async () => {
    await expect(reconcilePersistedScope({ architectureScope: designerScope, acceptedFacts: [{ id: "caller-injected" }] } as never)).resolves.not.toMatchObject({ factDigests: [{ factId: "caller-injected" }] });
  });

  it("does not persist a snapshot during read-only reconciliation", async () => {
    await reconcilePersistedScope({ architectureScope: designerScope });
    expect((prisma as unknown as { reconciliationSnapshot: { upsert: ReturnType<typeof vi.fn> } }).reconciliationSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("reconciles active candidate observations as external changes", async () => {
    rows.observations.push({
      ...observation,
      connectorId: connector.id,
      ...designerScope,
      observedAt: new Date(observation.observedAt),
      status: "CANDIDATE"
    });

    await expect(reconcilePersistedScope({ architectureScope: designerScope })).resolves.toMatchObject({
      issues: [expect.objectContaining({ code: "UNDECLARED_CHANGE", externalId: observation.externalId })]
    });
  });

  it("ignores an older source version after a newer exact-identity observation", async () => {
    const latestObservedAt = "2026-07-20T00:00:00.000Z";
    const olderPayload = { name: "Payments API v1", localizedContent: candidateLocalizedContent };
    rows.observations.push({
      ...observation,
      id: "older-observation",
      connectorId: connector.id,
      ...designerScope,
      sourceVersion: "9",
      observedAt: new Date("2026-07-19T00:00:00.000Z"),
      status: "CANDIDATE",
      payload: olderPayload,
      normalizedDigest: contentDigest({ name: "Payments API v1" }),
      provenance: { ...observation.provenance, externalVersion: "9", observedAt: "2026-07-19T00:00:00.000Z" }
    });
    rows.observations.push({
      ...observation,
      id: "latest-canonical-observation",
      connectorId: connector.id,
      ...designerScope,
      sourceVersion: "10",
      observedAt: new Date(latestObservedAt),
      status: "PROMOTED",
      payload: promotedFactPayload(),
      provenance: { ...observation.provenance, externalVersion: "10", observedAt: latestObservedAt }
    });
    rows.mappings.push({
      id: "mapping-1",
      connectorId: connector.id,
      sourceNamespace: observation.sourceNamespace,
      externalAssetType: observation.externalAssetType,
      externalId: observation.externalId,
      assetType: "api",
      assetId: "fact-1",
      matchStatus: "UNAMBIGUOUS",
      normalizedDigest: observation.normalizedDigest,
      ...designerScope
    });

    const first = await reconcilePersistedScope({ architectureScope: designerScope });
    rows.observations.reverse();
    const second = await reconcilePersistedScope({ architectureScope: designerScope });

    expect(first).toMatchObject({ status: "CONVERGED", issues: [] });
    expect(second).toEqual(first);
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
    ["architectureScope", { architectureScope: undefined }],
    ["promotion status", { status: "CANDIDATE" }],
    ["missing English canonical content", { localizedContent: { zh: { name: "支付 API" } } }],
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
    rows.observations[0]!.payload = { name: "Payments API", localizedContent: { en: candidateLocalizedContent.en, zh: {} } };
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("rejects a partial Chinese localization overlay for a human-facing fact", async () => {
    arrangePromotion();
    rows.observations[0]!.payload = { name: "Payments API", localizedContent: { en: candidateLocalizedContent.en, zh: { name: "支付 API" } } };
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("rejects a human-facing fact without an English canonical overlay", async () => {
    arrangePromotion();
    rows.observations[0]!.payload = { name: "Payments API", localizedContent: { zh: candidateLocalizedContent.zh } };
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("derives localized content from the persisted candidate observation", async () => {
    arrangePromotion();
    const promoted = await promoteCandidate(promotionInput());
    expect(promoted.localizedContent).toEqual(candidateLocalizedContent);
    expect(promoted.payload).toEqual({ name: "Payments API" });
  });

  it("rejects legacy caller-supplied promotion fields at the persistence boundary", async () => {
    arrangePromotion();
    await expect(promoteCandidate({ ...promotionInput(), fact: candidateFact } as never)).rejects.toThrow("PROMOTION_INPUT_INVALID");
  });

  it("does not require caller-owned promotion fields", async () => {
    arrangePromotion();
    await expect(promoteCandidate(promotionInput())).resolves.toMatchObject({ status: "PROMOTED" });
  });

  it("does not allow humanFacing false to bypass complete bilingual localization", async () => {
    arrangePromotion();
    rows.observations[0]!.payload = { name: "Payments API", localizedContent: { en: candidateLocalizedContent.en, zh: {} } };
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("LOCALIZATION_INCOMPLETE");
  });

  it("requires the candidate mapping to name the promoted asset", async () => {
    arrangePromotion();
    delete rows.mappings[0]!.assetId;

    await expect(promoteCandidate(promotionInput())).rejects.toThrow("IDENTITY_MAPPING_INVALID");
  });

  it("rejects legacy caller payload and digest fields", async () => {
    arrangePromotion();

    await expect(promoteCandidate({ ...promotionInput(), payload: { name: "Caller-authored replacement" } } as never)).rejects.toThrow("PROMOTION_INPUT_INVALID");
    await expect(promoteCandidate({ ...promotionInput(), normalizedDigest: "caller-digest" } as never)).rejects.toThrow("PROMOTION_INPUT_INVALID");
  });

  it("rejects a candidate whose persisted source digest or provenance is inconsistent", async () => {
    arrangePromotion();
    rows.observations[0]!.normalizedDigest = "tampered-source-digest";
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("CANDIDATE_DIGEST_INVALID");

    rows.observations.length = 0;
    rows.mappings.length = 0;
    rows.policies.length = 0;
    arrangePromotion({ provenance: { ...observation.provenance, connectorInstanceId: "other-connector" } });
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("CANDIDATE_PROVENANCE_INVALID");
  });

  it("derives authority and provenance without caller promotion fields", async () => {
    arrangePromotion();
    await expect(promoteCandidate(promotionInput())).resolves.toMatchObject({ authority: "EXTERNAL", provenance: candidateFact.provenance });
  });

  it("rejects promotion when authority policy disables it", async () => {
    arrangePromotion({ promotionMode: "DISABLED" });
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("POLICY_DISABLED");
  });

  it("rejects promotion with an ambiguous identity mapping", async () => {
    arrangePromotion({ matchStatus: "AMBIGUOUS" });
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("IDENTITY_CONFLICT");
  });

  it("rejects a candidate whose Scope differs from the requested Scope", async () => {
    arrangePromotion();
    Object.assign(rows.mappings[0]!, policyScope);
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("SCOPE_MISMATCH");
  });

  it.each(["REJECTED", "TOMBSTONED", "CONFLICTED"])('rejects a %s candidate', async (status) => {
    arrangePromotion({ status });
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("CANDIDATE_STATUS_INVALID");
  });

  it("rejects multiple applicable authority policies", async () => {
    arrangePromotion();
    rows.policies.push({ ...rows.policies[0]!, id: "policy-2", policyVersion: "2" });
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("AUTHORITY_POLICY_AMBIGUOUS");
  });

  it("rejects promotion without an applicable authority policy", async () => {
    arrangePromotion();
    rows.policies.length = 0;
    await expect(promoteCandidate(promotionInput())).rejects.toThrow("AUTHORITY_MISSING");
  });

  it("promotes a valid scoped candidate", async () => {
    arrangePromotion();
    await expect(promoteCandidate(promotionInput())).resolves.toMatchObject({ id: candidateFact.id, status: "PROMOTED", architectureScope: designerScope });
    expect(rows.observations[0]).toMatchObject({ status: "PROMOTED", ...designerScope, payload: expect.objectContaining({ id: candidateFact.id, status: "PROMOTED", architectureScope: designerScope }) });
    expect(rows.outbox).toEqual([expect.objectContaining({
      eventType: "FEDERATION_CANDIDATE_PROMOTED",
      status: "PENDING",
      applicationServiceId: designerScope.applicationServiceId,
      scopePath: designerScope.scopePath,
      idempotencyKey: expect.stringContaining("FEDERATION_CANDIDATE_PROMOTED")
    })]);
  });

  it("replays an already promoted candidate as the same receipt without another delivery event", async () => {
    arrangePromotion();

    const first = await promoteCandidate(promotionInput());
    const replay = await promoteCandidate(promotionInput());

    expect(replay).toEqual(first);
    expect(rows.outbox.filter((row) => row.eventType === "FEDERATION_CANDIDATE_PROMOTED")).toHaveLength(1);
    expect(rows.observations).toEqual([expect.objectContaining({ id: observation.id, status: "PROMOTED" })]);
  });

  it("rolls back candidate promotion when its delivery event fails", async () => {
    arrangePromotion();
    failOutbox = true;

    await expect(promoteCandidate(promotionInput())).rejects.toThrow("OUTBOX_WRITE_FAILED");

    expect(rows.observations[0]).toMatchObject({ status: "CANDIDATE" });
    expect(rows.outbox).toHaveLength(0);
  });

  it("creates one exact-Scope DesignChangeSession delivery event and replays it idempotently", async () => {
    await createDesignChangeSession({ ...changeSession, affectedFactIds: [...changeSession.affectedFactIds], expectedEvidenceRefs: [...changeSession.expectedEvidenceRefs], openedAt: "2026-07-19T00:00:00.000Z", architectureScope: designerScope });
    await createDesignChangeSession({ ...changeSession, affectedFactIds: [...changeSession.affectedFactIds], expectedEvidenceRefs: [...changeSession.expectedEvidenceRefs], openedAt: "2026-07-19T00:00:00.000Z", architectureScope: designerScope });

    expect(rows.sessions).toHaveLength(1);
    expect(rows.outbox).toEqual([expect.objectContaining({
      eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CREATED",
      designChangeSessionId: changeSession.id,
      applicationServiceId: designerScope.applicationServiceId,
      scopePath: designerScope.scopePath,
      status: "PENDING"
    })]);
  });

  it("rolls back DesignChangeSession creation when its delivery event fails", async () => {
    failOutbox = true;

    await expect(createDesignChangeSession({ ...changeSession, affectedFactIds: [...changeSession.affectedFactIds], expectedEvidenceRefs: [...changeSession.expectedEvidenceRefs], openedAt: "2026-07-19T00:00:00.000Z", architectureScope: designerScope })).rejects.toThrow("OUTBOX_WRITE_FAILED");

    expect(rows.sessions).toHaveLength(0);
    expect(rows.outbox).toHaveLength(0);
  });

  it("closes an exact-Scope session with verification evidence and an outbox event", async () => {
    await createDesignChangeSession({ ...changeSession, affectedFactIds: [...changeSession.affectedFactIds], expectedEvidenceRefs: [...changeSession.expectedEvidenceRefs], openedAt: "2026-07-19T00:00:00.000Z", architectureScope: designerScope });

    const closed = await closeDesignChangeSession({
      id: changeSession.id,
      status: "CONVERGED",
      verificationEvidenceRefs: ["pnpm test=passed"],
      architectureScope: designerScope
    });

    expect(closed).toMatchObject({ id: changeSession.id, status: "CONVERGED", architectureScope: designerScope, expectedEvidenceRefs: ["pnpm test=passed"] });
    expect(rows.outbox).toEqual(expect.arrayContaining([expect.objectContaining({
      eventType: "FEDERATION_DESIGN_CHANGE_SESSION_CLOSED",
      designChangeSessionId: changeSession.id,
      applicationServiceId: designerScope.applicationServiceId,
      scopePath: designerScope.scopePath
    })]));
  });

  it("does not reopen a closed session with a different final status", async () => {
    await createDesignChangeSession({ ...changeSession, affectedFactIds: [...changeSession.affectedFactIds], expectedEvidenceRefs: [...changeSession.expectedEvidenceRefs], openedAt: "2026-07-19T00:00:00.000Z", architectureScope: designerScope });
    await closeDesignChangeSession({ id: changeSession.id, status: "CONVERGED", verificationEvidenceRefs: ["pnpm test=passed"], architectureScope: designerScope });

    await expect(closeDesignChangeSession({ id: changeSession.id, status: "BLOCKED", verificationEvidenceRefs: ["reconciliation=blocked"], architectureScope: designerScope })).rejects.toThrow("DESIGN_CHANGE_SESSION_ALREADY_CLOSED");
  });

  it("retires an earlier revision and reconciles only the current canonical fact", async () => {
    arrangePromotion();
    await promoteCandidate(promotionInput());
    rows.observations.push(secondObservation());

    await promoteCandidate(promotionInput("observation-2"));

    expect(rows.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: observation.id, status: "TOMBSTONED" }),
      expect.objectContaining({ id: "observation-2", status: "PROMOTED" })
    ]));
    const currentFacts = await listPersistedCanonicalFederatedFacts(designerScope);
    expect(currentFacts).toHaveLength(1);
    expect(currentFacts[0]).toMatchObject({ id: candidateFact.id, normalizedDigest: contentDigest({ name: "Payments API v2" }), payload: { name: "Payments API v2" } });
    await expect(reconcilePersistedScope({ architectureScope: designerScope })).resolves.toMatchObject({ status: "CONVERGED", issues: [] });
  });

  it("rolls back retirement when a replacement promotion fails", async () => {
    arrangePromotion();
    await promoteCandidate(promotionInput());
    rows.observations.push(secondObservation());
    failPromotionUpdate = true;

    await expect(promoteCandidate(promotionInput("observation-2"))).rejects.toThrow("PROMOTION_WRITE_FAILED");
    expect(rows.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: observation.id, status: "PROMOTED" }),
      expect.objectContaining({ id: "observation-2", status: "CANDIDATE" })
    ]));
  });

  it("serializes concurrent same-fact promotions to one current revision", async () => {
    arrangePromotion();
    rows.observations.push(secondObservation());

    await Promise.all([
      promoteCandidate(promotionInput()),
      promoteCandidate(promotionInput("observation-2"))
    ]);

    expect(promotionLockCalls).toBe(2);
    expect(rows.observations.filter((row) => row.status === "PROMOTED")).toHaveLength(1);
    expect(rows.observations).toEqual(expect.arrayContaining([expect.objectContaining({ id: "observation-2", status: "PROMOTED" })]));
    await expect(listPersistedCanonicalFederatedFacts(designerScope)).resolves.toHaveLength(1);
  });
});

function arrangePromotion(overrides: Row = {}) {
  rows.observations.push({ ...observation, connectorId: connector.id, ...designerScope, observedAt: new Date(observation.observedAt), ...overrides });
  rows.mappings.push({ id: "mapping-1", connectorId: connector.id, sourceNamespace: observation.sourceNamespace, externalAssetType: observation.externalAssetType, externalId: observation.externalId, assetType: candidateFact.assetType, assetId: candidateFact.id, matchStatus: "UNAMBIGUOUS", normalizedDigest: observation.normalizedDigest, ...designerScope, ...overrides });
  rows.policies.push({ id: "policy-1", assetType: candidateFact.assetType, fieldPath: "$", authority: "EXTERNAL", promotionMode: "AUTO", policyVersion: "1", ...designerScope, ...overrides });
}

function promotionInput(candidateId: string = observation.id) {
  return {
    candidateId,
    approvalReason: "Reviewed source contract.",
    architectureScope: designerScope
  };
}

function promotedFactPayload(overrides: Row = {}): Row {
  return {
    id: "fact-1",
    architectureScope: designerScope,
    assetType: "api",
    schemaVersion: "1",
    payload: { name: "Payments API" },
    localizedContent: { en: { name: "Payments API" }, zh: { name: "支付 API" } },
    normalizedDigest: observation.normalizedDigest,
    provenance: observation.provenance,
    authority: "EXTERNAL",
    confidence: 1,
    status: "PROMOTED",
    ...overrides
  };
}

function secondObservation(): Row {
  const observedAt = "2026-07-20T00:00:00.000Z";
  const payload = { name: "Payments API v2", localizedContent: { en: { name: "Payments API v2", description: "Payments interface" }, zh: { name: "支付 API v2", description: "支付接口" } } };
  return {
    ...observation,
    id: "observation-2",
    connectorId: connector.id,
    sourceVersion: "def456",
    idempotencyKey: "observation:github:payments-api:def456",
    normalizedDigest: contentDigest({ name: "Payments API v2" }),
    payload,
    provenance: { ...observation.provenance, externalVersion: "def456", observedAt },
    observedAt: new Date(observedAt),
    ...designerScope
  };
}

function secondCandidateFact() {
  const source = secondObservation();
  const sourcePayload = source.payload as { name: string; localizedContent: typeof candidateLocalizedContent };
  return {
    ...candidateFact,
    payload: { name: sourcePayload.name },
    localizedContent: sourcePayload.localizedContent,
    normalizedDigest: String(source.normalizedDigest),
    provenance: source.provenance as typeof candidateFact.provenance
  };
}

function statusMatches(rowStatus: unknown, requestedStatus: unknown): boolean {
  if (requestedStatus === undefined) return true;
  if (requestedStatus && typeof requestedStatus === "object" && "in" in requestedStatus) return (requestedStatus as { in: unknown[] }).in.includes(rowStatus);
  if (requestedStatus && typeof requestedStatus === "object" && "not" in requestedStatus) return rowStatus !== (requestedStatus as { not: unknown }).not;
  return rowStatus === requestedStatus;
}
