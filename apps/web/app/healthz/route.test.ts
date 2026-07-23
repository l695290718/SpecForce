import { describe, expect, it, vi } from "vitest";

const queryRawUnsafe = vi.hoisted(() => vi.fn());

vi.mock("../../lib/db", () => ({
  prisma: { $queryRawUnsafe: queryRawUnsafe }
}));

import { GET } from "./route";

describe("GET /healthz", () => {
  it("returns ok when PostgreSQL accepts a query", async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns unavailable when PostgreSQL rejects a query", async () => {
    queryRawUnsafe.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
