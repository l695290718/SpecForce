import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FeatureChangeSetRequest, FunctionalFeature, ServiceFeature } from "@specforge/core";
import { scopeById } from "@specforge/core";
import { applyFeatureChangeSet } from "./service";
import { getFeature, listFeatures, queryFeatureGraph, validateFeatureCoverage } from "./read-service";
import { configuredRelationshipScope, disconnectMcpPersistence, ensureMcpPersistenceSchema, prisma } from "../persistence";

const enabled = process.env.SPECFORGE_FEATURE_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const registered = scopeById("com.huawei.celon.desiner")!;
const scope = { applicationServiceId: registered.id, scopePath: registered.scopePath };
const prefix = `feature-integration-${Date.now()}`;
const sessionId = `${prefix}-session`;
const now = "2026-09-03T00:00:00.000Z";

const service: ServiceFeature = {
  id: `${prefix}-sf`, name: "Atomic Feature delivery", description: "Proves atomic Feature persistence.", lifecycleStatus: "ACTIVE", tags: ["integration-test"], actors: ["Architect"], scenario: "An architect writes a Feature batch.", valueOutcome: "Assets and links commit together.", benefitHypothesis: "Atomic writes avoid partial design graphs.", serviceBoundary: ["Test Scope only."], acceptanceCriteria: ["The batch is replayable."], createdAt: now, updatedAt: now, architectureScope: scope,
  localizedContent: { zh: { name: "原子特性交付", description: "验证特性原子持久化。", actors: ["架构师"], scenario: "架构师写入特性批次。", valueOutcome: "资产和关系同时提交。", benefitHypothesis: "原子写入避免不完整设计图。", serviceBoundary: ["仅测试 Scope。"], acceptanceCriteria: ["批次可以幂等重放。"] } }
};
const functional: FunctionalFeature = {
  id: `${prefix}-ff`, name: "Apply Feature batch", description: "Applies one validated Feature batch.", lifecycleStatus: "ACTIVE", tags: ["integration-test"], trigger: "A valid batch arrives.", observableBehavior: "The entire batch commits.", preconditions: ["The design session is open."], postconditions: ["Assets and relationships share committed waterlines."], exceptionBehaviors: ["An invalid relationship rolls back the batch."], acceptanceCriteria: ["Replay creates no new revision."], createdAt: now, updatedAt: now, architectureScope: scope,
  localizedContent: { zh: { name: "应用特性批次", description: "应用一个已校验的特性批次。", trigger: "收到合法批次。", observableBehavior: "整个批次完成提交。", preconditions: ["设计会话处于打开状态。"], postconditions: ["资产与关系共享已提交水位。"], exceptionBehaviors: ["非法关系导致批次整体回滚。"], acceptanceCriteria: ["重放不新增修订。"] } }
};
const endpoint = (assetType: "serviceFeature" | "functionalFeature", assetId: string) => ({ ...scope, nodeType: assetType, logicalId: assetId, rootAssetType: assetType, rootAssetId: assetId } as const);
const input: FeatureChangeSetRequest = {
  architectureScope: scope, designChangeSessionId: sessionId, correlationId: `${prefix}-correlation`, idempotencyKey: `${prefix}-batch`,
  assets: [{ assetType: "serviceFeature", asset: service }, { assetType: "functionalFeature", asset: functional }],
  relationships: [{ relationType: "CONTRIBUTES_TO", source: endpoint("functionalFeature", functional.id), target: endpoint("serviceFeature", service.id) }]
};

