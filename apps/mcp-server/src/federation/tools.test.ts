import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const federationPersistence = vi.hoisted(() => ({
  registerConnector: vi.fn(),
  recordObservation: vi.fn(),
  promoteCandidate: vi.fn(),
  createDesignChangeSession: vi.fn(),
  reconcilePersistedScope: vi.fn()
}));

const persistence = vi.hoisted(() => ({
  isSeedMode: vi.fn(() => false),
  deletePersistedDesignData: vi.fn(),
  searchPersistedDesignAssets: vi.fn(),
  upsertAssetLink: vi.fn(),
  upsertContextPack: vi.fn(),
  upsertDesignAsset: vi.fn(),
  upsertProposal: vi.fn(),
  readableScope: vi.fn((applicationServiceId: string) => {
    if (applicationServiceId === designerScope.applicationServiceId) return designerScope;
    if (applicationServiceId === siblingScope.applicationServiceId) return siblingScope;
    throw new Error("Scope read is not authorized.");
  }),
  resolveWritableScope: vi.fn((_actor: unknown, scope: ArchitectureScope) => {
    const registered = scope.applicationServiceId === designerScope.applicationServiceId
      ? designerScope
      : scope.applicationServiceId === siblingScope.applicationServiceId
        ? siblingScope
        : undefined;
    if (!registered || registered.scopePath !== scope.scopePath) throw new Error("Scope write is not authorized.");
    return registered;
  }),
  writableActor: vi.fn(() => ({ actorType: "agent", actorId: "local-mcp-agent", grants: [] })),
  prisma: {
    connectorInstance: { findMany: vi.fn() },
    federationOutbox: { count: vi.fn() },
    sourceObservation: { count: vi.fn() },
    reconciliationSnapshot: { findFirst: vi.fn() }
  }
}));

vi.mock("./persistence", () => federationPersistence);
vi.mock("../persistence", () => persistence);
vi.mock("../scoped-derived", () => ({
  analyzeScopedProposalImpact: vi.fn(),
  buildScopedAssetGraph: vi.fn(),
  exportScopedContextPack: vi.fn(),
  generateScopedContextPack: vi.fn(),
  getScopedAssetDetail: vi.fn(),
  renderScopedAssetMarkdown: vi.fn(),
  runScopedGovernanceChecks: vi.fn()
}));

import { registerTools } from "../tools";
import { registerFederationTools } from "./tools";

type ArchitectureScope = {
  applicationServiceId: string;
  scopePath: string;
};

type RegisteredTool = {
  config: Record<string, unknown>;
  handler: (input: unknown) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
};

const designerScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;
const siblingScope = {
  applicationServiceId: "com.huawei.celon.policyhub",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub"
} as const;

const connector = {
  id: "designer-connector",
  kind: "repository",
  capabilities: ["OBSERVE"],
  secretReference: "secret://designer"
} as const;

function captureToolsWithFederationRegistration(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: Record<string, unknown>, handler: RegisteredTool["handler"]) {
      tools.set(name, { config, handler });
    }
  } as unknown as McpServer;
  registerTools(server);
  registerFederationTools(server);
  return tools;
}

async function callTool(name: string, input: unknown) {
  const tool = captureToolsWithFederationRegistration().get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool.handler(input);
}

function errorCode(result: { content: Array<{ text: string }> }): string | undefined {
  return JSON.parse(result.content[0]!.text).error?.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  federationPersistence.registerConnector.mockResolvedValue({ ...connector, status: "ACTIVE", architectureScope: designerScope });
  federationPersistence.recordObservation.mockResolvedValue({ id: "observation-1", architectureScope: designerScope });
  federationPersistence.promoteCandidate.mockResolvedValue({ id: "fact-1", status: "PROMOTED", architectureScope: designerScope });
  federationPersistence.createDesignChangeSession.mockResolvedValue({ id: "session-1", architectureScope: designerScope });
  federationPersistence.reconcilePersistedScope.mockResolvedValue({ architectureScope: designerScope, root: "root-1", status: "CONVERGED", issues: [], factDigests: [] });
  persistence.prisma.connectorInstance.findMany.mockResolvedValue([{ id: connector.id, status: "ACTIVE", applicationServiceId: designerScope.applicationServiceId, scopePath: designerScope.scopePath }]);
  persistence.prisma.federationOutbox.count.mockResolvedValue(2);
  persistence.prisma.sourceObservation.count.mockResolvedValue(1);
  persistence.prisma.reconciliationSnapshot.findFirst.mockResolvedValue({ root: "root-1", status: "CONVERGED", createdAt: new Date("2026-07-19T00:00:00.000Z") });
});

afterEach(() => vi.restoreAllMocks());

