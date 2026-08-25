import { describe, expect, it } from "vitest";
import { validateIntegrationContractV1 } from "./tools";

describe("validateIntegrationContractV1", () => {
  it("accepts a legacy contract without V1 fields", () => {
    expect(() => validateIntegrationContractV1({ sourceSystem: "a", targetSystem: "b", protocol: "MCP stdio" })).not.toThrow();
  });

  it("rejects a V1 contract missing stable identity fields", () => {
    expect(() => validateIntegrationContractV1({ integrationCallKey: "k" })).toThrow(/INTEGRATION_CONTRACT_V1_INCOMPLETE/);
  });

  it("rejects a normalized protocol without a locator", () => {
    expect(() =>
      validateIntegrationContractV1({
        integrationCallKey: "c->p:REST_API:POST /v1/x",
        consumerScopeId: "com.huawei.celon.desiner",
        targetKind: "SPEC_FORGE_SCOPE",
        protocolKind: "REST_API",
        lifecycle: "ACTIVE"
      })
    ).toThrow(/INTEGRATION_CONTRACT_LOCATOR_REQUIRED/);
  });

  it("rejects a resolved target missing provider binding details", () => {
    expect(() =>
      validateIntegrationContractV1({
        integrationCallKey: "c->p:REST_API:POST /v1/x",
        consumerScopeId: "com.huawei.celon.desiner",
        targetKind: "SPEC_FORGE_SCOPE",
        protocolKind: "REST_API",
        protocolLocator: "POST /v1/x",
        lifecycle: "ACTIVE",
        targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.celon.integrationgateway" }
      })
    ).toThrow(/INTEGRATION_CONTRACT_TARGET_INCOMPLETE/);
  });

  it("accepts a complete resolved V1 contract", () => {
    expect(() =>
      validateIntegrationContractV1({
        integrationCallKey: "c->p:MESSAGE_EVENT:CONSUME topic t",
        consumerScopeId: "com.huawei.celon.specstudio",
        targetKind: "SPEC_FORGE_SCOPE",
        protocolKind: "MESSAGE_EVENT",
        protocolLocator: "CONSUME topic celon.design.updated.v1",
        lifecycle: "ACTIVE",
        targetResolution: { status: "RESOLVED", providerScopeId: "com.huawei.celon.desiner", targetType: "event", targetId: "event-design-updated", revisionLabel: "v1" }
      })
    ).not.toThrow();
  });
});
