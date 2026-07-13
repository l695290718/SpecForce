import { renderGovernanceCopy, builtInRules } from "../governance/localization";
import { validateAssetLocalization, AssetLocalizationError } from "../localization/assets";
import { assetCollections, getAsset, getStore } from "../repository";
import type {
  ApiContract,
  Asset,
  AssetType,
  BusinessRule,
  DataModel,
  EventContract,
  GovernanceCheckResult,
  GovernanceMessageParams,
  Proposal
} from "../types";

function result(
  assetType: AssetType,
  assetId: string,
  ruleCode: string,
  severity: "info" | "warning" | "error",
  passed: boolean,
  messageParams?: GovernanceMessageParams
): GovernanceCheckResult {
  const copy = renderGovernanceCopy(ruleCode, "en", messageParams);
  if (!copy) {
    throw new Error(`Missing governance localization template for rule ${ruleCode}`);
  }

  return {
    assetType,
    assetId,
    ruleCode,
    severity,
    status: passed ? "pass" : "fail",
    ruleName: copy.ruleName,
    reason: copy.reason,
    suggestion: copy.suggestion,
    messageParams
  };
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && `${value}`.trim().length > 0;
}

function maybeCheckAssetLocalization(assetType: string, assetId: string): GovernanceCheckResult[] {
  if (!(assetType in assetCollections)) {
    return [];
  }

  const asset = getAsset(assetType as AssetType, assetId) as Asset;
  if (!asset.localizedContent) {
    return [];
  }

  try {
    validateAssetLocalization(assetType as AssetType, asset);
    return [result(assetType as AssetType, assetId, "ASSET_BILINGUAL_COMPLETENESS", "error", true, { errorCode: "OK", path: "localizedContent.zh" })];
  } catch (error) {
    if (error instanceof AssetLocalizationError) {
      return [
        result(assetType as AssetType, assetId, "ASSET_BILINGUAL_COMPLETENESS", "error", false, {
          errorCode: error.code,
          path: error.path
        })
      ];
    }
    throw error;
  }
}

function checkApi(api: ApiContract): GovernanceCheckResult[] {
  const writeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(api.method);
  return [
    result("api", api.id, "API_IDEMPOTENCY", "error", !writeMethod || hasValue(api.idempotency)),
    result("api", api.id, "API_AUTH", "error", hasValue(api.authType)),
    result("api", api.id, "API_ERROR_CODES", "warning", api.errorCodes.length > 0),
    result("api", api.id, "API_COMPATIBILITY", "warning", api.exposure !== "external" || hasValue(api.compatibilityPolicy))
  ];
}

function checkEvent(event: EventContract): GovernanceCheckResult[] {
  const requiredFields = ["eventId", "eventType", "version", "timestamp", "traceId"];
  const missing = requiredFields.filter((field) => !(field in event.schema));
  return [
    result("event", event.id, "EVENT_ENVELOPE", "error", missing.length === 0, { missingFields: missing }),
    result("event", event.id, "EVENT_PRODUCER_CONSUMERS", "error", hasValue(event.producer) && event.consumers.length > 0),
    result("event", event.id, "EVENT_RETRY", "warning", hasValue(event.retryPolicy)),
    result("event", event.id, "EVENT_COMPATIBILITY", "warning", hasValue(event.compatibilityPolicy))
  ];
}

