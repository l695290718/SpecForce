import { describe, expect, it } from "vitest";
import { estimateTextWidthPx, fitErLabel, fitErLabelToWidth, getErHeaderLabelWidths } from "./er-label-fitting";

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

  it("estimates CJK glyphs at full em and latin glyphs narrower", () => {
    expect(estimateTextWidthPx("订单", 12)).toBe(24);
    expect(estimateTextWidthPx("Order", 10)).toBeCloseTo(29, 0);
  });

  it("fits long labels to a pixel budget without overflowing the card", () => {
    const fitted = fitErLabelToWidth("data-specforge-asset-graph.AssetGraphNode", 256, 14);
    expect(estimateTextWidthPx(fitted, 14)).toBeLessThanOrEqual(256);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitErLabelToWidth("短名", 256, 14)).toBe("短名");
    const cjkFitted = fitErLabelToWidth("资产图节点实体超长显示名称测试", 120, 14);
    expect(estimateTextWidthPx(cjkFitted, 14)).toBeLessThanOrEqual(120);
  });
});
