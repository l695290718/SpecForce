# 3A Neighborhood Query Identity Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make both public 3A architecture-unit neighborhood MCP paths work against the real PostgreSQL schema while preserving exact Scope, generation, Baseline, manifest binding, and existing client contracts.

**Architecture:** Keep \`ArchitectureMapIdentity\` as the complete identity for the three architecture projection tables. Construct table-specific filters for \`ProjectionManifest\` and \`KnowledgeProjectionEdge\` so unsupported \`projectionManifestId\` fields are never sent to Prisma. Verify both public MCP paths against the published v5 projection and synchronize the repository ADR, Proposal, Context Pack, API/read-model facts, evidence, and typed links through MCP.

**Tech Stack:** TypeScript, Prisma, PostgreSQL, Vitest, \`tsx\`, local MCP server over stdio, existing SpecForge design-context and design-facts commands.

## Global Constraints

- Owning application service: \`com.huawei.celon.desiner\`.
- Owning Scope path: \`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner\`.
- Preserve both public tools: \`get_3a_architecture_unit_neighborhood\` and \`query_3a_architecture_unit_neighborhood\`.
- Do not change Prisma schema, create a migration, rewrite data, change budgets, broaden Scope reads, or alter input/output contracts.
- PostgreSQL remains authoritative for authored assets and relationship events; graph stores remain derived projections.
- English canonical design fields are required and Chinese localized overlays must remain complete for human-facing decision content.
- Do not claim legacy scanners, continuous inbound synchronization, outbound proposals, or external \`APPLY\` as part of this increment.
- Implementation must use a new exact-Scope \`prepare_design_change\` session; the written-design session \`design-change-session:bacfc00e-4bfa-40fe-abc0-597138834a9e\` does not authorize code changes.

---

### Task 1: Open the implementation preflight and record its receipt

**Files:**
- Modify: \`docs/adr/0025-readable-3a-architecture-mapping.md\` after the implementation session is opened
- Create: the JSON receipt path emitted by the existing preflight command under \`.specforge/design-context/\`

**Interfaces:**
- Consumes: approved Spec \`docs/superpowers/specs/2026-08-15-3a-neighborhood-query-identity-repair-design.md\` and the exact Designer Scope.
- Produces: a \`DesignChangeSession\` receipt containing the session ID, Scope, read asset count, relationship digest, design-context digest, and reconciliation status for Tasks 2-6.

- [ ] **Step 1: Run the exact-Scope implementation preflight**

\`\`\`powershell
pnpm design-context:preflight -- --intent "Implement exact table-specific identities for both 3A architecture unit neighborhood MCP read paths" --affected "adr-readable-3a-architecture-mapping,proposal-readable-3a-architecture-mapping,ctx-readable-3a-architecture-mapping,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "approved-spec:docs/superpowers/specs/2026-08-15-3a-neighborhood-query-identity-repair-design.md,approved-plan:docs/superpowers/plans/2026-08-15-3a-neighborhood-query-identity-repair.md"
\`\`\`

Expected: the command returns an OPEN \`DesignChangeSession\` for \`com.huawei.celon.desiner\` with a non-empty design-context digest, matching Scope, all affected facts present, and reconciliation not BLOCKED. Stop before code changes if the receipt is missing, the Scope differs, an affected fact is absent, or reconciliation is blocked.

- [ ] **Step 2: Record the receipt in the ADR**

Add the exact session ID, read asset count, relationship digest, design-context digest, and receipt path to the ADR's evidence section. Do not invent values; copy them from the command output.

- [ ] **Step 3: Commit the preflight record**

\`\`\`powershell
git add docs/adr/0025-readable-3a-architecture-mapping.md .specforge/design-context
git commit -m "chore: open neighborhood query implementation session"
\`\`\`

Expected: one commit containing only the implementation-session evidence and receipt.

### Task 2: Add the failing repository regression test

**Files:**
- Modify: \`packages/knowledge-query/src/prisma-repository.test.ts\`
- Modify: \`packages/knowledge-query/src/prisma-repository.ts\`

**Interfaces:**
- Consumes: \`PrismaThreeAQueryRepository.listSameLayerDependencies(identity, assertionIds, limit)\`.
- Produces: a repository test that proves \`KnowledgeProjectionEdge\` receives Scope, generation, Baseline, endpoint filters, and no \`projectionManifestId\`.

- [ ] **Step 1: Write the failing test before changing production code**

Append this test to \`packages/knowledge-query/src/prisma-repository.test.ts\`:

\`\`\`ts
  it("does not send projectionManifestId to the generation-bound edge table", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaThreeAQueryRepository({ knowledgeProjectionEdge: { findMany } } as never);
    const identity = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: "manifest-1" };

    await repository.listSameLayerDependencies(identity, ["assertion-1", "assertion-2"], 25);

    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({
      ...scope,
      generationId: manifest.generationId,
      baselineId: manifest.baselineId,
      OR: [
        { sourceAssertionId: { in: ["assertion-1", "assertion-2"] }, targetAssertionId: { in: ["assertion-1", "assertion-2"] } }
      ]
    }));
    expect(where).not.toHaveProperty("projectionManifestId");
  });
\`\`\`

- [ ] **Step 2: Run the new test and confirm the schema-shape failure**

\`\`\`powershell
pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts -t "does not send projectionManifestId"
\`\`\`

Expected: FAIL because the current spread of \`identity\` includes \`projectionManifestId\` in the captured edge \`where\` object.

- [ ] **Step 3: Implement the minimal repository filter repair**

In \`listSameLayerDependencies\`, destructure the complete identity and build the edge filter explicitly:

\`\`\`ts
const { projectionManifestId: _projectionManifestId, ...edgeIdentity } = identity;
const rows = await this.prisma.knowledgeProjectionEdge.findMany({
  where: {
    ...edgeIdentity,
    OR: [{ sourceAssertionId: { in: assertionIds }, targetAssertionId: { in: assertionIds } }]
  },
  orderBy: [{ sourceAssertionId: "asc" }, { targetAssertionId: "asc" }, { relationCode: "asc" }, { relationshipIdentity: "asc" }],
  take: limit + 1
});
\`\`\`

Keep all other repository methods unchanged so architecture unit, member, and mapping projections retain the complete identity including \`projectionManifestId\`.

- [ ] **Step 4: Run the repository regression test**

\`\`\`powershell
pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts -t "does not send projectionManifestId"
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit the repository repair**

\`\`\`powershell
git add packages/knowledge-query/src/prisma-repository.ts packages/knowledge-query/src/prisma-repository.test.ts
git commit -m "fix: bind 3A edge queries to table identity"
\`\`\`

### Task 3: Add and implement direct MCP adapter identity-shape regression coverage

**Files:**
- Modify: \`apps/mcp-server/src/tools.test.ts\`
- Modify: \`apps/mcp-server/src/knowledge/architecture-map-adapter.ts\`

**Interfaces:**
- Consumes: \`get3aArchitectureUnitNeighborhood\` and its Prisma read client.
- Produces: explicit manifest and edge filters without \`projectionManifestId\`; projection unit/member/mapping filters remain manifest-bound.

- [ ] **Step 1: Extend the direct-adapter test with table-specific assertions**

In the existing neighborhood test, after the member filter assertion, capture the calls and assert:

\`\`\`ts
    const manifestWhere = persistence.prisma.projectionManifest.findFirst.mock.calls[0][0].where;
    expect(manifestWhere).toEqual(expect.objectContaining({
      applicationServiceId: input.identity.architectureScope.applicationServiceId,
      scopePath: input.identity.architectureScope.scopePath,
      generationId: input.identity.generationId,
      baselineId: input.identity.baselineId,
      id: input.identity.projectionManifestId,
      publishedAt: { not: null }
    }));
    expect(manifestWhere).not.toHaveProperty("projectionManifestId");

    const edgeWhere = persistence.prisma.knowledgeProjectionEdge.findMany.mock.calls[0][0].where;
    expect(edgeWhere).toEqual(expect.objectContaining({
      applicationServiceId: input.identity.architectureScope.applicationServiceId,
      scopePath: input.identity.architectureScope.scopePath,
      generationId: input.identity.generationId,
      baselineId: input.identity.baselineId,
      OR: expect.any(Array)
    }));
    expect(edgeWhere).not.toHaveProperty("projectionManifestId");
\`\`\`

Expected before the production repair: FAIL on the manifest assertion because the current \`where\` contains \`projectionManifestId\`.

- [ ] **Step 2: Run the direct-adapter test to confirm the failure**

\`\`\`powershell
pnpm exec vitest run apps/mcp-server/src/tools.test.ts -t "architecture unit neighborhood"
\`\`\`

Expected: FAIL only on the new table-specific field assertion.

- [ ] **Step 3: Build explicit filters in the adapter**

Replace the manifest read filter with:

\`\`\`ts
where: {
  ...scope,
  generationId: identity.generationId,
  baselineId: identity.baselineId,
  id: identity.projectionManifestId,
  publishedAt: { not: null }
}
\`\`\`

Before the edge read, derive the generation-bound identity:

\`\`\`ts
const { projectionManifestId: _projectionManifestId, ...edgeIdentity } = identity;
\`\`\`

Use \`where: { ...edgeIdentity, OR: [...] }\` for \`knowledgeProjectionEdge.findMany\`. Keep \`identity\` unchanged for unit, member, mapping, and traversal projection reads.

- [ ] **Step 4: Run the direct-adapter test**

\`\`\`powershell
pnpm exec vitest run apps/mcp-server/src/tools.test.ts -t "architecture unit neighborhood"
\`\`\`

Expected: PASS, including the existing exact-Scope mismatch test.

- [ ] **Step 5: Commit the adapter repair**

\`\`\`powershell
git add apps/mcp-server/src/knowledge/architecture-map-adapter.ts apps/mcp-server/src/tools.test.ts
git commit -m "fix: repair direct 3A neighborhood table filters"
\`\`\`

### Task 4: Replace the v5 verification workaround with both public MCP reads

**Files:**
- Modify: \`scripts/verify-designer-3a-v5.ts\`

**Interfaces:**
- Consumes: \`search_3a_architecture_map\`, \`get_3a_architecture_unit_neighborhood\`, and \`query_3a_architecture_unit_neighborhood\` over the local MCP client.
- Produces: a live verification result proving both public paths return the same 23 gateway members for v5.

- [ ] **Step 1: Remove the direct Prisma member-table fallback**

Delete the \`PrismaClient\` import, Prisma connection, and \`architectureUnitMemberProjection.findMany\` read. Keep the MCP map read to obtain the published identity and complete-map assertions.

- [ ] **Step 2: Call and compare both public neighborhood tools**

After reading the v5 map, call the direct adapter with:

\`\`\`ts
const directNeighborhood = await call("get_3a_architecture_unit_neighborhood", {
  identity: { architectureScope: scope, generationId: String(identity.generationId), baselineId, projectionManifestId },
  unitIdentity: "unit:sys:specforge-mcp-governance-gateway",
  direction: "both",
  depth: 3,
  budget: { maxUnitsPerLayer: 100, maxMappings: 100, maxPayloadBytes: 1_000_000, timeoutMs: 5000 }
});
\`\`\`

Call the shared query path with the same values in its flat input shape:

\`\`\`ts
const sharedNeighborhood = await call("query_3a_architecture_unit_neighborhood", {
  architectureScope: scope,
  generationId: String(identity.generationId),
  baselineId,
  projectionManifestId,
  unitIdentity: "unit:sys:specforge-mcp-governance-gateway",
  direction: "both",
  depth: 3,
  budget: { maxUnitsPerLayer: 100, maxMappings: 100, maxPayloadBytes: 1_000_000, timeoutMs: 5000 }
});
\`\`\`

Parse each response, fail if either is an MCP error, sort \`members\` by \`semanticIdentity\` then \`assertionId\`, assert both arrays have length 23, and assert their serialized member identities match exactly. Use the direct MCP result as the source for \`fixtureHits\`, \`deferredHits\`, and \`missingExpected\` checks. Print both tool statuses and the equality result in the JSON summary.

- [ ] **Step 3: Run the live v5 verifier**

\`\`\`powershell
pnpm exec tsx scripts/verify-designer-3a-v5.ts
\`\`\`

Expected: 4 units, 38 memberships, 3 mappings, gateway members 23, both neighborhood statuses \`READY\`, member equality \`true\`, \`unclassifiedCount=0\`, no fixture hits, no deferred hits, and exact Scope match.

- [ ] **Step 4: Commit the verification change**

\`\`\`powershell
git add scripts/verify-designer-3a-v5.ts
git commit -m "test: verify both 3A neighborhood MCP paths"
\`\`\`

### Task 5: Update repository facts and current TODO count

**Files:**
- Modify: \`docs/TODO.md\` item 7
- Modify: \`docs/evidence/designer-3a-v5-membership-expansion-evidence.md\`
- Modify: \`docs/adr/0025-readable-3a-architecture-mapping.md\`

**Interfaces:**
- Consumes: passing focused tests, type checks, and live v5 verifier output.
- Produces: repository records that distinguish the repaired implemented behavior, verified local behavior, and still-deferred enterprise-wide coverage.

- [ ] **Step 1: Update TODO item 7 from v4 to v5 counts**

Change the rationale from 4 units, 28 memberships, and 3 mappings to 4 units, 38 memberships, and 3 mappings. Keep the item deferred and retain the reason that remaining APIs, events, rules, data models, runtime facts, source-owner decisions, and ambiguous semantics require evidence-backed onboarding.

- [ ] **Step 2: Replace the evidence workaround statement**

Update \`docs/evidence/designer-3a-v5-membership-expansion-evidence.md\` so the verification record says both public MCP neighborhood paths were called and returned the same 23 gateway members. Remove the statement that direct Prisma read-back was used because the adapter path was unavailable.

- [ ] **Step 3: Append the repair decision and exact evidence to ADR-0025**

Record the identity-shape decision, the no-migration constraint, the implementation session ID, and exact results for:

\`\`\`text
pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/architecture-map.test.ts apps/mcp-server/src/tools.test.ts
pnpm --filter @specforge/knowledge-query typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm exec tsx scripts/verify-designer-3a-v5.ts
pnpm design-facts:sync
pnpm design-facts:check
git diff --check
\`\`\`

Do not mark the repair converged in the ADR until all commands and MCP readbacks pass.

- [ ] **Step 4: Commit repository fact updates**

\`\`\`powershell
git add docs/TODO.md docs/evidence/designer-3a-v5-membership-expansion-evidence.md docs/adr/0025-readable-3a-architecture-mapping.md
git commit -m "docs: record 3A neighborhood query repair evidence"
\`\`\`

### Task 6: Synchronize MCP facts, reconcile, and close the implementation session

**Files:**
- Modify: \`docs/adr/0025-readable-3a-architecture-mapping.md\` with final MCP receipts
- Modify: matching repository design-fact manifest only if the sync command reports a required source change

**Interfaces:**
- Consumes: the exact implementation session from Task 1 and all verification outputs from Tasks 2-5.
- Produces: synchronized ADR, Proposal, Context Pack, API/read-model assets, evidence assets, directional typed links, clean reconciliation, and a closed \`DesignChangeSession\`.

- [ ] **Step 1: Synchronize all matching facts through MCP**

\`\`\`powershell
pnpm design-facts:sync
\`\`\`

Expected: \`complete\`, with the exact Designer Scope used for the ADR, Proposal, Context Pack, API, read-model, evidence, and managed links. If MCP persistence fails, record \`MCP synchronization blocked\`, the failure reason, and retry trigger in the ADR and TODO; do not close the session as converged.

- [ ] **Step 2: Check repository/MCP reconciliation**

\`\`\`powershell
pnpm design-facts:check
\`\`\`

Expected: \`missing=[]\`, \`mismatched=[]\`, \`outOfScope=[]\`, and \`blocked=[]\` for the matching fact set. Verify IDs, exact Scope, bilingual fields, directional relationship types, and evidence references.

- [ ] **Step 3: Close the same implementation session with exact evidence**

\`\`\`powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session $implementationSessionId --status CONVERGED --evidence "focused-tests=PASS,typechecks=PASS,live-v5-neighborhood=both-paths-23-members-equal,design-facts-sync=complete,design-facts-check=clean,git-diff-check=PASS,no-schema-migration=true"
\`\`\`

Set \`$implementationSessionId\` to the exact session value returned by Task 1. Expected: the same session returns \`CONVERGED\`. If any evidence is unavailable, close as \`BLOCKED\` with the reason and retry trigger instead.

- [ ] **Step 4: Run final status and diff checks**

\`\`\`powershell
git diff --check
git status --short
git log --oneline -6
\`\`\`

Expected: no whitespace errors; only intentional commits plus the user's pre-existing \`outputs/\` and \`scripts/build-design-code-challenge-workbook.mjs\` untracked paths; no schema migration or generated data rewrite.

- [ ] **Step 5: Commit final governance receipts**

\`\`\`powershell
git add docs/adr/0025-readable-3a-architecture-mapping.md
git commit -m "chore: close 3A neighborhood query design session"
\`\`\`

Expected: final commit contains the closed-session evidence and no unrelated user files.

## Self-Review Checklist

- Spec coverage: Tasks 1-6 cover the table-specific identity decision, compatibility boundary, regression tests, v5 dual-path verification, TODO count, ADR/evidence updates, MCP synchronization, and session closure.
- Placeholder scan: the implementation session ID is explicitly assigned from the preflight receipt at execution time; no behavior or test step is left unspecified.
- Type consistency: the complete \`ArchitectureMapIdentity\` is retained for architecture projection reads; \`edgeIdentity\` contains Scope, generation, and Baseline; manifest uses Scope, generation, Baseline, \`id\`, and \`publishedAt\`.
- Scope safety: every MCP operation uses \`com.huawei.celon.desiner\` and the full scope path; no cross-Scope or implicit read is introduced.
- Acceptance: both public paths are exercised against real PostgreSQL-backed v5 data and must return the same 23 gateway members before the implementation session can close.
