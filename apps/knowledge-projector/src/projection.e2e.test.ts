import { Prisma, PrismaClient } from "@prisma/client";
import { contentDigest, scopeById, type ArchitectureScopeRef, type ScopedPrincipal } from "@specforge/core";
import { createThreeAProjectionQueryService, PrismaThreeAQueryRepository, PrismaTraceContinuationStore } from "@specforge/knowledge-query";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectionMaterializer } from "./materializer.js";
import { PrismaProjectionBuildRepository } from "./repository.js";

const enabled = process.env.SPECFORGE_3A_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const scope: ArchitectureScopeRef = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const siblingService = scopeById("com.huawei.celon.policyhub");
const siblingScope: ArchitectureScopeRef | undefined = siblingService ? { applicationServiceId: siblingService.id, scopePath: siblingService.scopePath } : undefined;
const principal: ScopedPrincipal = {
  actorType: "agent",
  actorId: "3a-e2e-agent",
  subject: "3a-e2e-agent",
  tenantId: "local-development",
  authSource: "seed",
  permissions: ["knowledge:read"],
  decisionRef: "3a-e2e-decision",
  grants: [{ scopeId: scope.applicationServiceId, action: "read" }]
};

describe.skipIf(!enabled)("3A projection integration gate", () => {
  let prisma: PrismaClient;
  const prefix = `3a-e2e-${Date.now()}`;
  const fixture = {
    streamId: `${prefix}:stream`,
    changeSet1: `${prefix}:changeset:1`,
    changeSet2: `${prefix}:changeset:2`,
    baseline1: `${prefix}:baseline:1`,
    baseline2: `${prefix}:baseline:2`,
    build1: `${prefix}:build:1`,
    build2: `${prefix}:build:2`,
    generation1: `${prefix}:generation:1`,
    generation2: `${prefix}:generation:2`,
    biz: `${prefix}:assertion:biz`,
    sys: `${prefix}:assertion:sys`,
    tech: `${prefix}:assertion:tech`,
    added: `${prefix}:assertion:added`,
    relationBizSys: `${prefix}:assertion:relationship:biz-sys`,
    relationSysTech: `${prefix}:assertion:relationship:sys-tech`
  };

  beforeAll(async () => {
    expect(databaseUrl, "DATABASE_URL must target the canonical PostgreSQL integration database").toContain("specforge_canonical");
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    await createFixture(prisma, fixture);
  });

  afterAll(async () => {
    if (!prisma) return;
    await deleteFixture(prisma, fixture);
    await prisma.$disconnect();
  });

  it("builds, resumes, queries, compares, and isolates two official Baselines", async () => {
    const repository = new PrismaProjectionBuildRepository(prisma);
    const owner = `${prefix}:worker`;
    const materializer = new ProjectionMaterializer(repository, { owner, batchSize: 2, leaseDurationMs: 1_000 });
    const firstManifest = await runBuild(prisma, materializer, fixture.build1, owner);
    const secondManifest = await runBuild(prisma, materializer, fixture.build2, owner);
    expect(firstManifest.nodeCount).toBeGreaterThanOrEqual(3);
    expect(firstManifest.edgeCount).toBe(2);
    expect(secondManifest.nodeCount).toBeGreaterThan(firstManifest.nodeCount);
    expect(secondManifest.edgeCount).toBe(2);

    const service = createThreeAProjectionQueryService(
      new PrismaThreeAQueryRepository(prisma),
      new PrismaTraceContinuationStore(prisma),
      { activeKeyId: "e2e", keys: { e2e: Buffer.from(`${prefix}:cursor-key`) } }
    );
    const baselines = await service.listPublishedBaselines({ principal, architectureScope: scope });
    expect(baselines.filter((baseline) => baseline.id.startsWith(prefix))).toHaveLength(2);

    const manifests = await service.listProjectionManifests({ principal, architectureScope: scope, baselineId: fixture.baseline1 });
    expect(manifests).toHaveLength(1);
    const manifest = manifests[0]!;
    const search = await service.searchArchitectureFacts({ principal, architectureScope: scope, baselineId: fixture.baseline1, projectionManifestId: manifest.id, layer: "BIZ" });
    expect(search.nodes).toEqual([expect.objectContaining({ assertionId: fixture.biz, layer: "BIZ" })]);
    const pagedSearch = await service.searchArchitectureFacts({ principal, architectureScope: scope, baselineId: fixture.baseline1, projectionManifestId: manifest.id, limit: 1 });
    expect(pagedSearch.nextCursor).toBeDefined();
    await expect(service.searchArchitectureFacts({ principal: { ...principal, subject: "other-agent", actorId: "other-agent" }, architectureScope: scope, baselineId: fixture.baseline1, projectionManifestId: manifest.id, cursor: pagedSearch.nextCursor })).rejects.toMatchObject({ code: "CURSOR_INVALID" });

    const trace = await service.traceArchitecturePath({ principal, architectureScope: scope, baselineId: fixture.baseline1, projectionManifestId: manifest.id, startAssertionId: fixture.biz, direction: "downstream", budget: { maxDepth: 2 } });
    expect(trace.edges.map((edge) => edge.relationshipIdentity)).toEqual(expect.arrayContaining([`${fixture.streamId}:relationship:checkout-intent-service`, `${fixture.streamId}:relationship:checkout-service-storage`]));
    expect(trace.nodes.map((node) => node.assertionId)).toEqual(expect.arrayContaining([fixture.biz, fixture.sys, fixture.tech]));

    const detail = await service.getArchitectureFactDetail({ principal, architectureScope: scope, baselineId: fixture.baseline1, projectionManifestId: manifest.id, assertionId: fixture.biz });
    expect(detail.canonicalEnglish).toEqual(expect.objectContaining({ name: "Checkout intent" }));
    expect(detail.localizedChinese).toEqual(expect.objectContaining({ name: "结算意图" }));
    expect(detail.outgoing).toHaveLength(1);
    expect((await service.getArchitectureAlignment({ principal, architectureScope: scope, baselineId: fixture.baseline1, projectionManifestId: manifest.id })).edges).toHaveLength(2);

    const targetManifests = await service.listProjectionManifests({ principal, architectureScope: scope, baselineId: fixture.baseline2 });
    const drift = await service.comparePublishedBaselines({ principal, architectureScope: scope, baseBaselineId: fixture.baseline1, targetBaselineId: fixture.baseline2, baseProjectionManifestId: manifest.id, targetProjectionManifestId: targetManifests[0]!.id });
    expect(drift.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityKind: "NODE", change: "ADDED", stableKey: expect.stringContaining(`${fixture.streamId}:semantic:added`) }),
      expect.objectContaining({ entityKind: "EDGE", change: "CHANGED", stableKey: expect.stringContaining(`${fixture.streamId}:relationship:checkout-intent-service`) })
    ]));

    if (!siblingScope) throw new Error("E2E_SIBLING_SCOPE_FIXTURE_MISSING");
    await expect(service.listPublishedBaselines({ principal, architectureScope: siblingScope })).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" });
  }, 30_000);
});

