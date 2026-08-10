import { describe, expect, it, vi } from "vitest";
import { createThreeAProjectionQueryService } from "./service";
import type { CursorKeyring } from "./cursor";
import type { ThreeAQueryRepository, TraceContinuationStore } from "./types";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const principal = { actorType: "agent" as const, actorId: "agent-a", subject: "agent-a", tenantId: "tenant-a", authSource: "static-bearer" as const, permissions: ["knowledge:read" as const], decisionRef: "decision-a", grants: [{ scopeId: scope.applicationServiceId, action: "read" as const }] };
const manifest = { ...scope, id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2" as const, sourceRevisionIds: ["a-1"], relationshipVersion: "r1", query: {}, inputDigest: "input", contentDigest: "content", nodeCount: 1, edgeCount: 0, publishedAt: "2026-08-10T00:00:00.000Z" };
const repository: ThreeAQueryRepository = { listOfficialBaselines: vi.fn().mockResolvedValue([]), listPublishedManifests: vi.fn().mockResolvedValue([manifest]), searchNodes: vi.fn().mockResolvedValue({ nodes: [], hasMore: false }), getFact: vi.fn(), listEdges: vi.fn().mockResolvedValue([]) };
const store: TraceContinuationStore = { create: vi.fn(), consume: vi.fn() };
const keyring: CursorKeyring = { activeKeyId: "k1", keys: { k1: Buffer.from("test-key") } };

describe("3A query service", () => {
  it("authorizes exact Scope before checking Baseline existence", async () => { const service = createThreeAProjectionQueryService(repository, store, keyring); const unauthorized = { ...principal, grants: [] }; await expect(service.listPublishedBaselines({ principal: unauthorized, architectureScope: scope })).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" }); expect(repository.listOfficialBaselines).not.toHaveBeenCalled(); });
  it("keeps an authorized empty catalog scoped and deterministic", async () => { const service = createThreeAProjectionQueryService(repository, store, keyring); await expect(service.searchArchitectureFacts({ principal, architectureScope: scope, baselineId: "baseline-1", projectionManifestId: "manifest-1" })).resolves.toMatchObject({ applicationServiceId: scope.applicationServiceId, nodes: [] }); });
});
