import { describe, expect, it } from "vitest";
import { localizeProposal, type Proposal } from "../index";

const baseProposal: Proposal = {
  id: "proposal-test",
  name: "Base proposal",
  title: "Base title",
  description: "Base description",
  background: "Base background",
  goal: "Base goal",
  nonGoal: "Base non-goal",
  scope: "Base scope",
  impactedAssets: [],
  specChanges: ["Base task"],
  risks: ["Base risk"],
  rolloutPlan: "Base rollout",
  rollbackPlan: "Base rollback",
  status: "approved",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  localizedContent: {
    zh: {
      title: "中文标题",
      background: "中文背景",
      specChanges: ["中文任务"]
    }
  }
};

describe("localizeProposal", () => {
  it("uses localized fields for the selected locale and falls back to base fields", () => {
    const localized = localizeProposal(baseProposal, "zh");

    expect(localized.title).toBe("中文标题");
    expect(localized.background).toBe("中文背景");
    expect(localized.description).toBe("Base description");
    expect(localized.specChanges).toEqual(["中文任务"]);
    expect(localized.risks).toEqual(["Base risk"]);
  });

  it("returns base proposal when locale content is missing", () => {
    expect(localizeProposal(baseProposal, "en")).toEqual(baseProposal);
  });
});
