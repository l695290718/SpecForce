import { describe, expect, it } from "vitest";
import { ErPixiRenderer, canUseWebgl } from "./er-pixi-renderer";

describe("er pixi renderer", () => {
  it("reports the semantic fallback in a non-DOM test environment", () => {
    expect(canUseWebgl()).toBe(false);
    const renderer = new ErPixiRenderer();
    expect(renderer.getStatus().ready).toBe(false);
  });
});
