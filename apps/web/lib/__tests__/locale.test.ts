import { describe, expect, it } from "vitest";
import { getApiRequestLocale, localeFromCookie, withQueryParam, withRequestLocale, withSearchParams } from "../locale";

describe("request locale", () => {
  it("accepts supported cookie values", () => {
    expect(localeFromCookie("zh")).toBe("zh");
    expect(localeFromCookie("en")).toBe("en");
  });

  it("falls back to canonical English for missing or invalid cookies", () => {
    expect(localeFromCookie(undefined)).toBe("en");
    expect(localeFromCookie("fr")).toBe("en");
  });

  it("uses a validated explicit API locale before the cookie", () => {
    const request = new Request("http://localhost/api/assets/apis?locale=zh", {
      headers: { cookie: "other=value; specforge-locale=en" }
    });

    expect(getApiRequestLocale(request)).toBe("zh");
  });

  it("falls back from an invalid explicit API locale to the request cookie", () => {
    const request = new Request("http://localhost/api/assets/apis?locale=fr", {
      headers: { cookie: "specforge-locale=zh" }
    });

    expect(getApiRequestLocale(request)).toBe("zh");
  });

  it("passes the resolved locale into an API reader boundary", async () => {
    const request = new Request("http://localhost/api/proposals?locale=zh");

    await expect(withRequestLocale(request, async (locale) => `reader:${locale}`)).resolves.toBe("reader:zh");
  });
});

describe("query preservation", () => {
  it("preserves empty query values in restricted route redirects", () => {
    expect(withSearchParams("/assets/apis", { scope: "service-a", flag: "" }))
      .toBe("/assets/apis?scope=service-a&flag=");
  });

  it("adds or replaces one query parameter without dropping the rest or the hash", () => {
    expect(withQueryParam("/assets/apis?scope=service-a&q=write#results", "scope", "service-b"))
      .toBe("/assets/apis?scope=service-b&q=write#results");
    expect(withQueryParam("/assets/apis?q=write", "scope", "service-a"))
      .toBe("/assets/apis?q=write&scope=service-a");
  });
});
