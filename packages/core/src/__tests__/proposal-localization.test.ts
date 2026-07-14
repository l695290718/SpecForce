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
      name: "中文方案",
      title: "中文标题",
      description: "中文描述",
      background: "中文背景",
      goal: "中文目标",
      nonGoal: "中文非目标",
      scope: "中文范围",
      specChanges: ["中文任务"],
      risks: ["中文风险"],
      rolloutPlan: "中文发布计划",
      rollbackPlan: "中文回滚计划"
    }
  }
};

describe("localizeProposal", () => {
  it("uses localized fields for the selected locale and falls back to base fields", () => {
    const localized = localizeProposal(baseProposal, "zh");

    expect(localized.title).toBe("中文标题");
    expect(localized.background).toBe("中文背景");
    expect(localized.description).toBe("中文描述");
    expect(localized.specChanges).toEqual(["中文任务"]);
    expect(localized.risks).toEqual(["中文风险"]);
  });

  it("returns base proposal when locale content is missing", () => {
    expect(localizeProposal(baseProposal, "en")).toEqual(baseProposal);
  });

  it("uses legacy English overlays when canonical proposal fields are empty", () => {
    const legacyProposal: Proposal = {
      ...baseProposal,
      name: "",
      title: "",
      description: "",
      background: "",
      goal: "",
      nonGoal: "",
      scope: "",
      specChanges: [],
      risks: [],
      rolloutPlan: "",
      rollbackPlan: "",
      localizedContent: {
        en: {
          name: "Legacy name",
          title: "Legacy title",
          description: "Legacy description",
          background: "Legacy background",
          goal: "Legacy goal",
          nonGoal: "Legacy non-goal",
          scope: "Legacy scope",
          specChanges: ["Legacy task"],
          risks: ["Legacy risk"],
          rolloutPlan: "Legacy rollout",
          rollbackPlan: "Legacy rollback"
        },
        zh: baseProposal.localizedContent?.zh
      }
    };

    const localized = localizeProposal(legacyProposal, "en");

    expect(localized.title).toBe("Legacy title");
    expect(localized.background).toBe("Legacy background");
    expect(localized.specChanges).toEqual(["Legacy task"]);
  });
});
