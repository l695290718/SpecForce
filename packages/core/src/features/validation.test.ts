import { describe, expect, it } from "vitest";
import {
  assertValidFeatureAsset,
  assetCollections,
  localizeAsset,
  type FunctionalFeature,
  type ServiceFeature
} from "../index";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const now = "2026-09-03T00:00:00.000Z";

const serviceFeature: ServiceFeature = {
  id: "sf-design-governance",
  name: "Govern design facts",
  description: "Keeps design facts queryable and governed.",
  lifecycleStatus: "ACTIVE",
  owner: "SpecForge",
  tags: ["governance"],
  actors: ["Architect"],
  scenario: "An architect governs an application-service design.",
  valueOutcome: "Current design knowledge is available to authorized agents.",
  benefitHypothesis: "Governed facts reduce design-to-code drift.",
  serviceBoundary: ["Does not modify source code directly."],
  acceptanceCriteria: ["Authorized agents can retrieve current facts."],
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: { zh: {
    name: "治理设计事实",
    description: "保持设计事实可查询且受治理。",
    actors: ["架构师"],
    scenario: "架构师治理应用服务设计。",
    valueOutcome: "授权智能体可以获得当前设计知识。",
    benefitHypothesis: "受治理的事实可以减少设计与代码漂移。",
    serviceBoundary: ["不直接修改源代码。"],
    acceptanceCriteria: ["授权智能体可以读取当前事实。"]
  } }
};

const functionalFeature: FunctionalFeature = {
  id: "ff-read-system-knowledge",
  name: "Read bounded system knowledge",
  description: "Returns current facts after readiness evaluation.",
  lifecycleStatus: "ACTIVE",
  owner: "SpecForge",
  tags: ["knowledge"],
  trigger: "An authorized agent requests system knowledge.",
  observableBehavior: "The system returns a bounded versioned result.",
  preconditions: ["Readiness has passed."],
  postconditions: ["The result retains Scope and provenance."],
  exceptionBehaviors: ["Denied Scope returns no asset identities."],
  acceptanceCriteria: ["Results never cross the exact Scope."],
  createdAt: now,
  updatedAt: now,
  architectureScope: scope,
  localizedContent: { zh: {
    name: "读取有界系统知识",
    description: "就绪评估后返回当前事实。",
    trigger: "授权智能体请求系统知识。",
    observableBehavior: "系统返回有边界且带版本的结果。",
    preconditions: ["就绪评估已通过。"],
    postconditions: ["结果保留 Scope 和来源。"],
    exceptionBehaviors: ["Scope 被拒绝时不返回资产身份。"],
    acceptanceCriteria: ["结果绝不跨越精确 Scope。"]
  } }
};

describe("Feature assets", () => {
  it("validates both Feature kinds and repository collections", () => {
    expect(() => assertValidFeatureAsset("serviceFeature", serviceFeature)).not.toThrow();
    expect(() => assertValidFeatureAsset("functionalFeature", functionalFeature)).not.toThrow();
    expect(assetCollections.serviceFeature).toBe("serviceFeatures");
    expect(assetCollections.functionalFeature).toBe("functionalFeatures");
  });

  it("applies complete Chinese overlays", () => {
    expect(localizeAsset("serviceFeature", serviceFeature, "zh").valueOutcome).toBe("授权智能体可以获得当前设计知识。");
    expect(localizeAsset("functionalFeature", functionalFeature, "zh").observableBehavior).toBe("系统返回有边界且带版本的结果。");
  });

  it("rejects an incomplete human-facing translation", () => {
    const invalid = structuredClone(serviceFeature);
    invalid.localizedContent!.zh!.valueOutcome = "";
    expect(() => assertValidFeatureAsset("serviceFeature", invalid)).toThrowError(/FEATURE_LOCALIZATION_INVALID/);
  });

  it("rejects missing canonical acceptance criteria", () => {
    expect(() => assertValidFeatureAsset("functionalFeature", { ...functionalFeature, acceptanceCriteria: [] })).toThrowError(
      /FEATURE_CANONICAL_CONTENT_REQUIRED/
    );
  });
});
