import { getAsset, getStore } from "../repository";
import type { ApiContract, AssetType, BusinessRule, DataModel, EventContract, GovernanceCheckResult, Proposal } from "../types";

function result(
  assetType: AssetType,
  assetId: string,
  ruleCode: string,
  ruleName: string,
  severity: "info" | "warning" | "error",
  passed: boolean,
  reason: string,
  suggestion: string
): GovernanceCheckResult {
  return { assetType, assetId, ruleCode, ruleName, severity, status: passed ? "pass" : "fail", reason, suggestion };
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && `${value}`.trim().length > 0;
}

function checkApi(api: ApiContract): GovernanceCheckResult[] {
  const writeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(api.method);
  return [
    result("api", api.id, "API_IDEMPOTENCY", "写接口必须声明 idempotency", "error", !writeMethod || hasValue(api.idempotency), "写接口缺少幂等声明会导致重复扣款或重复退款。", "为请求体或请求头定义稳定 idempotencyKey，并声明重复请求响应策略。"),
    result("api", api.id, "API_AUTH", "API 必须声明 authType", "error", hasValue(api.authType), "缺少鉴权模型会让调用边界不可治理。", "声明 service token、user scope 或内部信任边界。"),
    result("api", api.id, "API_ERROR_CODES", "API 必须声明 errorCodes", "warning", api.errorCodes.length > 0, "调用方无法稳定处理业务异常。", "列出可机器处理的错误码和语义。"),
    result("api", api.id, "API_COMPATIBILITY", "对外 API 必须声明 compatibilityPolicy", "warning", api.exposure !== "external" || hasValue(api.compatibilityPolicy), "对外契约缺少兼容策略会放大破坏性变更风险。", "声明新增、废弃、删除字段的版本策略。")
  ];
}

function checkEvent(event: EventContract): GovernanceCheckResult[] {
  const requiredFields = ["eventId", "eventType", "version", "timestamp", "traceId"];
  const missing = requiredFields.filter((field) => !(field in event.schema));
  return [
    result("event", event.id, "EVENT_ENVELOPE", "Event schema 必须包含标准信封字段", "error", missing.length === 0, `缺少字段：${missing.join(", ") || "无"}`, "补齐 eventId、eventType、version、timestamp、traceId。"),
    result("event", event.id, "EVENT_PRODUCER_CONSUMERS", "Event 必须声明 producer 和 consumers", "error", hasValue(event.producer) && event.consumers.length > 0, "生产者或消费者为空会影响影响分析。", "声明事件生产系统和至少一个消费系统。"),
    result("event", event.id, "EVENT_RETRY", "Event 必须声明 retryPolicy", "warning", hasValue(event.retryPolicy), "缺少重试策略会让投递故障不可恢复。", "声明重试窗口、退避策略和 DLQ 策略。"),
    result("event", event.id, "EVENT_COMPATIBILITY", "Event 必须声明 compatibilityPolicy", "warning", hasValue(event.compatibilityPolicy), "事件契约缺少演进规则。", "声明 schema 演进、字段废弃和版本策略。")
  ];
}

function checkDataModel(model: DataModel): GovernanceCheckResult[] {
  const sensitiveWithoutClassification = model.fields.filter((field) => field.sensitiveLevel && field.sensitiveLevel !== "none" && !field.classification);
  const amountWithoutUnit = model.fields.filter((field) => /amount|price|fee|balance/i.test(field.fieldName) && !/unit=|cents|yuan|currency/i.test(`${field.constraint ?? ""} ${field.meaning ?? ""}`));
  const statusWithoutState = model.fields.filter((field) => /status|state/i.test(field.fieldName) && !/enum|状态机|state/i.test(`${field.constraint ?? ""} ${field.meaning ?? ""}`));
  const physicalMissingMeaning = model.modelType === "physical" ? model.fields.filter((field) => !field.meaning) : [];
  return [
    result("dataModel", model.id, "DATA_SENSITIVE_CLASSIFICATION", "敏感字段必须声明 classification", "error", sensitiveWithoutClassification.length === 0, `未分类敏感字段：${sensitiveWithoutClassification.map((field) => field.fieldName).join(", ") || "无"}`, "为敏感字段补充 classification。"),
    result("dataModel", model.id, "DATA_AMOUNT_UNIT", "金额字段必须声明单位或约束", "error", amountWithoutUnit.length === 0, `缺少金额单位字段：${amountWithoutUnit.map((field) => field.fieldName).join(", ") || "无"}`, "在 meaning 或 constraint 中声明 cents/yuan/currency 等单位。"),
    result("dataModel", model.id, "DATA_STATUS_STATE", "状态字段必须关联状态机或枚举说明", "warning", statusWithoutState.length === 0, `缺少状态说明字段：${statusWithoutState.map((field) => field.fieldName).join(", ") || "无"}`, "关联状态机或枚举定义。"),
    result("dataModel", model.id, "DATA_PHYSICAL_MEANING", "物理模型字段必须有 meaning", "warning", physicalMissingMeaning.length === 0, `缺少 meaning 字段：${physicalMissingMeaning.map((field) => field.fieldName).join(", ") || "无"}`, "为物理字段补充业务含义。")
  ];
}

