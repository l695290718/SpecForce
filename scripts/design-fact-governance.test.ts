import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("requires dual-record ADR governance", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  expect(agents).toContain("MCP synchronization blocked");
  expect(agents).toContain("English canonical");
  expect(agents).toContain("docs/adr/");
});
