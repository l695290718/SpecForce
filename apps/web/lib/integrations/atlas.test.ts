import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationContract } from "@specforge/core";

type DesignRow = { id: string; payload: unknown; updatedAt: Date; applicationServiceId: string; scopePath: string; integrationSortKey: string };
const designAssetRows: DesignRow[] = [];
function row(id: string, applicationServiceId: string, scopePath: string, payload: IntegrationContract): DesignRow {
  return { id, payload, updatedAt: new Date(), applicationServiceId, scopePath, integrationSortKey: `${applicationServiceId}\u001f${id}` };
}

vi.mock("../db", () => ({
  prisma: {
    designAsset: {
      aggregate: vi.fn(async () => ({ _count: { _all: designAssetRows.length }, _max: { updatedAt: designAssetRows.reduce<Date | null>((latest, candidate) => !latest || candidate.updatedAt > latest ? candidate.updatedAt : latest, null) } })),
      findMany: vi.fn(async (args: { where: { applicationServiceId: string; scopePath: string; integrationSortKey?: { gt: string } }; take?: number }) => designAssetRows
        .filter((candidate) => candidate.applicationServiceId === args.where.applicationServiceId && candidate.scopePath === args.where.scopePath)
        .filter((candidate) => !args.where.integrationSortKey || candidate.integrationSortKey > args.where.integrationSortKey.gt)
        .sort((left, right) => left.integrationSortKey.localeCompare(right.integrationSortKey) || left.id.localeCompare(right.id))
        .slice(0, args.take))
    }
  }
}));

import { ATLAS_LIMITS, loadIntegrationAtlas } from "./atlas";

function contract(overrides: Partial<IntegrationContract>): IntegrationContract {
  return {
    id: overrides.id ?? "integration-x", name: "n", description: "d", sourceSystem: "com.huawei.celon.desiner", targetSystem: "com.huawei.celon.integrationgateway",
    protocol: "REST API", dataMapping: "", errorMapping: "", sla: "", timeout: "", retryStrategy: "", fallbackStrategy: "", circuitBreaker: "", owner: "",
    createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf" }, localizedContent: { en: {}, zh: {} }, ...overrides
  } as IntegrationContract;
}
const READABLE = [
  { id: "com.huawei.celon.desiner", name: "Designer", scopePath: "pf/desiner" },
  { id: "com.huawei.celon.integrationgateway", name: "Integration Gateway", scopePath: "pf/gateway" },
  { id: "com.huawei.celon.policyhub", name: "Policy Hub", scopePath: "pf/policyhub" },
  { id: "com.huawei.celon.specstudio", name: "Spec Studio", scopePath: "pf/specstudio" }
];
const options = { subject: "atlas-reader", language: "en" };

beforeEach(() => { designAssetRows.length = 0; });

describe("loadIntegrationAtlas", () => {
  it("returns an explicit empty page when no contracts exist", async () => {
    const page = await loadIntegrationAtlas(READABLE, undefined, options);
    expect(page.contracts).toHaveLength(0); expect(page.nodes).toHaveLength(0); expect(page.partial).toBeNull(); expect(page.cursor).toBeUndefined();
  });

  it("redacts every provider-derived value when the provider scope is unreadable", async () => {
    designAssetRows.push(row("integration-secret-call", "com.huawei.celon.desiner", "pf/desiner", contract({
      integrationCallKey: "com.huawei.celon.desiner|SPEC_FORGE_SCOPE:com.huawei.hidden.provider:api:api-hidden|REST_API|POST /v1/publish",
      consumerScopeId: "com.huawei.celon.desiner", targetKind: "SPEC_FORGE_SCOPE", protocolKind: "REST_API", protocolLocator: "POST /v1/publish", lifecycle: "ACTIVE",
      targetSystem: "com.huawei.hidden.provider", targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.hidden.provider", targetType: "api", targetId: "api-hidden", revisionLabel: "v3" }
    })));
    const page = await loadIntegrationAtlas(READABLE, "com.huawei.celon.desiner", options);
    expect(page.coverage.restrictedTargets).toBe(1);
    expect(page.outbound[0]).toMatchObject({ resolutionStatus: "RESTRICTED", targetSystem: "__RESTRICTED__", integrationCallKey: "__RESTRICTED__", protocolLocator: "" });
    const response = JSON.stringify(page);
    expect(response).not.toContain("com.huawei.hidden.provider");
    expect(response).not.toContain("api-hidden");
    expect(response).not.toContain("POST /v1/publish");
  });

  it("derives inbound only from readable consumer contracts targeting the active scope", async () => {
    designAssetRows.push(row("integration-studio-reads-desiner", "com.huawei.celon.specstudio", "pf/specstudio", contract({
      sourceSystem: "com.huawei.celon.specstudio", targetSystem: "com.huawei.celon.desiner", consumerScopeId: "com.huawei.celon.specstudio", targetKind: "SPEC_FORGE_SCOPE", protocolKind: "MESSAGE_EVENT", protocolLocator: "CONSUME topic celon.design.updated.v1", lifecycle: "ACTIVE",
      targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.celon.desiner", targetType: "event", targetId: "event-design-updated", revisionLabel: "v1" }
    })));
    const page = await loadIntegrationAtlas(READABLE, "com.huawei.celon.desiner", options);
    expect(page.inbound).toHaveLength(1); expect(page.inbound[0]!.consumerScopeId).toBe("com.huawei.celon.specstudio"); expect(page.outbound).toHaveLength(0);
  });

  it("returns each contract once across a signed continuation", async () => {
    for (let index = 0; index <= ATLAS_LIMITS.maxContracts; index += 1) designAssetRows.push(row(`integration-${String(index).padStart(3, "0")}`, "com.huawei.celon.desiner", "pf/desiner", contract({ id: `integration-${index}` })));
    const first = await loadIntegrationAtlas(READABLE, undefined, options);
    expect(first.contracts).toHaveLength(ATLAS_LIMITS.maxContracts); expect(first.partial?.reason).toBe("MAX_CONTRACTS"); expect(first.cursor).toBeTruthy();
    const second = await loadIntegrationAtlas(READABLE, undefined, { ...options, cursor: first.cursor });
    expect(second.contracts).toHaveLength(1);
    expect(new Set([...first.contracts, ...second.contracts].map((contract) => contract.contractId)).size).toBe(ATLAS_LIMITS.maxContracts + 1);
  });

  it("rejects tampered, cross-subject, and stale cursors", async () => {
    for (let index = 0; index <= ATLAS_LIMITS.maxContracts; index += 1) designAssetRows.push(row(`integration-${index}`, "com.huawei.celon.desiner", "pf/desiner", contract({ id: `integration-${index}` })));
    await expect(loadIntegrationAtlas(READABLE, undefined, { ...options, cursor: "definitely-not-valid" })).rejects.toThrow("ATLAS_CURSOR_INVALID");
    const first = await loadIntegrationAtlas(READABLE, undefined, options);
    if (!first.cursor) return;
    await expect(loadIntegrationAtlas(READABLE, undefined, { ...options, subject: "another-reader", cursor: first.cursor })).rejects.toThrow("ATLAS_CURSOR_INVALID");
    designAssetRows[0]!.updatedAt = new Date("2030-08-25T00:00:00.000Z");
    await expect(loadIntegrationAtlas(READABLE, undefined, { ...options, cursor: first.cursor })).rejects.toThrow("ATLAS_CURSOR_STALE");
  });
});
