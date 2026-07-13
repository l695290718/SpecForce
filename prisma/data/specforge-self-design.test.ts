import { describe, expect, it } from "vitest";
import { architectureChangeProposals } from "./specforge-self-design";

const expectedIds = [
  "proposal-strict-application-service-isolation",
  "proposal-agent-service-workspace",
  "proposal-mcp-native-scoped-seeding"
];

describe("SpecForge architecture change proposals", () => {
  it("defines the three implemented architecture changes", () => {
    expect(architectureChangeProposals.map((proposal) => proposal.id)).toEqual(expectedIds);
    expect(architectureChangeProposals.every((proposal) => proposal.status === "implemented")).toBe(true);
  });

  it("provides complete Chinese and English proposal content", () => {
    for (const proposal of architectureChangeProposals) {
      for (const locale of ["zh", "en"] as const) {
        const content = proposal.localizedContent?.[locale];
        expect(content?.title).toBeTruthy();
        expect(content?.description).toBeTruthy();
        expect(content?.background).toBeTruthy();
        expect(content?.goal).toBeTruthy();
        expect(content?.nonGoal).toBeTruthy();
        expect(content?.scope).toBeTruthy();
        expect(content?.specChanges?.length).toBeGreaterThan(0);
        expect(content?.risks?.length).toBeGreaterThan(0);
        expect(content?.rolloutPlan).toBeTruthy();
        expect(content?.rollbackPlan).toBeTruthy();
      }
    }
  });
});