async function runBuild(prisma: PrismaClient, materializer: ProjectionMaterializer, buildId: string, owner: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await materializer.processOnce();
    if (result.status === "READY") {
      const manifest = await prisma.projectionManifest.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: result.manifestId! } } });
      if (!manifest) throw new Error(`E2E_MANIFEST_MISSING:${buildId}`);
      return { id: manifest.id, nodeCount: manifest.nodeCount!, edgeCount: manifest.edgeCount! };
    }
    if (result.status === "FAILED") throw new Error(`E2E_BUILD_FAILED:${buildId}:${result.errorCode}`);
    await prisma.projectionBuildJob.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: buildId } }, data: { leaseExpiresAt: new Date(Date.now() - 1) } });
  }
  throw new Error(`E2E_BUILD_TIMEOUT:${buildId}`);
}

async function createFixture(prisma: PrismaClient, ids: fixtureForType): Promise<void> {
  const now = new Date();
  const semantic = {
    biz: `${ids.streamId}:semantic:biz`,
    sys: `${ids.streamId}:semantic:sys`,
    tech: `${ids.streamId}:semantic:tech`
  };
  await prisma.workingStream.create({ data: { ...scope, id: ids.streamId, name: "3A integration stream", status: "ACTIVE" } });
  await prisma.knowledgeChangeSet.createMany({ data: [
    { ...scope, id: ids.changeSet1, streamId: ids.streamId, sequence: 1, status: "COMMITTED", digest: contentDigest(ids.changeSet1) },
    { ...scope, id: ids.changeSet2, streamId: ids.streamId, sequence: 2, status: "COMMITTED", digest: contentDigest(ids.changeSet2) }
  ] });
  await prisma.knowledgeAssertion.createMany({ data: [
    assertion(ids.biz, semantic.biz, "BIZ", "business-intent", ids.changeSet1, { canonicalContent: { name: "Checkout intent" }, localizedContent: { zh: { name: "结算意图" } } }),
    assertion(ids.sys, semantic.sys, "SYS", "system-service", ids.changeSet1, { canonicalContent: { name: "Checkout service" }, localizedContent: { zh: { name: "结算服务" } } }),
    assertion(ids.tech, semantic.tech, "TECH", "technical-store", ids.changeSet1, { canonicalContent: { name: "Checkout store" }, localizedContent: { zh: { name: "结算存储" } } }),
    assertion(ids.added, `${ids.streamId}:semantic:added`, "TECH", "technical-store", ids.changeSet2, { canonicalContent: { name: "Checkout audit store" }, localizedContent: { zh: { name: "结算审计存储" } } }),
    relationship(ids.relationBizSys, `${ids.streamId}:relationship:checkout-intent-service`, ids.changeSet1, semantic.biz, semantic.sys, "REALIZES"),
    relationship(ids.relationSysTech, `${ids.streamId}:relationship:checkout-service-storage`, ids.changeSet1, semantic.sys, semantic.tech, "PERSISTS")
  ] });
  const revisionIds = [ids.biz, ids.sys, ids.tech, ids.added, ids.relationBizSys, ids.relationSysTech];
  await prisma.knowledgeBaseline.createMany({ data: [
    { ...scope, id: ids.baseline1, streamId: ids.streamId, changeSetId: ids.changeSet1, status: "SUPERSEDED", manifest: { sourceRevisionIds: revisionIds.filter((id) => id !== ids.added), relationshipVersion: "r1" }, publishedAt: new Date(now.getTime() - 2_000) },
    { ...scope, id: ids.baseline2, streamId: ids.streamId, changeSetId: ids.changeSet2, status: "PUBLISHED", manifest: { sourceRevisionIds: revisionIds, relationshipVersion: "r2" }, publishedAt: new Date(now.getTime() - 1_000) }
  ] });
  await prisma.projectionBuildJob.createMany({ data: [
    build(ids.build1, ids.baseline1, ids.generation1),
    build(ids.build2, ids.baseline2, ids.generation2)
  ] });
}

