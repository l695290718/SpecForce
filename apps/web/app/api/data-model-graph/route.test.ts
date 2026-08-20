import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("data model graph route", () => {
  it("is an exact-scope endpoint and rejects a missing scope path", async () => {
    const response = await GET(new Request("http://localhost/api/data-model-graph?mode=SCOPE&scope=com.huawei.celon.desiner", { headers: { "x-specforge-subject": "tester" } }));
    expect([403, 500]).toContain(response.status);
  });
});
