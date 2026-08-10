import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("defines exact-Scope 3A build, projection, and continuation storage", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const migration = await readFile("prisma/migrations/20260810_3a_navigation_read_model/migration.sql", "utf8");
  for (const model of ["ProjectionBuildJob", "KnowledgeProjectionNode", "KnowledgeProjectionEdge", "TraceContinuation"]) {
    expect(schema).toContain(`model ${model}`);
  }
  expect(schema).toContain('@@unique([applicationServiceId, scopePath, generationId, assertionId]');
  expect(schema).toContain('@@unique([applicationServiceId, scopePath, generationId, relationshipIdentity]');
  expect(migration).toContain('"ProjectionBuildJob_one_active_build_key"');
  expect(migration).toContain("WHERE status IN ('QUEUED', 'BUILDING')");
  for (const name of ["KnowledgeProjectionNode_search_idx", "KnowledgeProjectionEdge_source_idx", "KnowledgeProjectionEdge_target_idx", "TraceContinuation_expiry_idx"]) {
    expect(migration).toContain(`"${name}"`);
  }
});
