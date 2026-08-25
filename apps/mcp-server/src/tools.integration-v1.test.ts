import { describe, expect, it } from "vitest";
import { validateIntegrationContractV1 } from "./tools";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const resolved = {
  id: "integration-designer-gateway-publish", contractSchemaVersion: 1 as const, sourceSystem: "com.huawei.celon.desiner", targetSystem: "com.huawei.celon.integrationgateway",
  consumerScopeId: "com.huawei.celon.desiner", targetKind: "SPEC_FORGE_SCOPE", protocolKind: "REST_API", protocolLocator: "POST /v1/publish", lifecycle: "ACTIVE",
  integrationCallKey: "com.huawei.celon.desiner|SPEC_FORGE_SCOPE:com.huawei.celon.integrationgateway:api:api-publish|REST_API|POST /v1/publish",
  targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.celon.integrationgateway", targetType: "api", targetId: "api-publish", revisionLabel: "v3" }
};

describe("validateIntegrationContractV1", () => {
  it("recognizes a record without governed fields as legacy", () => {
    expect(validateIntegrationContractV1({ sourceSystem: "a", targetSystem: "b", protocol: "MCP stdio" }, scope)).toBeUndefined();
  });
  it("requires an explicit V1 marker", () => {
    const { contractSchemaVersion, ...unmarked } = resolved;
    expect(() => validateIntegrationContractV1(unmarked, scope)).toThrow("INTEGRATION_CONTRACT_V1_MARKER_REQUIRED");
  });
  it("rejects a consumer or source outside the exact owning scope", () => {
    expect(() => validateIntegrationContractV1({ ...resolved, consumerScopeId: "com.huawei.celon.policyhub" }, scope)).toThrow("INTEGRATION_CONTRACT_CONSUMER_SCOPE_MISMATCH");
    expect(() => validateIntegrationContractV1({ ...resolved, sourceSystem: "com.huawei.celon.policyhub" }, scope)).toThrow("INTEGRATION_CONTRACT_SOURCE_SCOPE_MISMATCH");
  });
  it("rejects invalid resolution tuples and non-canonical call keys", () => {
    expect(() => validateIntegrationContractV1({ ...resolved, targetKind: "EXTERNAL" }, scope)).toThrow("INTEGRATION_CONTRACT_RESOLUTION_TUPLE_INVALID");
    expect(() => validateIntegrationContractV1({ ...resolved, integrationCallKey: "human-friendly-key" }, scope)).toThrow("INTEGRATION_CONTRACT_CALL_KEY_MISMATCH");
  });
  it("accepts a complete resolved V1 contract and emits its query projection", () => {
    expect(validateIntegrationContractV1(resolved, scope)).toMatchObject({ integrationCallKey: resolved.integrationCallKey, integrationTargetBinding: "SPEC_FORGE_SCOPE:com.huawei.celon.integrationgateway:api:api-publish", integrationResolutionStatus: "RESOLVED" });
  });
});
