import { beforeEach, describe, expect, it, vi } from "vitest";

const reportPersistence = vi.hoisted(() => ({
  ensureMcpPersistenceSchema: vi.fn().mockResolvedValue(undefined),
  writableActor: vi.fn(() => ({ actorId: "agent-1" })),
  resolveWritableScope: vi.fn((_actor: unknown, requestedScope: unknown) => requestedScope),
  prisma: {
    knowledgeScanSession: { findUnique: vi.fn() },
    sourceObservation: { findMany: vi.fn() }
  }
}));

vi.mock("../persistence", () => reportPersistence);

import {
  decodeScanReportCursor,
  encodeScanReportCursor,
  getKnowledgeScanReport,
  normalizeScanReportPageSize,
  remediationForScanIssue,
  scanObservationView
} from "./report";

const scope = {
  applicationServiceId: "com.specforge.designcenter",
  scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("governed scan report remediation", () => {
  it("maps capability blockers to release remediation", () => {
    expect(remediationForScanIssue("REQUIRED_EXTRACTOR_MISSING:nestjs:api").action).toContain("signed scanner release");
  });

  it("maps resume drift to a new session", () => {
    expect(remediationForScanIssue("SCAN_RESUME_CONTEXT_MISMATCH:POLICY_RECEIPT").action).toContain("new session");
  });
});

describe("governed scan report pagination", () => {
  it("binds signed cursors to the exact Scope, actor, session, and payload mode", () => {
    const cursor = encodeScanReportCursor({
      version: 1,
      architectureScope: scope,
      actorId: "agent-1",
      sessionId: "scan-1",
      lastObservationId: "source:scan-1:000001",
      includePayload: true
    }, "test-secret");

    expect(decodeScanReportCursor(cursor, {
      architectureScope: scope,
      actorId: "agent-1",
      sessionId: "scan-1",
      includePayload: true
    }, "test-secret").lastObservationId).toBe("source:scan-1:000001");
    expect(() => decodeScanReportCursor(cursor, {
      architectureScope: scope,
      actorId: "agent-1",
      sessionId: "scan-2",
      includePayload: true
    }, "test-secret")).toThrow("SCAN_REPORT_CURSOR_INVALID");
    expect(() => decodeScanReportCursor(`${cursor}tampered`, {
      architectureScope: scope,
      actorId: "agent-1",
      sessionId: "scan-1",
      includePayload: true
    }, "test-secret")).toThrow("SCAN_REPORT_CURSOR_INVALID");
  });

  it("uses a smaller bounded page when redacted payload is requested", () => {
    expect(normalizeScanReportPageSize(undefined, false)).toBe(100);
    expect(normalizeScanReportPageSize(900, false)).toBe(500);
    expect(normalizeScanReportPageSize(900, true)).toBe(50);
  });

  it("omits payload by default and exposes only approved redacted fields on request", () => {
    const persistedPayload = {
      scanSessionId: "scan-1",
      batchSequence: 3,
      observationType: "api-contract",
      architectureLayer: "SYS",
      aspectHint: "contract",
      repository: { remote: "secret" },
      source: { path: "apps/api.ts", lineStart: 1, lineEnd: 8, excerpt: "redacted excerpt" },
      parser: { extractorId: "typescript" },
      payload: { operation: "GET /orders" },
      sensitivity: "INTERNAL",
      redaction: { applied: true },
      evidenceRefs: ["apps/api.ts:1"],
      normalizedDigest: "digest",
      warnings: [],
      coverageGaps: [],
      unapprovedInternalField: "must-not-leak"
    };

    expect(scanObservationView(persistedPayload, false)).toEqual({
      source: { path: "apps/api.ts", symbol: null, lineStart: 1, lineEnd: 8 }
    });
    expect(scanObservationView(persistedPayload, true)).toEqual({
      source: { path: "apps/api.ts", lineStart: 1, lineEnd: 8, excerpt: "redacted excerpt" },
      observationType: "api-contract",
      architectureLayer: "SYS",
      aspectHint: "contract",
      repository: { remote: "secret" },
      parser: { extractorId: "typescript" },
      payload: { operation: "GET /orders" },
      sensitivity: "INTERNAL",
      redaction: { applied: true },
      evidenceRefs: ["apps/api.ts:1"],
      normalizedDigest: "digest",
      warnings: [],
      coverageGaps: []
    });
  });

  it("reads finalized observations without overlap across stable pages", async () => {
    reportPersistence.prisma.knowledgeScanSession.findUnique.mockResolvedValue({
      id: "scan-1",
      actorId: "agent-1",
      status: "READY_FOR_ANALYSIS",
      observationCount: 2,
      finalizationManifest: { coverage: { coverageGaps: ["node_modules/package.json:UNSUPPORTED_SOURCE_TYPE"] }, coveragePlan: { capabilities: [] } },
      evidencePolicy: { policyReceipt: { effectivePolicyDigest: "policy-digest" } },
      blockedReason: null
    });
    const rows = [
      { id: "source:scan-1:000001", externalAssetType: "api-contract", normalizedDigest: "digest-1", payload: { source: { path: "apps/a.ts" }, payload: { method: "GET" } }, observedAt: new Date("2026-09-21T00:00:00Z") },
      { id: "source:scan-1:000002", externalAssetType: "data-model", normalizedDigest: "digest-2", payload: { source: { path: "apps/b.ts" }, payload: { model: "Order" } }, observedAt: new Date("2026-09-21T00:00:01Z") }
    ];
    reportPersistence.prisma.sourceObservation.findMany.mockImplementation(async ({ where }: { where: { id: { gt?: string } } }) => {
      const after = where.id.gt;
      return rows.filter((row) => !after || row.id > after).slice(0, 2);
    });

    const first = await getKnowledgeScanReport({ architectureScope: scope, sessionId: "scan-1", pageSize: 1, includePayload: true });
    const second = await getKnowledgeScanReport({ architectureScope: scope, sessionId: "scan-1", pageSize: 1, includePayload: true, cursor: first.page.nextCursor });

    expect(first.observations.map((row) => row.id)).toEqual(["source:scan-1:000001"]);
    expect(first.page).toMatchObject({ returnedCount: 1, hasMore: true });
    expect(first.blockingIssues).toEqual([]);
    expect(second.observations.map((row) => row.id)).toEqual(["source:scan-1:000002"]);
    expect(second.page).toMatchObject({ returnedCount: 1, hasMore: false, nextCursor: undefined });
  });

  it("rejects reads before the scan is finalized", async () => {
    reportPersistence.prisma.knowledgeScanSession.findUnique.mockResolvedValue({
      id: "scan-1",
      actorId: "agent-1",
      status: "RECEIVING"
    });

    await expect(getKnowledgeScanReport({ architectureScope: scope, sessionId: "scan-1" })).rejects.toThrow("SCAN_REPORT_NOT_FINALIZED");
    expect(reportPersistence.prisma.sourceObservation.findMany).not.toHaveBeenCalled();
  });
});
