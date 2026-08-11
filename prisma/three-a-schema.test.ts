import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("defines exact-Scope 3A build, projection, and continuation storage", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const migration = await readFile("prisma/migrations/20260810_3a_navigation_read_model/migration.sql", "utf8");
  const architectureUnitMigration = await readFile("prisma/migrations/20260812_readable_3a_architecture_units/migration.sql", "utf8");
  for (const model of ["ProjectionBuildJob", "KnowledgeProjectionNode", "KnowledgeProjectionEdge", "ArchitectureUnitProjection", "ArchitectureUnitMemberProjection", "ArchitectureUnitMappingProjection", "TraceContinuation"]) {
    expect(schema).toContain(`model ${model}`);
  }
  expect(schema).toContain('@@unique([applicationServiceId, scopePath, generationId, assertionId]');
  expect(schema).toContain('@@unique([applicationServiceId, scopePath, generationId, relationshipIdentity]');
  expect(migration).toContain('"ProjectionBuildJob_one_active_build_key"');
  expect(migration).toContain("WHERE status IN ('QUEUED', 'BUILDING')");
  for (const name of ["KnowledgeProjectionNode_search_idx", "KnowledgeProjectionEdge_source_idx", "KnowledgeProjectionEdge_target_idx", "TraceContinuation_expiry_idx"]) {
    expect(migration).toContain(`"${name}"`);
  }
  for (const name of ["ArchitectureUnitProjection_scope_generation_identity_key", "ArchitectureUnitMemberProjection_scope_gen_unit_assertion_key", "ArchitectureUnitMappingProjection_scope_generation_identity_key", "ArchitectureUnitMappingProjection_scope_source_idx", "ArchitectureUnitMappingProjection_scope_target_idx"]) {
    expect(architectureUnitMigration).toContain(`"${name}"`);
  }
  expect(architectureUnitMigration).toContain('"ArchitectureUnitProjection"');
  expect(architectureUnitMigration).toContain('"ArchitectureUnitMemberProjection"');
  expect(architectureUnitMigration).toContain('"ArchitectureUnitMappingProjection"');
});
