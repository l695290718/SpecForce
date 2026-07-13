import { afterEach, describe, expect, it } from "vitest";
import { getStore, localizeGovernanceResult, runGovernanceChecks, type GovernanceCheckResult, type StateMachine } from "../index";

const stateMachines = getStore().stateMachines;
const now = "2026-07-13T00:00:00.000Z";

function createGovernanceResult(overrides: Partial<GovernanceCheckResult> = {}): GovernanceCheckResult {
  return {
    assetType: "api",
    assetId: "api-create-refund",
    ruleCode: "API_AUTH",
    ruleName: "API must declare authType",
    severity: "error",
    status: "fail",
    reason: "Missing authType leaves the caller trust boundary undefined.",
    suggestion: "Declare service token, user scope, or an internal trust boundary.",
    ...overrides
  };
}

function createLocalizedStateMachine(id: string): StateMachine {
  return {
    id,
    name: "Refund lifecycle",
    description: "Tracks refund state changes.",
    domainId: "domain-order",
    states: ["REQUESTED", "SUCCEEDED"],
    transitions: [
      {
        from: "REQUESTED",
        to: "SUCCEEDED",
        trigger: "RefundSucceeded",
        action: "mark refund succeeded",
        idempotent: true
      }
    ],
    initialState: "REQUESTED",
    terminalStates: ["SUCCEEDED"],
    events: ["RefundSucceeded"],
    guards: ["refund requested"],
    actions: ["mark refund succeeded"],
    createdAt: now,
    updatedAt: now,
    localizedContent: {
      zh: {
        name: "退款状态机",
        description: "跟踪退款状态变化。",
        states: {
          REQUESTED: "已申请",
          SUCCEEDED: "已成功"
        },
        events: {
          RefundSucceeded: "退款成功"
        },
        guards: ["退款已申请"],
        actions: ["标记退款成功"],
        transitions: {
          "REQUESTED::SUCCEEDED::RefundSucceeded": {
            action: "标记退款成功"
          }
        }
      }
    }
  };
}

afterEach(() => {
  stateMachines.splice(
    0,
    stateMachines.length,
    ...stateMachines.filter((stateMachine) => !stateMachine.id.startsWith("sm-governance-localization"))
  );
});

describe("governance localization", () => {
  it("renders static built-in governance messages in Chinese", () => {
    const localized = localizeGovernanceResult(createGovernanceResult(), "zh");

    expect(localized.ruleName).toBe("API 必须声明 authType");
    expect(localized.reason).toBe("缺少鉴权模型会让调用边界不可治理。");
    expect(localized.suggestion).toBe("声明 service token、user scope 或内部信任边界。");
  });

  it("renders dynamic built-in governance messages in English and Chinese", () => {
    const result = createGovernanceResult({
      assetType: "event",
      assetId: "event-missing-envelope",
      ruleCode: "EVENT_ENVELOPE",
      ruleName: "Event schema must include standard envelope fields",
      reason: "Missing fields: traceId, timestamp",
      suggestion: "Add eventId, eventType, version, timestamp, and traceId.",
      messageParams: {
        missingFields: ["traceId", "timestamp"]
      }
    });

    expect(localizeGovernanceResult(result, "en")).toMatchObject({
      ruleName: "Event schema must include standard envelope fields",
      reason: "Missing fields: traceId, timestamp",
      suggestion: "Add eventId, eventType, version, timestamp, and traceId."
    });

    expect(localizeGovernanceResult(result, "zh")).toMatchObject({
      ruleName: "Event schema必须包含标准信封字段",
      reason: "缺少字段：traceId, timestamp",
      suggestion: "补齐 eventId、eventType、version、timestamp、traceId。"
    });
  });

  it("falls back to canonical English when the rule code is unknown", () => {
    const result = createGovernanceResult({
      ruleCode: "CUSTOM_UNKNOWN_RULE",
      ruleName: "Custom rule",
      reason: "Keep the canonical reason.",
      suggestion: "Keep the canonical suggestion."
    });

    expect(localizeGovernanceResult(result, "zh")).toEqual(result);
  });

  it("adds bilingual completeness checks for asset types without other configured rules", async () => {
    stateMachines.push(createLocalizedStateMachine("sm-governance-localization-pass"));

    const results = await runGovernanceChecks("stateMachine", "sm-governance-localization-pass");

    expect(results.map((result) => result.ruleCode)).toEqual(
      expect.arrayContaining(["ASSET_BILINGUAL_COMPLETENESS", "GOVERNANCE_NOT_CONFIGURED"])
    );
    expect(results.find((result) => result.ruleCode === "ASSET_BILINGUAL_COMPLETENESS")).toMatchObject({
      severity: "error",
      status: "pass"
    });
  });

  it("fails bilingual completeness checks with the invalid path and keeps other checks running", async () => {
    const invalidStateMachine = createLocalizedStateMachine("sm-governance-localization-fail");
    invalidStateMachine.localizedContent = {
      zh: {
        ...invalidStateMachine.localizedContent?.zh,
        transitions: undefined
      }
    } as unknown as StateMachine["localizedContent"];
    stateMachines.push(invalidStateMachine);

    const results = await runGovernanceChecks("stateMachine", "sm-governance-localization-fail");

    expect(results.find((result) => result.ruleCode === "ASSET_BILINGUAL_COMPLETENESS")).toMatchObject({
      severity: "error",
      status: "fail",
      reason: "ASSET_TRANSLATION_REQUIRED at localizedContent.zh.transitions"
    });
    expect(results.find((result) => result.ruleCode === "GOVERNANCE_NOT_CONFIGURED")).toMatchObject({
      status: "pass"
    });
  });
});
