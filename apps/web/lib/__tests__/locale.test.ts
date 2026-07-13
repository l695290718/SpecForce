import { describe, expect, it } from "vitest";
import { localeCookieValue, localeFromCookie, withQueryParam } from "../locale";

describe("request locale", () => {
  it("accepts supported cookie values", () => {
    expect(localeFromCookie("zh")).toBe("zh");
    expect(localeFromCookie("en")).toBe("en");
  });

  it("falls back to canonical English for missing or invalid cookies", () => {
    expect(localeFromCookie(undefined)).toBe("en");
    expect(localeFromCookie("fr")).toBe("en");
  });

  it("serializes a one-year locale cookie visible to server requests", () => {
    expect(localeCookieValue("zh")).toBe("specforge-locale=zh; Path=/; Max-Age=31536000; SameSite=Lax");
  });
});

describe("query preservation", () => {
  it("adds or replaces one query parameter without dropping the rest or the hash", () => {
    expect(withQueryParam("/assets/apis?scope=service-a&q=write#results", "scope", "service-b"))
      .toBe("/assets/apis?scope=service-b&q=write#results");
    expect(withQueryParam("/assets/apis?q=write", "scope", "service-a"))
      .toBe("/assets/apis?q=write&scope=service-a");
  });
});
