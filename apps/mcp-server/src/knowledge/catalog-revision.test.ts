import { describe, expect, it } from "vitest";
import { appendAuthoredAssetRevision } from "./catalog-revision";

const scope = { applicationServiceId: "com.example.orders", scopePath: "org/product/orders/service" };

function createTransaction() {
  const revisions: Array<Record<string, unknown>> = [];
  let nextVersion = 0n;
  return {
    revisions,
    authoredAssetRevision: {
      findUnique: async ({ where }: { where: { applicationServiceId_scopePath_idempotencyKey: { idempotencyKey: string } } }) => revisions.find((row) => row.idempotencyKey === where.applicationServiceId_scopePath_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { dbId: `revision-${revisions.length + 1}`, createdAt: new Date("2026-08-16T00:00:00.000Z"), ...data };
        revisions.push(row);
        return row;
      }
    },
    authoredCatalogCursor: {
      upsert: async ({ create, update }: { create: { nextVersion: bigint }; update: { nextVersion: { increment: number } } }) => {
        nextVersion = revisions.length === 0 ? create.nextVersion : nextVersion + BigInt(update.nextVersion.increment);
        return { nextVersion };
      }
    }
  } as never;
}

function input(idempotencyKey: string) {
  return {
    architectureScope: scope,
    assetType: "api",
    assetId: "api-orders-create",
    operation: "UPSERT" as const,
    payload: { id: "api-orders-create", name: "Create order", architectureScope: scope },
    actorType: "agent",
    actorId: "test-agent",
    channel: "mcp",
    correlationId: `test:${idempotencyKey}`,
    idempotencyKey
  };
}

describe("authored catalog revisions", () => {
  it("increments the exact-Scope catalog version and is idempotent", async () => {
    const transaction = createTransaction() as unknown as Parameters<typeof appendAuthoredAssetRevision>[0] & { revisions: Array<Record<string, unknown>> };
    const first = await appendAuthoredAssetRevision(transaction, input("asset-1"));
    const replay = await appendAuthoredAssetRevision(transaction, input("asset-1"));
    const second = await appendAuthoredAssetRevision(transaction, input("asset-2"));

    expect(first.catalogVersion).toBe(1n);
    expect(replay).toMatchObject({ catalogVersion: 1n, idempotent: true });
    expect(second).toMatchObject({ catalogVersion: 2n, idempotent: false });
    expect(transaction.revisions).toHaveLength(2);
  });

  it("requires both Scope dimensions", async () => {
    const transaction = createTransaction() as unknown as Parameters<typeof appendAuthoredAssetRevision>[0] & { revisions: Array<Record<string, unknown>> };
    await expect(appendAuthoredAssetRevision(transaction, { ...input("missing-scope"), architectureScope: { applicationServiceId: "com.example.orders", scopePath: "" } })).rejects.toThrow("Architecture scope is required.");
  });
});
