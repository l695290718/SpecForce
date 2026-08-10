import { describe, expect, it } from "vitest";

const enabled = process.env.SPECFORGE_3A_INTEGRATION === "1";

describe.skipIf(!enabled)("3A projection integration gate", () => {
  it("requires the canonical PostgreSQL integration environment", () => {
    expect(process.env.DATABASE_URL, "DATABASE_URL must target the canonical PostgreSQL integration database").toBeTruthy();
    expect(process.env.SPECFORGE_3A_INTEGRATION, "SPECFORGE_3A_INTEGRATION=1 enables the destructive fixture gate").toBe("1");
  });
});
