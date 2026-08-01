import { scopeById } from "@specforge/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitKnowledgeChangeSet, createKnowledgeAssertion, createProjectionManifest, createWorkingStream, listKnowledgeAssertions, publishKnowledgeBaseline } from "./persistence";
import { disconnectMcpPersistence, prisma } from "../persistence";

const integrationEnabled = process.env.SPECFORGE_KNOWLEDGE_INTEGRATION === "1";
const scope = scopeById("com.huawei.celon.desiner")!;
const architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
const prefix = "test-3a-foundation";

describe.runIf(integrationEnabled)("3A knowledge PostgreSQL persistence", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await deleteFixtures();
  });

  afterAll(async () => {
    await deleteFixtures();
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
  });

  it("persists an assertion, idempotent ChangeSet, converged Baseline, and projection manifest", async () => {
    const now = new Date().toISOString();
    const stream = await createWorkingStream({ id: `${prefix}-stream`, name: "Integration test stream", architectureScope });
    await createKnowledgeAssertion({
      architectureScope,
      assertion: {
        id: `${prefix}-assertion`,
        semanticIdentity: "order.lifecycle",
        factType: "state-transition",
        layer: "SYS",
        aspect: "behavior",
        value: { from: "PENDING", to: "CONFIRMED" },
        architectureScope,
        status: "CANDIDATE",
        confidence: 0.9,
        matchingEvidence: ["test-scanner"],
        counterEvidence: [],
        unresolvedQuestions: [],
        evidenceRefs: [`${prefix}-evidence`],
        sourceObservationIds: [`${prefix}-observation`],
        extractorId: "test-extractor",
        revision: 1,
        createdAt: now,
        updatedAt: now
      }
    });
    const changeSet = await commitKnowledgeChangeSet({ id: `${prefix}-changeset`, streamId: stream.id, architectureScope, assetRevisionIds: [`${prefix}-assertion`], relationshipRevisionIds: [], evidenceRefs: [`${prefix}-evidence`] });
    const retriedChangeSet = await commitKnowledgeChangeSet({ id: `${prefix}-changeset`, streamId: stream.id, architectureScope, assetRevisionIds: [`${prefix}-assertion`], relationshipRevisionIds: [], evidenceRefs: [`${prefix}-evidence`] });
    expect(retriedChangeSet.sequence).toBe(changeSet.sequence);
    const baseline = await publishKnowledgeBaseline({ id: `${prefix}-baseline`, streamId: stream.id, changeSetId: changeSet.id, architectureScope, sourceRevisionIds: [`${prefix}-assertion`], relationshipVersion: "1", reconciliationStatus: "CONVERGED" });
    const projection = await createProjectionManifest({ id: `${prefix}-projection`, baselineId: baseline.id, architectureScope, projectionType: "SYS_KL", projectionSchemaVersion: "1", sourceRevisionIds: [`${prefix}-assertion`], relationshipVersion: "1", query: { layer: "SYS" } });
    expect((await listKnowledgeAssertions(architectureScope.applicationServiceId)).some((item) => item.id === `${prefix}-assertion`)).toBe(true);
    expect(projection.digest).toMatch(/^[a-f0-9]{64}$/);
  }, 30000);
});

async function deleteFixtures(): Promise<void> {
  await prisma.projectionManifest.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeBaseline.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeChangeSet.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.workingStream.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeAssertion.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
}