describe.runIf(enabled)("atomic Feature Change Set persistence", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await ensureMcpPersistenceSchema();
    await prisma.designChangeSession.create({ data: { ...scope, id: sessionId, actorId: "feature-integration", intent: "Verify atomic Feature Change Set", status: "OPEN" } });
  });

  afterAll(async () => {
    const graphScope = configuredRelationshipScope(scope);
    const nodes = await prisma.assetNode.findMany({ where: { ...graphScope, rootAssetId: { startsWith: prefix } }, select: { dbId: true } });
    const nodeIds = nodes.map((node) => node.dbId);
    const events = await prisma.relationshipEvent.findMany({ where: { ...graphScope, OR: [{ assetNodeId: { in: nodeIds } }, { correlationId: { startsWith: prefix } }] }, select: { dbId: true } });
    await prisma.relationshipOutbox.deleteMany({ where: { ...graphScope, relationshipEventId: { in: events.map((event) => event.dbId) } } });
    await prisma.relationshipEvent.deleteMany({ where: { ...graphScope, dbId: { in: events.map((event) => event.dbId) } } });
    await prisma.relationshipCurrent.deleteMany({ where: { ...graphScope, OR: [{ sourceNodeId: { in: nodeIds } }, { targetNodeId: { in: nodeIds } }] } });
    await prisma.assetNode.deleteMany({ where: { ...graphScope, dbId: { in: nodeIds } } });
    await prisma.relationshipCommandReceipt.deleteMany({ where: { ...graphScope, idempotencyKey: { startsWith: prefix } } });
    await prisma.assetSearchProjection.deleteMany({ where: { ...scope, assetId: { startsWith: prefix } } });
    await prisma.authoredAssetRevision.deleteMany({ where: { ...scope, assetId: { startsWith: prefix } } });
    await prisma.designAsset.deleteMany({ where: { ...scope, id: { startsWith: prefix } } });
    await prisma.auditLog.deleteMany({ where: { ...scope, targetId: { startsWith: prefix } } });
    await prisma.designChangeSession.deleteMany({ where: { ...scope, id: sessionId } });
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
  });

  it("commits assets, revisions, relationship events, and a stable replay receipt", async () => {
    const first = await applyFeatureChangeSet(input);
    const revisionCount = await prisma.authoredAssetRevision.count({ where: { ...scope, assetId: { in: [service.id, functional.id] } } });
    const replay = await applyFeatureChangeSet(input);
    expect(first).toMatchObject({ changedAssetIds: [service.id, functional.id], dryRun: false, replayed: false });
    expect(first.changedRelationshipIds).toHaveLength(1);
    expect(revisionCount).toBe(2);
    expect(replay).toMatchObject({ requestDigest: first.requestDigest, replayed: true });
    expect(await prisma.authoredAssetRevision.count({ where: { ...scope, assetId: { in: [service.id, functional.id] } } })).toBe(2);
  });

  it("persists nothing for dry-run", async () => {
    const dry = { ...functional, id: `${prefix}-dry-ff` };
    const receipt = await applyFeatureChangeSet({ ...input, idempotencyKey: `${prefix}-dry`, dryRun: true, assets: [{ assetType: "functionalFeature", asset: dry }], relationships: [] });
    expect(receipt).toMatchObject({ dryRun: true, changedAssetIds: [dry.id] });
    expect(await prisma.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: dry.id } } })).toBeNull();
  });

  it("rejects stale versions before writing a new revision", async () => {
    const changed = { ...service, description: "Changed without the current version.", updatedAt: "2026-09-03T00:01:00.000Z", localizedContent: { zh: { ...service.localizedContent!.zh!, description: "未携带当前版本的变更。" } } };
    await expect(applyFeatureChangeSet({ ...input, idempotencyKey: `${prefix}-stale`, correlationId: `${prefix}-stale-correlation`, assets: [{ assetType: "serviceFeature", asset: changed, expectedVersion: "0" }], relationships: [] })).rejects.toMatchObject({ code: "FEATURE_VERSION_CONFLICT" });
    expect(await prisma.authoredAssetRevision.count({ where: { ...scope, assetId: service.id } })).toBe(1);
  });

  it("returns bounded localized reads and rejects a mismatched scope path", async () => {
    const list = await listFeatures({ architectureScope: scope, kind: "serviceFeature", query: "atomic", locale: "zh", limit: 10 });
    const detail = await getFeature({ architectureScope: scope, assetId: service.id, locale: "zh" });
    const graph = await queryFeatureGraph({ architectureScope: scope, root: { nodeType: "serviceFeature", logicalId: service.id }, depth: 2, limit: 20 });
    const coverage = await validateFeatureCoverage({ architectureScope: scope, assetId: service.id });
    expect(list.items).toContainEqual(expect.objectContaining({ id: service.id, name: "原子特性交付" }));
    expect(detail.asset).toMatchObject({ id: service.id, valueOutcome: "资产和关系同时提交。" });
    expect(graph.nodes.map((node) => node.logicalId)).toEqual(expect.arrayContaining([service.id, functional.id]));
    expect(coverage).toMatchObject({ assetId: service.id, coverageStatus: "COMPLETE" });
    await expect(listFeatures({ architectureScope: { ...scope, scopePath: `${scope.scopePath}/wrong` } })).rejects.toThrow("SCOPE_ACCESS_DENIED");
  });
});
