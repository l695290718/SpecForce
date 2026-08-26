import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationContract } from "@specforge/core";

type DesignRow = { id: string; type: "integration" | "evidence"; payload: unknown; updatedAt: Date; applicationServiceId: string; scopePath: string; integrationSortKey: string };
const designAssetRows: DesignRow[] = [];
function row(id: string, applicationServiceId: string, scopePath: string, payload: IntegrationContract): DesignRow {
  return { id, type: "integration", payload, updatedAt: new Date(), applicationServiceId, scopePath, integrationSortKey: `${applicationServiceId}\u001f${id}` };
}

type VerificationLinkRow = { sourceId: string; targetId: string; applicationServiceId?: string; scopePath?: string; enterpriseId?: string };
const verificationLinkRows: VerificationLinkRow[] = [];

vi.mock("../db", () => {
  const database = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback(database)),
    authoredCatalogCursor: {
      findMany: vi.fn(async (args: { where?: { OR?: Array<{ applicationServiceId?: string; scopePath?: string }> } }) => {
        const scopes = args.where?.OR ?? [];
        return scopes.map((scope) => {
          const rows = designAssetRows.filter((candidate) => candidate.applicationServiceId === scope.applicationServiceId && candidate.scopePath === scope.scopePath);
          const latest = rows.reduce((max, candidate) => Math.max(max, candidate.updatedAt.getTime()), 0);
          return { applicationServiceId: scope.applicationServiceId ?? "", scopePath: scope.scopePath ?? "", nextVersion: BigInt(latest) };
        });
      })
    },
    relationshipEvent: {
      groupBy: vi.fn(async () => {
        const grouped = new Map<string, { enterpriseId: string; applicationServiceId: string; scopePath: string; _max: { graphVersion: bigint } }>();
        verificationLinkRows.forEach((link, index) => {
          const applicationServiceId = link.applicationServiceId ?? "";
          const scopePath = link.scopePath ?? "";
          const key = `${applicationServiceId}|${scopePath}`;
          grouped.set(key, {
            enterpriseId: link.enterpriseId ?? "legacy-enterprise",
            applicationServiceId,
            scopePath,
            _max: { graphVersion: BigInt(index + 1) }
          });
        });
        return [...grouped.values()];
      })
    },
    relationshipCurrent: {
      findMany: vi.fn(async () => verificationLinkRows.map((link) => {
        const target = designAssetRows.find((candidate) => candidate.type === "integration" && candidate.id === link.targetId && (!link.applicationServiceId || candidate.applicationServiceId === link.applicationServiceId) && (!link.scopePath || candidate.scopePath === link.scopePath));
        const source = designAssetRows.find((candidate) => candidate.type === "evidence" && candidate.id === link.sourceId && (!link.applicationServiceId || candidate.applicationServiceId === link.applicationServiceId) && (!link.scopePath || candidate.scopePath === link.scopePath));
        return {
          enterpriseId: link.enterpriseId ?? "legacy-enterprise",
          applicationServiceId: link.applicationServiceId ?? target?.applicationServiceId ?? "",
          scopePath: link.scopePath ?? target?.scopePath ?? "",
          sourceNode: { nodeType: "evidence", logicalId: source?.id ?? link.sourceId },
          targetNode: { nodeType: "integration", logicalId: target?.id ?? link.targetId }
        };
      }))
    },
    designAsset: {
      findMany: vi.fn(async (args: { where: { applicationServiceId?: string; scopePath?: string; integrationSortKey?: { gt: string }; id?: { in: string[] }; type?: string; OR?: Array<{ applicationServiceId?: string; scopePath?: string; id?: { in: string[] } }> }; take?: number }) => {
        const matches = (candidate: DesignRow) => {
          if (args.where.OR) return args.where.OR.some((scope) => candidate.applicationServiceId === scope.applicationServiceId && candidate.scopePath === scope.scopePath && (!scope.id || scope.id.in.includes(candidate.id)));
          if (args.where.id?.in) return args.where.id.in.includes(candidate.id);
          return candidate.applicationServiceId === args.where.applicationServiceId && candidate.scopePath === args.where.scopePath;
        };
        return designAssetRows
          .filter(matches)
          .filter((candidate) => !args.where.type || candidate.type === args.where.type)
          .filter((candidate) => typeof candidate.integrationSortKey === "string")
          .filter((candidate) => !args.where.integrationSortKey || candidate.integrationSortKey > args.where.integrationSortKey.gt)
          .sort((left, right) => left.integrationSortKey.localeCompare(right.integrationSortKey) || left.id.localeCompare(right.id))
          .slice(0, args.take);
      })
    }
  };
  return { prisma: database };
});

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