function assertion(id: string, semanticIdentity: string, layer: string, factType: string, changeSetId: string, value: Prisma.InputJsonValue): Prisma.KnowledgeAssertionCreateManyInput {
  return { ...scope, id, semanticIdentity, layer, factType, aspect: "design", value, status: "ACCEPTED", confidence: 0.95, matchingEvidence: [], counterEvidence: [], unresolvedQuestions: [], evidenceRefs: [`${id}:evidence`], sourceObservationIds: [`${id}:observation`], extractorId: "3a-e2e", revision: 1, changeSetId };
}

function relationship(id: string, semanticIdentity: string, changeSetId: string, sourceSemanticIdentity: string, targetSemanticIdentity: string, relationType: string) {
  return assertion(id, semanticIdentity, "SYS", "typed-relationship", changeSetId, { canonicalContent: { source: { semanticIdentity: sourceSemanticIdentity }, target: { semanticIdentity: targetSemanticIdentity }, relationType } });
}

function build(id: string, baselineId: string, generationId: string) {
  return { ...scope, id, buildKey: `${id}:key`, generationId, baselineId, profileId: "generic-system", profileVersion: "1", projectionSchemaVersion: "3a.v2", status: "QUEUED" };
}

async function deleteFixture(prisma: PrismaClient, ids: fixtureForType): Promise<void> {
  const assertionIds = [ids.biz, ids.sys, ids.tech, ids.added, ids.relationBizSys, ids.relationSysTech];
  await prisma.$transaction([
    prisma.traceContinuation.deleteMany({ where: { ...scope, browseSessionId: { startsWith: ids.streamId } } }),
    prisma.knowledgeProjectionEdge.deleteMany({ where: { ...scope, generationId: { in: [ids.generation1, ids.generation2] } } }),
    prisma.knowledgeProjectionNode.deleteMany({ where: { ...scope, generationId: { in: [ids.generation1, ids.generation2] } } }),
    prisma.projectionManifest.deleteMany({ where: { ...scope, baselineId: { in: [ids.baseline1, ids.baseline2] } } }),
    prisma.projectionBuildJob.deleteMany({ where: { ...scope, id: { in: [ids.build1, ids.build2] } } }),
    prisma.knowledgeAssertion.deleteMany({ where: { ...scope, id: { in: assertionIds } } }),
    prisma.knowledgeBaseline.deleteMany({ where: { ...scope, id: { in: [ids.baseline1, ids.baseline2] } } }),
    prisma.knowledgeChangeSet.deleteMany({ where: { ...scope, id: { in: [ids.changeSet1, ids.changeSet2] } } }),
    prisma.workingStream.deleteMany({ where: { ...scope, id: ids.streamId } })
  ]);
}

type fixtureForType = {
  streamId: string; changeSet1: string; changeSet2: string; baseline1: string; baseline2: string; build1: string; build2: string; generation1: string; generation2: string; biz: string; sys: string; tech: string; added: string; relationBizSys: string; relationSysTech: string;
};
