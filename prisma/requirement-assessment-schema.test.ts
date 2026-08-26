import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("./migrations/20260826_requirement_assessment_center/migration.sql", import.meta.url), "utf8");

describe("requirement assessment persistence contract", () => {
  it("defines all authoritative records with exact-Scope indexes", () => {
    for (const model of [
      "RequirementBrief",
      "RequirementAssessmentRun",
      "AssessmentEvidenceSnapshot",
      "RequirementAssessment",
      "RequirementAssessmentTask",
      "ModelProfile",
      "AgentExecutionProfile",
      "AssessmentExecutionActual"
    ]) {
      expect(schema).toContain(`model ${model}`);
      expect(migration).toContain(`CREATE TABLE \"${model}\"`);
      expect(migration).toContain(`\"${model}_scope_id_key\"`);
    }
  });

  it("keeps lifecycle, lease, and digest lookups bounded by both Scope dimensions", () => {
    expect(schema).toContain("@@index([applicationServiceId, scopePath, status, createdAt]");
    expect(schema).toContain("@@index([applicationServiceId, scopePath, leaseExpiresAt]");
    expect(schema).toContain("@@index([applicationServiceId, scopePath, contentDigest]");
    expect(migration).not.toMatch(/FOREIGN KEY.*(applicationServiceId|scopePath)/s);
  });
});
