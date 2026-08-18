import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("relationship outbox terminal statuses", () => {
  it("allows archived history to stop blocking ordered claims and checkpoints", () => {
    const source = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
    expect(source).toContain("earlier.status NOT IN ('COMPLETED', 'ARCHIVED')");
    expect(source).toContain("incomplete.status NOT IN ('COMPLETED', 'ARCHIVED')");
  });
});
