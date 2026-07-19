import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../persistence";
import { listConnectors, recordObservation, registerConnector } from "./persistence";

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
const rows = { connectors: [] as Row[], observations: [] as Row[], outbox: [] as Row[] };

beforeEach(() => {
  process.env.SPECFORGE_MCP_SEED = "1";
  rows.connectors.length = 0;
  rows.observations.length = 0;
  rows.outbox.length = 0;
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
  client.$transaction = vi.fn(async (operation: (transaction: Row) => Promise<unknown>) => operation({
    sourceObservation: {
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: Row } }) => rows.observations.find((row) => row.idempotencyKey === where.applicationServiceId_scopePath_idempotencyKey.idempotencyKey && row.applicationServiceId === where.applicationServiceId_scopePath_idempotencyKey.applicationServiceId && row.scopePath === where.applicationServiceId_scopePath_idempotencyKey.scopePath) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => { rows.observations.push(data); return data; })
    },
    federationOutbox: {
      findUnique: vi.fn(async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: Row } }) => rows.outbox.find((row) => row.idempotencyKey === where.applicationServiceId_scopePath_idempotencyKey.idempotencyKey && row.applicationServiceId === where.applicationServiceId_scopePath_idempotencyKey.applicationServiceId && row.scopePath === where.applicationServiceId_scopePath_idempotencyKey.scopePath) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { ...data, dbId: `outbox-${rows.outbox.length + 1}`, availableAt: data.availableAt ?? new Date(), sentAt: null, attemptCount: 0, lastError: null };
        rows.outbox.push(row);
        return row;
      })
    }
  }));
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
    await registerConnector({ ...connector, id: "policy-connector", architectureScope: policyScope });
    expect(await listConnectors(designerScope)).toHaveLength(1);
    expect(await listConnectors(policyScope)).toHaveLength(1);
  });

  it("replays an observation idempotency key without another outbox event", async () => {
    await registerConnector({ ...connector, architectureScope: designerScope });
    const first = await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    const replay = await recordObservation({ ...observation, connectorId: connector.id, architectureScope: designerScope });
    expect(replay).toEqual(first);
    expect(rows.outbox).toHaveLength(1);
  });
});
