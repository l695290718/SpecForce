import { describe, expect, it } from "vitest";
import { HttpPolicy } from "../adapters/http-policy";

const response = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "application/json" }, ...init });

describe("HttpPolicy", () => {
  it("enforces HTTPS, host allowlist and private address rejection", async () => {
    const policy = new HttpPolicy({ allowedHosts: ["api.example.com"], lookupHost: async () => [{ address: "203.0.113.5", family: 4 }], fetchImpl: async () => response("{}") });
    await expect(policy.getText("http://api.example.com/openapi.json")).rejects.toThrow("HTTP_HTTPS_REQUIRED");
    await expect(policy.getText("https://other.example.com/openapi.json")).rejects.toThrow("HTTP_HOST_NOT_ALLOWED");
    const privatePolicy = new HttpPolicy({ allowedHosts: ["api.example.com"], lookupHost: async () => [{ address: "10.0.0.4", family: 4 }], fetchImpl: async () => response("{}") });
    await expect(privatePolicy.getText("https://api.example.com/openapi.json")).rejects.toThrow("HTTP_PRIVATE_ADDRESS_REJECTED");
  });

  it("bounds response bytes and redirects", async () => {
    const large = new HttpPolicy({ allowedHosts: ["api.example.com"], maxBytes: 2, lookupHost: async () => [{ address: "203.0.113.5", family: 4 }], fetchImpl: async () => response("123") });
    await expect(large.getText("https://api.example.com/openapi.json")).rejects.toThrow("HTTP_RESPONSE_TOO_LARGE");
  });
});
