import { describe, expect, it } from "vitest";
import { IdentityService } from "./service";

const now = new Date("2026-09-01T00:00:00.000Z");

describe("IdentityService control-plane reads", () => {
  it("returns owned agents with safe credential metadata only", async () => {
    const prisma = {
      agentIdentity: {
        findMany: async () => [{
          id: "agent-1", name: "Architect", status: "ACTIVE", createdAt: now,
          credentials: [{ id: "credential-1", agentId: "agent-1", status: "ACTIVE", expiresAt: new Date("2026-10-01T00:00:00.000Z"), revokedAt: null, createdAt: now, secretDigest: "must-not-leak", grantCeiling: [{ applicationServiceId: "service-a", operation: "knowledge:read" }] }]
        }]
      }
    } as any;
    const result = await new IdentityService(prisma, { pepper: "test-pepper" }).listOwnedAgents("user-1");
    expect(result).toEqual([expect.objectContaining({ id: "agent-1", credentials: [expect.objectContaining({ id: "credential-1", ceiling: [{ applicationServiceId: "service-a", operation: "knowledge:read" }] })] })]);
    expect(JSON.stringify(result)).not.toContain("secretDigest");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("returns deterministically ordered safe user grants", async () => {
    const prisma = {
      userAccount: {
        findMany: async () => [{ id: "user-1", login: "admin", displayName: "Admin", status: "ACTIVE", isAdministrator: true, passwordDigest: "must-not-leak", grants: [{ applicationServiceId: "service-a", operation: "knowledge:read" }, { applicationServiceId: "service-a", operation: "asset:read" }] }]
      }
    } as any;
    const result = await new IdentityService(prisma, { pepper: "test-pepper" }).listUsersWithGrants();
    expect(result[0]?.grants).toEqual([{ applicationServiceId: "service-a", operation: "asset:read" }, { applicationServiceId: "service-a", operation: "knowledge:read" }]);
    expect(JSON.stringify(result)).not.toContain("passwordDigest");
  });
});
