import { describe, expect, it } from "vitest";
import { applyClientLocale } from "../locale-client";

describe("client locale update", () => {
  it("writes the server-visible cookie before refreshing the route", () => {
    const events: string[] = [];

    applyClientLocale("zh", {
      writeCookie: (value) => events.push(`cookie:${value}`),
      writeStorage: (value) => events.push(`storage:${value}`),
      setDocumentLanguage: (value) => events.push(`lang:${value}`),
      refresh: () => events.push("refresh")
    });

    expect(events).toEqual([
      "cookie:specforge-locale=zh; Path=/; Max-Age=31536000; SameSite=Lax",
      "storage:zh",
      "lang:zh-CN",
      "refresh"
    ]);
  });
});
