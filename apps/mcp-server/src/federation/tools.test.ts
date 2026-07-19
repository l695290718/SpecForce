import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { contentDigest } from "@specforge/core";
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
  resolveWritableScope: vi.fn((_actor: unknown, scope: ArchitectureScope) => {
    const registered = scope.applicationServiceId === designerScope.applicationServiceId
      ? designerScope
      : scope.applicationServiceId === siblingScope.applicationServiceId
        ? siblingScope
        : undefined;
    if (!registered || registered.scopePath !== scope.scopePath) throw new Error("Scope write is not authorized.");
    return registered;
  }),
  prisma: {
    auditLog: { create: vi.fn(), update: vi.fn() },
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

type ToolExtra = {
  authInfo?: {
    token: string;
    clientId: string;
    scopes: string[];
    extra?: Record<string, unknown>;
  };
};

type RegisteredTool = {
  config: Record<string, unknown>;
  handler: (input: unknown, extra?: ToolExtra) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
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

const authorizedExtra: ToolExtra = {
  authInfo: {
    token: "test-token",
    clientId: "test-client",
    scopes: ["asset:read", "asset:write", "governance:run"],
    extra: {
      actor: {
        actorType: "agent",
        actorId: "caller-agent",
        grants: [
          { scopeId: designerScope.applicationServiceId, action: "read" },
          { scopeId: designerScope.applicationServiceId, action: "write" }
        ],
        permissions: ["asset:read", "asset:write", "governance:run"]
      }
    }
  }
};

const readOnlyExtra: ToolExtra = {
  authInfo: {
    token: "read-token",
    clientId: "read-client",
    scopes: [],
    extra: {
      actor: {
        actorType: "user",
        actorId: "read-only-user",
        grants: [{ scopeId: designerScope.applicationServiceId, action: "read" }],
        permissions: []
      }
    }
  }
};

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

async function callTool(name: string, input: unknown, extra: ToolExtra = authorizedExtra) {
  const tool = captureToolsWithFederationRegistration().get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool.handler(input, extra);
}

function errorCode(result: { content: Array<{ text: string }> }): string | undefined {
  return JSON.parse(result.content[0]!.text).error?.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  federationPersistence.registerConnector.mockResolvedValue({ ...connector, status: "ACTIVE", architectureScope: designerScope });
  federationPersistence.recordObservation.mockResolvedValue({ id: "observation-1", architectureScope: designerScope });
  federationPersistence.promoteCandidate.mockResolvedValue({ id: "fact-1", status: "PROMOTED", architectureScope: designerScope });
  federationPersistence.createDesignChangeSession.mockResolvedValue({ id: "session-1", architectureScope: designerScope });
  federationPersistence.reconcilePersistedScope.mockResolvedValue({ architectureScope: designerScope, root: "root-1", status: "CONVERGED", issues: [], factDigests: [] });
  persistence.prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  persistence.prisma.auditLog.update.mockResolvedValue({ id: "audit-1" });
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
    expect(tools.get("promote_candidate_fact")!.config.inputSchema).not.toHaveProperty("humanFacing");
  });

  it("declares the required permissions for federation writes and reads", () => {
    const tools = captureToolsWithFederationRegistration();
    expect((tools.get("register_connector")!.config._meta as { permissions: string[] }).permissions).toEqual(["asset:write"]);
    expect((tools.get("reconcile_federated_scope")!.config._meta as { permissions: string[] }).permissions).toEqual(["asset:read", "governance:run"]);
    expect((tools.get("get_federated_sync_status")!.config._meta as { permissions: string[] }).permissions).toEqual(["asset:read"]);
  });

  it("requires every declared permission claim in addition to the exact Scope grant", async () => {
    const writeClaimMissing = structuredClone(authorizedExtra);
    writeClaimMissing.authInfo!.scopes = ["asset:read", "governance:run"];
    writeClaimMissing.authInfo!.extra = { actor: {
      actorType: "agent", actorId: "caller-agent", grants: [{ scopeId: designerScope.applicationServiceId, action: "write" }], permissions: ["asset:read", "governance:run"]
    } };
    const readClaimMissing = structuredClone(authorizedExtra);
    readClaimMissing.authInfo!.scopes = ["asset:write", "governance:run"];
    readClaimMissing.authInfo!.extra = { actor: {
      actorType: "agent", actorId: "caller-agent", grants: [{ scopeId: designerScope.applicationServiceId, action: "read" }], permissions: ["asset:write", "governance:run"]
    } };
    const governanceClaimMissing = structuredClone(authorizedExtra);
    governanceClaimMissing.authInfo!.scopes = ["asset:read", "asset:write"];
    governanceClaimMissing.authInfo!.extra = { actor: {
      actorType: "agent", actorId: "caller-agent", grants: [{ scopeId: designerScope.applicationServiceId, action: "read" }], permissions: ["asset:read", "asset:write"]
    } };

    expect(errorCode(await callTool("register_connector", { ...connector, architectureScope: designerScope }, writeClaimMissing))).toBe("PERMISSION_DENIED");
    expect(errorCode(await callTool("get_federated_sync_status", { architectureScope: designerScope }, readClaimMissing))).toBe("PERMISSION_DENIED");
    expect(errorCode(await callTool("reconcile_federated_scope", { architectureScope: designerScope }, governanceClaimMissing))).toBe("PERMISSION_DENIED");
  });

  it("does not let actor permissions replace missing authenticated claims", async () => {
    const actorOnlyWrite = structuredClone(authorizedExtra);
    actorOnlyWrite.authInfo!.scopes = ["asset:read", "governance:run"];
    const actorOnlyRead = structuredClone(authorizedExtra);
    actorOnlyRead.authInfo!.scopes = ["asset:write", "governance:run"];
    const actorOnlyGovernance = structuredClone(authorizedExtra);
    actorOnlyGovernance.authInfo!.scopes = ["asset:read", "asset:write"];

    expect(errorCode(await callTool("register_connector", { ...connector, architectureScope: designerScope }, actorOnlyWrite))).toBe("PERMISSION_DENIED");
    expect(errorCode(await callTool("get_federated_sync_status", { architectureScope: designerScope }, actorOnlyRead))).toBe("PERMISSION_DENIED");
    expect(errorCode(await callTool("reconcile_federated_scope", { architectureScope: designerScope }, actorOnlyGovernance))).toBe("PERMISSION_DENIED");
  });

  it("requires an exact application-service grant for reads and writes", async () => {
    const parentOnly = structuredClone(authorizedExtra);
    parentOnly.authInfo!.extra = { actor: {
      actorType: "agent",
      actorId: "caller-agent",
      grants: [
        { scopeId: "module-celon-designer", action: "read" },
        { scopeId: "module-celon-designer", action: "write" }
      ],
      permissions: ["asset:read", "asset:write", "governance:run"]
    } };

    expect(errorCode(await callTool("get_federated_sync_status", { architectureScope: designerScope }, parentOnly))).toBe("PERMISSION_DENIED");
    expect(errorCode(await callTool("register_connector", { ...connector, architectureScope: designerScope }, parentOnly))).toBe("PERMISSION_DENIED");
  });

  it("accepts promotion only through the candidate identifier and exact Scope", async () => {
    const tool = captureToolsWithFederationRegistration().get("promote_candidate_fact")!;
    expect(tool.config.inputSchema).not.toHaveProperty("fact");
    expect(tool.config.inputSchema).not.toHaveProperty("payload");
    expect(tool.config.inputSchema).not.toHaveProperty("localizedContent");
    expect(tool.config.inputSchema).not.toHaveProperty("normalizedDigest");

    const result = await tool.handler({ candidateId: "candidate-1", approvalReason: "Reviewed source contract.", architectureScope: designerScope, payload: { arbitrary: true }, normalizedDigest: "caller-digest", localizedContent: { en: {}, zh: {} } }, authorizedExtra);
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("CANDIDATE_INPUT_UNSUPPORTED");
    expect(federationPersistence.promoteCandidate).not.toHaveBeenCalled();
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
    expect(persistence.resolveWritableScope).toHaveBeenCalledWith(expect.objectContaining({ actorId: "caller-agent" }), designerScope);
  });

  it("denies a connector write when the caller has only a read grant", async () => {
    const result = await callTool("register_connector", { ...connector, architectureScope: designerScope }, readOnlyExtra);

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("PERMISSION_DENIED");
    expect(federationPersistence.registerConnector).not.toHaveBeenCalled();
  });

  it("denies reconciliation when governance permission is absent", async () => {
    const result = await callTool("reconcile_federated_scope", { architectureScope: designerScope }, readOnlyExtra);

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("PERMISSION_DENIED");
    expect(federationPersistence.reconcilePersistedScope).not.toHaveBeenCalled();
  });

  it("writes a durable success audit event with the authenticated caller", async () => {
    await callTool("register_connector", { ...connector, architectureScope: designerScope });

    expect(persistence.prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorType: "agent",
      actorId: "caller-agent",
      channel: "mcp",
      action: "register_connector",
      status: "PENDING"
    }) });
    expect(persistence.prisma.auditLog.update).toHaveBeenCalledWith({
      where: { id: "audit-1" },
      data: expect.objectContaining({ status: "success" })
    });
  });

  it("writes a durable failure audit event for a denied caller", async () => {
    await callTool("register_connector", { ...connector, architectureScope: designerScope }, readOnlyExtra);

    expect(persistence.prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorType: "user",
      actorId: "read-only-user",
      action: "register_connector",
      status: "PENDING"
    }) });
    expect(persistence.prisma.auditLog.update).toHaveBeenCalledWith({
      where: { id: "audit-1" },
      data: expect.objectContaining({ status: "failed", errorMessage: expect.stringContaining("PERMISSION_DENIED") })
    });
  });

  it("returns an audit persistence error when success finalization fails after mutation", async () => {
    persistence.prisma.auditLog.update.mockRejectedValueOnce(new Error("AUDIT_UPDATE_FAILED"));

    const result = await callTool("register_connector", { ...connector, architectureScope: designerScope });

    expect(federationPersistence.registerConnector).toHaveBeenCalledOnce();
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("AUDIT_PERSISTENCE_FAILED");
    expect(result.content[0]!.text).not.toContain("AUDIT_UPDATE_FAILED");
    expect(persistence.prisma.auditLog.update).toHaveBeenCalledTimes(2);
    expect(persistence.prisma.auditLog.update).toHaveBeenLastCalledWith({
      where: { id: "audit-1" },
      data: { status: "failed", errorMessage: "AUDIT_FINALIZATION_RETRY_REQUIRED" }
    });
  });

  it("does not commit a failed mutation when failed-call audit finalization fails", async () => {
    federationPersistence.registerConnector.mockRejectedValueOnce(new Error("CONNECTOR_WRITE_FAILED"));
    persistence.prisma.auditLog.update.mockRejectedValueOnce(new Error("AUDIT_UPDATE_FAILED"));

    const result = await callTool("register_connector", { ...connector, architectureScope: designerScope });

    expect(federationPersistence.registerConnector).toHaveBeenCalledOnce();
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("AUDIT_PERSISTENCE_FAILED");
    expect(result.content[0]!.text).not.toContain("AUDIT_UPDATE_FAILED");
  });

  it("does not invoke federation persistence when the initial audit write fails", async () => {
    persistence.prisma.auditLog.create.mockRejectedValueOnce(new Error("AUDIT_CREATE_FAILED"));

    const result = await callTool("register_connector", { ...connector, architectureScope: designerScope });

    expect(federationPersistence.registerConnector).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("AUDIT_PERSISTENCE_FAILED");
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

  it("derives observation digests from canonical payload while retaining candidate localization", async () => {
    await callTool("record_external_observation", {
      connectorId: connector.id,
      sourceNamespace: "github",
      externalAssetType: "api",
      externalId: "payments-api",
      payload: { name: "Payments API", localizedContent: { en: { name: "Payments API" }, zh: { name: "支付 API" } } },
      sourceVersion: "abc123",
      architectureScope: designerScope
    });

    expect(federationPersistence.recordObservation).toHaveBeenCalledWith(expect.objectContaining({
      normalizedDigest: contentDigest({ name: "Payments API" }),
      payload: { name: "Payments API", localizedContent: { en: { name: "Payments API" }, zh: { name: "支付 API" } } }
    }));
  });

  it("returns a structured stable persistence error and audits the failed write", async () => {
    federationPersistence.promoteCandidate.mockRejectedValueOnce(new Error("IDENTITY_CONFLICT"));

    const result = await callTool("promote_candidate_fact", {
      candidateId: "candidate-1",
      approvalReason: "Reviewed source contract.",
      architectureScope: designerScope
    });

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("IDENTITY_CONFLICT");
  });

  it("preserves stable candidate-binding errors without exposing runtime details", async () => {
    federationPersistence.promoteCandidate.mockRejectedValueOnce(new Error("CANDIDATE_CONTENT_MISMATCH"));

    const result = await callTool("promote_candidate_fact", {
      candidateId: "candidate-1",
      approvalReason: "Reviewed source contract.",
      architectureScope: designerScope
    });

    expect(result.isError).toBe(true);
    expect(errorCode(result)).toBe("CANDIDATE_CONTENT_MISMATCH");
    expect(result.content[0]!.text).not.toContain("Caller replacement");
  });

  it("hides unknown runtime details from clients while retaining them in durable audit diagnostics", async () => {
    federationPersistence.registerConnector.mockRejectedValueOnce(new Error("database password leaked"));

    const result = await callTool("register_connector", { ...connector, architectureScope: designerScope });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).not.toContain("database password leaked");
    expect(errorCode(result)).toBe("FEDERATION_TOOL_ERROR");
    expect(persistence.prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: "PENDING"
    }) });
    expect(persistence.prisma.auditLog.update).toHaveBeenCalledWith({ where: { id: "audit-1" }, data: expect.objectContaining({
      status: "failed",
      errorMessage: "database password leaked"
    }) });
  });

  it("normalizes authority policy failures to the stable authority conflict code", async () => {
    federationPersistence.promoteCandidate.mockRejectedValueOnce(new Error("AUTHORITY_POLICY_AMBIGUOUS"));

    const result = await callTool("promote_candidate_fact", {
      candidateId: "candidate-1",
      approvalReason: "Reviewed source contract.",
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
    const tool = captureToolsWithFederationRegistration().get("reconcile_federated_scope")!;
    expect(tool.config.inputSchema).not.toHaveProperty("acceptedFacts");
    const result = await tool.handler({ architectureScope: designerScope, acceptedFacts: [{ id: "caller-controlled" }] }, authorizedExtra);

    expect(result.isError).not.toBe(true);
    expect(federationPersistence.reconcilePersistedScope).toHaveBeenCalledWith({ architectureScope: designerScope });
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