beforeEach(() => { designAssetRows.length = 0; verificationLinkRows.length = 0; });

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

  it("derives ATTESTED from the latest passing evidence", async () => {
    designAssetRows.push(row("integration-mcp-stdio", "com.huawei.celon.desiner", "pf/desiner", contract({ id: "integration-mcp-stdio" })));
    designAssetRows.push({ type: "evidence", integrationSortKey: "zz-evidence-1", id: "evidence-integration-mcp-stdio-20260826", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner", updatedAt: new Date(), payload: { id: "evidence-x", status: "passed", recordedAt: "2026-08-26T10:00:00Z" } });
    verificationLinkRows.push({ sourceId: "evidence-integration-mcp-stdio-20260826", targetId: "integration-mcp-stdio" });
    const page = await loadIntegrationAtlas(READABLE, undefined, options);
    expect(page.contracts[0]!.verificationState).toBe("ATTESTED");
  });

  it("lets newer drift evidence mask older attestation and counts both coverage sides", async () => {
    designAssetRows.push(row("integration-drifty", "com.huawei.celon.desiner", "pf/desiner", contract({ id: "integration-drifty" })));
    designAssetRows.push({ type: "evidence", integrationSortKey: "zz-evidence-2", id: "evidence-old-pass", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner", updatedAt: new Date(), payload: { status: "passed", recordedAt: "2026-08-20T10:00:00Z" } });
    designAssetRows.push({ type: "evidence", integrationSortKey: "zz-evidence-3", id: "evidence-new-fail", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner", updatedAt: new Date(), payload: { status: "failed", recordedAt: "2026-08-26T12:00:00Z" } });
    verificationLinkRows.push({ sourceId: "evidence-old-pass", targetId: "integration-drifty" }, { sourceId: "evidence-new-fail", targetId: "integration-drifty" });
    const page = await loadIntegrationAtlas(READABLE, undefined, options);
    expect(page.outbound[0]?.verificationState ?? page.contracts.find((contract) => contract.contractId === "integration-drifty")?.verificationState).toBe("DRIFT");
    expect(page.coverage.driftContracts).toBeGreaterThanOrEqual(1);
  });

  it("keeps same contract IDs isolated across readable Scopes", async () => {
    designAssetRows.push(
      row("shared-contract", "com.huawei.celon.desiner", "pf/desiner", contract({ id: "shared-contract" })),
      row("shared-contract", "com.huawei.celon.policyhub", "pf/policyhub", contract({ id: "shared-contract" }))
    );
    designAssetRows.push(
      { type: "evidence", integrationSortKey: "evidence-desiner", id: "evidence-desiner", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner", updatedAt: new Date(), payload: { status: "passed", recordedAt: "2026-08-26T10:00:00Z" } },
      { type: "evidence", integrationSortKey: "evidence-policyhub", id: "evidence-policyhub", applicationServiceId: "com.huawei.celon.policyhub", scopePath: "pf/policyhub", updatedAt: new Date(), payload: { status: "failed", recordedAt: "2026-08-26T11:00:00Z" } }
    );
    verificationLinkRows.push(
      { sourceId: "evidence-desiner", targetId: "shared-contract", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner" },
      { sourceId: "evidence-policyhub", targetId: "shared-contract", applicationServiceId: "com.huawei.celon.policyhub", scopePath: "pf/policyhub" }
    );

    const page = await loadIntegrationAtlas(READABLE, undefined, options);

    expect(page.contracts.find((item) => item.consumerScopeId === "com.huawei.celon.desiner")?.verificationState).toBe("ATTESTED");
    expect(page.contracts.find((item) => item.consumerScopeId === "com.huawei.celon.policyhub")?.verificationState).toBe("DRIFT");
  });

  it("invalidates a continuation when attestation evidence changes", async () => {
    for (let index = 0; index <= ATLAS_LIMITS.maxContracts; index += 1) designAssetRows.push(row(`integration-${index}`, "com.huawei.celon.desiner", "pf/desiner", contract({ id: `integration-${index}` })));
    const first = await loadIntegrationAtlas(READABLE, undefined, options);
    expect(first.cursor).toBeTruthy();

    designAssetRows.push({ type: "evidence", integrationSortKey: "evidence-after-page", id: "evidence-after-page", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner", updatedAt: new Date(), payload: { status: "passed", recordedAt: "2026-08-26T12:00:00Z" } });
    verificationLinkRows.push({ sourceId: "evidence-after-page", targetId: "integration-500", applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf/desiner" });

    await expect(loadIntegrationAtlas(READABLE, undefined, { ...options, cursor: first.cursor })).rejects.toThrow("ATLAS_CURSOR_STALE");
  });

  it("keeps contracts without any evidence explicitly UNATTESTED", async () => {
    designAssetRows.push(row("integration-bare", "com.huawei.celon.desiner", "pf/desiner", contract({ id: "integration-bare" })));
    const page = await loadIntegrationAtlas(READABLE, undefined, options);
    expect(page.contracts.every((contract) => contract.verificationState === "UNATTESTED")).toBe(true);
  });
});