describe("federation MCP tools", () => {
  it("registers federation tools with read-only annotations where applicable", () => {
    const tools = captureToolsWithFederationRegistration();
    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      "register_connector",
      "record_external_observation",
      "promote_candidate_fact",
      "create_design_change_session",
      "reconcile_federated_scope",
      "get_federated_sync_status"
    ]));
    expect((tools.get("reconcile_federated_scope")!.config.annotations as { readOnlyHint: boolean }).readOnlyHint).toBe(true);
    expect((tools.get("get_federated_sync_status")!.config.annotations as { readOnlyHint: boolean }).readOnlyHint).toBe(true);
  });

  it("declares the required permissions for federation writes and reads", () => {
    const tools = captureToolsWithFederationRegistration();
    expect((tools.get("register_connector")!.config._meta as { permissions: string[] }).permissions).toEqual(["asset:write"]);
    expect((tools.get("reconcile_federated_scope")!.config._meta as { permissions: string[] }).permissions).toEqual(["asset:read", "governance:run"]);
    expect((tools.get("get_federated_sync_status")!.config._meta as { permissions: string[] }).permissions).toEqual(["asset:read"]);
  });

  it("rejects a connector write when applicationServiceId and scopePath do not match the registered Scope", async () => {
    const result = await callTool("register_connector", {
      ...connector,
      architectureScope: { applicationServiceId: designerScope.applicationServiceId, scopePath: siblingScope.scopePath }
    });

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("SCOPE_MISMATCH");
    expect(federationPersistence.registerConnector).not.toHaveBeenCalled();
  });

  it("routes a scoped connector write through federation persistence", async () => {
    const result = await callTool("register_connector", { ...connector, architectureScope: designerScope });

    expect(result.isError).not.toBe(true);
    expect(federationPersistence.registerConnector).toHaveBeenCalledWith({ ...connector, status: "ACTIVE", architectureScope: designerScope });
  });

  it("derives a candidate observation envelope before routing its write through federation persistence", async () => {
    const result = await callTool("record_external_observation", {
      connectorId: connector.id,
      sourceNamespace: "github",
      externalAssetType: "api",
      externalId: "payments-api",
      payload: { version: 1 },
      sourceVersion: "abc123",
      architectureScope: designerScope
    });

    expect(result.isError).not.toBe(true);
    expect(federationPersistence.recordObservation).toHaveBeenCalledWith(expect.objectContaining({
      connectorId: connector.id,
      architectureScope: designerScope,
      status: "CANDIDATE",
      sourceVersion: "abc123",
      provenance: expect.objectContaining({ sourceSystem: "github", connectorInstanceId: connector.id })
    }));
  });

  it("returns a structured stable persistence error and audits the failed write", async () => {
    federationPersistence.promoteCandidate.mockRejectedValueOnce(new Error("IDENTITY_CONFLICT"));

    const result = await callTool("promote_candidate_fact", {
      candidateId: "candidate-1",
      approvalReason: "Reviewed source contract.",
      humanFacing: true,
      fact: {
        id: "fact-1",
        assetType: "api",
        schemaVersion: "1",
        payload: { name: "Payments API" },
        localizedContent: { en: { name: "Payments API" }, zh: { name: "Payments API" } },
        normalizedDigest: "digest-1",
        authority: "EXTERNAL",
        confidence: 1,
        provenance: { sourceSystem: "github", connectorInstanceId: connector.id, observedAt: "2026-07-19T00:00:00.000Z" }
      },
      architectureScope: designerScope
    });

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("IDENTITY_CONFLICT");
  });

  it("normalizes authority policy failures to the stable authority conflict code", async () => {
    federationPersistence.promoteCandidate.mockRejectedValueOnce(new Error("AUTHORITY_POLICY_AMBIGUOUS"));

    const result = await callTool("promote_candidate_fact", {
      candidateId: "candidate-1",
      approvalReason: "Reviewed source contract.",
      humanFacing: true,
      fact: {
        id: "fact-1", assetType: "api", schemaVersion: "1", payload: {}, localizedContent: { zh: {} }, normalizedDigest: "digest-1", authority: "EXTERNAL", confidence: 1,
        provenance: { sourceSystem: "github", connectorInstanceId: connector.id, observedAt: "2026-07-19T00:00:00.000Z" }
      },
      architectureScope: designerScope
    });

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("AUTHORITY_CONFLICT");
  });

  it("normalizes durable delivery failures to the stable delivery blocked code", async () => {
    federationPersistence.recordObservation.mockRejectedValueOnce(new Error("OUTBOX_WRITE_FAILED"));

    const result = await callTool("record_external_observation", {
      connectorId: connector.id,
      sourceNamespace: "github",
      externalAssetType: "api",
      externalId: "payments-api",
      payload: { version: 1 },
      sourceVersion: "abc123",
      architectureScope: designerScope
    });

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("DELIVERY_BLOCKED");
  });

  it("routes scoped reconciliation without a write-side snapshot", async () => {
    const result = await callTool("reconcile_federated_scope", { architectureScope: designerScope });

    expect(result.isError).not.toBe(true);
    expect(federationPersistence.reconcilePersistedScope).toHaveBeenCalledWith({ architectureScope: designerScope, acceptedFacts: [] });
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ root: "root-1", status: "CONVERGED" });
  });

  it("returns scoped connector freshness, delivery, conflicts, and the latest reconciliation", async () => {
    const result = await callTool("get_federated_sync_status", { architectureScope: designerScope });

    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual(expect.objectContaining({
      architectureScope: designerScope,
      connectors: [expect.objectContaining({ id: connector.id, freshness: "UNKNOWN" })],
      pendingDelivery: 2,
      conflicts: 1,
      latestReconciliation: expect.objectContaining({ root: "root-1", status: "CONVERGED" })
    }));
  });
});
