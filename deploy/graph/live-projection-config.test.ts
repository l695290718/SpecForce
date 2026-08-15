import { describe, expect, it } from "vitest";
import { resolveGraphHealthConfig } from "./live-projection-config";

const verificationEnv = () => ({
  SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID: "com.huawei.celon.desiner.graph-verification",
  SPECFORGE_GRAPH_HEALTH_SCOPE_PATH: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification",
  SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID: "enterprise-1",
  SPECFORGE_GRAPH_HEALTH_DATABASE_URL: "postgres://test",
  SPECFORGE_GRAPH_LIVE_RUN_ID: "run-1"
});

describe("graph verification configuration", () => {
  it("fails closed when required configuration is absent", () => { expect(() => resolveGraphHealthConfig({ DATABASE_URL: "postgres://test" })).toThrow("GRAPH_HEALTH_APPLICATION_SERVICE_REQUIRED"); });
  it("rejects the Designer Scope and product-purpose scopes", () => { expect(() => resolveGraphHealthConfig({ ...verificationEnv(), SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID: "com.huawei.celon.desiner" })).toThrow("GRAPH_HEALTH_VERIFICATION_SCOPE_REQUIRED"); });
  it("rejects a forged Scope path and unsafe run id", () => {
    expect(() => resolveGraphHealthConfig({ ...verificationEnv(), SPECFORGE_GRAPH_HEALTH_SCOPE_PATH: "forged/path" })).toThrow("GRAPH_HEALTH_SCOPE_MISMATCH");
    expect(() => resolveGraphHealthConfig({ ...verificationEnv(), SPECFORGE_GRAPH_LIVE_RUN_ID: "manual" })).toThrow("GRAPH_HEALTH_RUN_ID_INVALID");
  });
  it("resolves an exact verification Scope", () => { expect(resolveGraphHealthConfig(verificationEnv())).toMatchObject({ applicationServiceId: "com.huawei.celon.desiner.graph-verification", liveRunId: "run-1" }); });
});
