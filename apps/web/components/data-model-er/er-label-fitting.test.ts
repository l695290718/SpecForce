import { describe, expect, it } from "vitest";
import { fitErLabel, getErHeaderLabelWidths } from "./er-label-fitting";

describe("ER label fitting", () => {
  it("keeps short labels unchanged and bounds long labels", () => {
    expect(fitErLabel("Orders", 12)).toBe("Orders");
    expect(fitErLabel("data-specforge-ai-generation.GeneratedDraft", 20)).toBe("data-specforge-ai..." );
    expect(Array.from(fitErLabel("非常长的实体名称", 5)).length).toBeLessThanOrEqual(5);
  });

  it("derives stable header budgets from the card width", () => {
    expect(getErHeaderLabelWidths(260)).toEqual({ title: 33, subtitle: 39 });
    expect(getErHeaderLabelWidths(40).title).toBeGreaterThanOrEqual(8);
  });
});
