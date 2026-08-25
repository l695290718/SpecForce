import { beforeEach, describe, expect, it, vi } from "vitest";

type DesignRow = { id: string; payload: unknown; updatedAt: Date; applicationServiceId: string; scopePath: string };
const designAssetRows: DesignRow[] = [];
function row(id: string, applicationServiceId: string, scopePath: string, payload: IntegrationContract): DesignRow {
  return { id, payload, updatedAt: new Date(), applicationServiceId, scopePath };
}

vi.mock("../db", () => ({
  prisma: {
    designAsset: {
      findMany: vi.fn(async (args: { where: { applicationServiceId: string; scopePath: string } }) =>
        designAssetRows.filter((row) => row.applicationServiceId === args.where.applicationServiceId && row.scopePath === args.where.scopePath)
      )
    }
  }
}));

import { ATLAS_LIMITS, loadIntegrationAtlas } from "./atlas";

import type { IntegrationContract } from "@specforge/core";

function contract(overrides: Partial<IntegrationContract>): IntegrationContract {
  return {
    id: overrides.id ?? "integration-x",
    name: "n",
    description: "d",
    sourceSystem: "com.huawei.celon.desiner",
    targetSystem: "com.huawei.celon.integrationgateway",
    protocol: "REST API",
    dataMapping: "",
    errorMapping: "",
    sla: "",
    timeout: "",
    retryStrategy: "",
    fallbackStrategy: "",
    circuitBreaker: "",
    owner: "",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf" },
    localizedContent: { en: {}, zh: {} },
    ...overrides
  } as IntegrationContract;
}

const READABLE = [
  { id: "com.huawei.celon.desiner", name: "Designer", scopePath: "pf/desiner" },
  { id: "com.huawei.celon.integrationgateway", name: "Integration Gateway", scopePath: "pf/gateway" },
  { id: "com.huawei.celon.policyhub", name: "Policy Hub", scopePath: "pf/policyhub" },
  { id: "com.huawei.celon.specstudio", name: "Spec Studio", scopePath: "pf/specstudio" }
];

beforeEach(() => {
  designAssetRows.length = 0;
});

describe("loadIntegrationAtlas", () => {
  it("returns an explicit empty page when no contracts exist", async () => {
    const page = await loadIntegrationAtlas(READABLE, undefined, {});
    expect(page.contracts).toHaveLength(0);
    expect(page.nodes).toHaveLength(0);
    expect(page.partial).toBeNull();
    expect(page.cursor).toBeUndefined();
  });

  it("redacts a resolved provider the viewer cannot read and keeps provider identity out of nodes", async () => {
    designAssetRows.push({
      id: "integration-secret-call", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner",
      payload: contract({
        integrationCallKey: "desiner->hidden:REST_API:POST /v1/publish",
        consumerScopeId: "com.huawei.celon.desiner",
        targetKind: "SPEC_FORGE_SCOPE",
        protocolKind: "REST_API",
        protocolLocator: "POST /v1/publish",
        lifecycle: "ACTIVE",
        targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.hidden.provider", targetType: "api", targetId: "api-hidden", revisionLabel: "v3" }
      }),
      updatedAt: new Date()
    });
    const page = await loadIntegrationAtlas(READABLE, "com.huawei.celon.desiner", { language: "en" });
    expect(page.coverage.restrictedTargets).toBe(1);
    const restricted = page.nodes.find((node) => node.kind === "restricted");
    expect(restricted?.label).toContain("Restricted");
    expect(JSON.stringify(page.nodes)).not.toContain("com.huawei.hidden.provider");
    expect(page.outbound[0]!.providerScopeId).toBeUndefined();
  });

  it("derives inbound only from readable consumer contracts targeting the active scope", async () => {
    designAssetRows.push({
      id: "integration-studio-reads-desiner", applicationServiceId: "com.huawei.celon.specstudio", scopePath: "pf/specstudio",
      payload: contract({
        sourceSystem: "com.huawei.celon.specstudio",
        targetSystem: "com.huawei.celon.desiner",
        integrationCallKey: "specstudio->desiner:MESSAGE_EVENT:consume design.updated",
        consumerScopeId: "com.huawei.celon.specstudio",
        targetKind: "SPEC_FORGE_SCOPE",
        protocolKind: "MESSAGE_EVENT",
        protocolLocator: "CONSUME topic celon.design.updated.v1",
        lifecycle: "ACTIVE",
        targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.celon.desiner", targetType: "event", targetId: "event-design-updated", revisionLabel: "v1" }
      }),
      updatedAt: new Date()
    });
    const page = await loadIntegrationAtlas(READABLE, "com.huawei.celon.desiner", {});
    expect(page.inbound).toHaveLength(1);
    expect(page.inbound[0]!.consumerScopeId).toBe("com.huawei.celon.specstudio");
    expect(page.outbound).toHaveLength(0);
  });

  it("keeps legacy records unresolved instead of guessing targets", async () => {
    designAssetRows.push(row("integration-specforge-mcp-agent", "com.huawei.celon.desiner", "pf/desiner", contract({ id: "integration-specforge-mcp-agent" })));
    const page = await loadIntegrationAtlas(READABLE, "com.huawei.celon.desiner", {});
    expect(page.contracts[0]!.resolutionStatus).toBe("UNRESOLVED");
    expect(page.coverage.unresolvedTargets).toBe(1);
  });

  it("emits MAX_EDGES partial when edges reach the cap", async () => {
    const many = Math.min(ATLAS_LIMITS.maxEdges + 5, 210);
    for (let index = 0; index < many; index += 1) {
      designAssetRows.push(
        row(`integration-call-${index}`, "com.huawei.celon.desiner", "pf/desiner",
          contract({
            id: `integration-call-${index}`,
            integrationCallKey: `k${index}`,
            consumerScopeId: "com.huawei.celon.desiner",
            targetKind: "EXTERNAL",
            protocolKind: "UNNORMALIZED",
            lifecycle: "ACTIVE"
          }))
      );
    }
    const page = await loadIntegrationAtlas(READABLE, undefined, {});
    expect(page.edges.length).toBeLessThanOrEqual(ATLAS_LIMITS.maxEdges);
    expect(page.partial?.reason).toBeDefined();
    expect(page.cursor).toBeTruthy();
  });

  it("rejects a tampered cursor", async () => {
    await expect(loadIntegrationAtlas(READABLE, undefined, { cursor: Buffer.from('{"v":1,"sig":"bogus"}').toString("base64url") })).rejects.toThrow("ATLAS_CURSOR_INVALID");
    await expect(loadIntegrationAtlas(READABLE, undefined, { cursor: "definitely-not-valid" })).rejects.toThrow("ATLAS_CURSOR_INVALID");
  });
});