function checkDataModel(model: DataModel): GovernanceCheckResult[] {
  const sensitiveWithoutClassification = model.fields.filter((field) => field.sensitiveLevel && field.sensitiveLevel !== "none" && !field.classification);
  const amountWithoutUnit = model.fields.filter((field) => /amount|price|fee|balance/i.test(field.fieldName) && !/unit=|cents|yuan|currency/i.test(`${field.constraint ?? ""} ${field.meaning ?? ""}`));
  const statusWithoutState = model.fields.filter((field) => /status|state/i.test(field.fieldName) && !/enum|状态机|state/i.test(`${field.constraint ?? ""} ${field.meaning ?? ""}`));
  const physicalMissingMeaning = model.modelType === "physical" ? model.fields.filter((field) => !field.meaning) : [];

  return [
    result("dataModel", model.id, "DATA_SENSITIVE_CLASSIFICATION", "error", sensitiveWithoutClassification.length === 0, {
      fieldNames: sensitiveWithoutClassification.map((field) => field.fieldName)
    }),
    result("dataModel", model.id, "DATA_AMOUNT_UNIT", "error", amountWithoutUnit.length === 0, {
      fieldNames: amountWithoutUnit.map((field) => field.fieldName)
    }),
    result("dataModel", model.id, "DATA_STATUS_STATE", "warning", statusWithoutState.length === 0, {
      fieldNames: statusWithoutState.map((field) => field.fieldName)
    }),
    result("dataModel", model.id, "DATA_PHYSICAL_MEANING", "warning", physicalMissingMeaning.length === 0, {
      fieldNames: physicalMissingMeaning.map((field) => field.fieldName)
    })
  ];
}

function checkBusinessRule(rule: BusinessRule): GovernanceCheckResult[] {
  return [
    result("businessRule", rule.id, "RULE_HIGH_EXAMPLES", "warning", rule.severity !== "high" || rule.examples.length > 0),
    result("businessRule", rule.id, "RULE_VALIDATION_CONDITION", "error", rule.ruleType !== "validation" || hasValue(rule.condition)),
    result(
      "businessRule",
      rule.id,
      "RULE_PERMISSION_SCOPE",
      "error",
      rule.ruleType !== "permission" || /role|permission|scope|角色|权限/.test(`${rule.condition ?? ""} ${rule.description}`)
    )
  ];
}

function checkProposal(proposal: Proposal): GovernanceCheckResult[] {
  const risky = proposal.risks.some((risk) => /高风险|high/i.test(risk));
  const touchesApiOrEvent = proposal.impactedAssets.some((asset) => asset.type === "api" || asset.type === "event");
  const hasContextPack = getStore().contextPacks.some((pack) => pack.proposalId === proposal.id);
  return [
    result("proposal", proposal.id, "PROPOSAL_GOALS", "error", hasValue(proposal.goal) && hasValue(proposal.nonGoal)),
    result("proposal", proposal.id, "PROPOSAL_IMPACTED_ASSETS", "error", proposal.impactedAssets.length > 0),
    result("proposal", proposal.id, "PROPOSAL_ROLLBACK", "error", !risky || hasValue(proposal.rollbackPlan)),
    result("proposal", proposal.id, "PROPOSAL_CONTEXT_PACK", "warning", !touchesApiOrEvent || hasContextPack)
  ];
}

function checkDefault(assetType: AssetType, assetId: string): GovernanceCheckResult[] {
  return [result(assetType, assetId, "GOVERNANCE_NOT_CONFIGURED", "info", true)];
}

export async function runGovernanceChecks(assetType: string, assetId: string): Promise<GovernanceCheckResult[]> {
  const localizationResults = maybeCheckAssetLocalization(assetType, assetId);
  let ruleResults: GovernanceCheckResult[];

  switch (assetType as AssetType) {
    case "api":
      ruleResults = checkApi(getAsset<ApiContract>("api", assetId));
      break;
    case "event":
      ruleResults = checkEvent(getAsset<EventContract>("event", assetId));
      break;
    case "dataModel":
      ruleResults = checkDataModel(getAsset<DataModel>("dataModel", assetId));
      break;
    case "businessRule":
      ruleResults = checkBusinessRule(getAsset<BusinessRule>("businessRule", assetId));
      break;
    case "proposal":
      ruleResults = checkProposal(getAsset<Proposal>("proposal", assetId));
      break;
    default:
      ruleResults = checkDefault(assetType as AssetType, assetId);
      break;
  }

  return [...localizationResults, ...ruleResults];
}

export { builtInRules };