function checkBusinessRule(rule: BusinessRule): GovernanceCheckResult[] {
  return [
    result("businessRule", rule.id, "RULE_HIGH_EXAMPLES", "高优先级业务规则必须有 examples", "warning", rule.severity !== "high" || rule.examples.length > 0, "高优先级规则缺少示例会让实现容易误解。", "补充至少一个正例或反例。"),
    result("businessRule", rule.id, "RULE_VALIDATION_CONDITION", "validation 类型规则必须有 condition", "error", rule.ruleType !== "validation" || hasValue(rule.condition), "校验规则缺少条件表达式。", "补充可执行或可阅读的 condition。"),
    result("businessRule", rule.id, "RULE_PERMISSION_SCOPE", "permission 类型规则必须有关联角色或权限说明", "error", rule.ruleType !== "permission" || /role|permission|scope|角色|权限/.test(`${rule.condition ?? ""} ${rule.description}`), "权限规则缺少角色或权限边界。", "补充角色、权限点或 scope。")
  ];
}

function checkProposal(proposal: Proposal): GovernanceCheckResult[] {
  const risky = proposal.risks.some((risk) => /高风险|high/i.test(risk));
  const touchesApiOrEvent = proposal.impactedAssets.some((asset) => asset.type === "api" || asset.type === "event");
  const hasContextPack = getStore().contextPacks.some((pack) => pack.proposalId === proposal.id);
  return [
    result("proposal", proposal.id, "PROPOSAL_GOALS", "Proposal 必须声明 goal 和 nonGoal", "error", hasValue(proposal.goal) && hasValue(proposal.nonGoal), "目标或不做范围为空会导致范围漂移。", "补充 goal 与 nonGoal。"),
    result("proposal", proposal.id, "PROPOSAL_IMPACTED_ASSETS", "Proposal 必须声明 impactedAssets", "error", proposal.impactedAssets.length > 0, "缺少影响资产无法做影响分析。", "选择受影响的设计资产。"),
    result("proposal", proposal.id, "PROPOSAL_ROLLBACK", "高风险 Proposal 必须声明 rollbackPlan", "error", !risky || hasValue(proposal.rollbackPlan), "高风险变更缺少回滚策略。", "补充关闭入口、数据恢复或补偿方案。"),
    result("proposal", proposal.id, "PROPOSAL_CONTEXT_PACK", "涉及 API 或 Event 变更时必须生成 Context Pack", "warning", !touchesApiOrEvent || hasContextPack, "涉及契约变更但未生成 Agent Context Pack。", "生成 Context Pack 并纳入实现指令。")
  ];
}

export async function runGovernanceChecks(assetType: string, assetId: string): Promise<GovernanceCheckResult[]> {
  switch (assetType as AssetType) {
    case "api":
      return checkApi(getAsset<ApiContract>("api", assetId));
    case "event":
      return checkEvent(getAsset<EventContract>("event", assetId));
    case "dataModel":
      return checkDataModel(getAsset<DataModel>("dataModel", assetId));
    case "businessRule":
      return checkBusinessRule(getAsset<BusinessRule>("businessRule", assetId));
    case "proposal":
      return checkProposal(getAsset<Proposal>("proposal", assetId));
    default:
      return [result(assetType as AssetType, assetId, "GOVERNANCE_NOT_CONFIGURED", "该资产类型暂无内置规则", "info", true, "MVP 暂未为该类型配置静态规则。", "按需扩展 packages/core/src/rules/governance.ts。")];
  }
}

export const builtInRules = [
  "API_IDEMPOTENCY",
  "API_AUTH",
  "API_ERROR_CODES",
  "API_COMPATIBILITY",
  "EVENT_ENVELOPE",
  "EVENT_PRODUCER_CONSUMERS",
  "EVENT_RETRY",
  "EVENT_COMPATIBILITY",
  "DATA_SENSITIVE_CLASSIFICATION",
  "DATA_AMOUNT_UNIT",
  "DATA_STATUS_STATE",
  "DATA_PHYSICAL_MEANING",
  "RULE_HIGH_EXAMPLES",
  "RULE_VALIDATION_CONDITION",
  "RULE_PERMISSION_SCOPE",
  "PROPOSAL_GOALS",
  "PROPOSAL_IMPACTED_ASSETS",
  "PROPOSAL_ROLLBACK",
  "PROPOSAL_CONTEXT_PACK"
];
