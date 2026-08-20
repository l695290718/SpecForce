import { describe, expect, it } from "vitest";
import { ErTextureCache } from "./er-texture-cache";

describe("er texture cache", () => {
  it("evicts least recently used textures", () => {
    const cache = new ErTextureCache<string>(2);
    cache.set("a", "A"); cache.set("b", "B");
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.keys()).toEqual(["a", "c"]);
  });

  it("disposes resources on clear", () => {
    const disposed: string[] = [];
    const cache = new ErTextureCache<string>(2);
    cache.set("a", "A"); cache.set("b", "B"); cache.clear((value) => disposed.push(value));
    expect(disposed).toEqual(["A", "B"]);
    expect(cache.size).toBe(0);
  });
});
