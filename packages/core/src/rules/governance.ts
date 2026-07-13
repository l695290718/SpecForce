import { localizeGovernanceResult, renderGovernanceCopy, builtInRules } from "../governance/localization";
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
  Proposal,
  DerivedViewOptions,
  SpecForgeDataStore,
  AssetLocale
} from "../types";

function result(
  assetType: AssetType,
  assetId: string,
  ruleCode: string,
  severity: "info" | "warning" | "error",
  passed: boolean,
  messageParams?: GovernanceMessageParams,
  locale: AssetLocale = "en"
): GovernanceCheckResult {
  const copy = renderGovernanceCopy(ruleCode, locale, messageParams);
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

function maybeCheckAssetLocalization(assetType: string, assetId: string, catalog?: SpecForgeDataStore, locale: AssetLocale = "en"): GovernanceCheckResult[] {
  if (!(assetType in assetCollections)) {
    return [];
  }

  const asset = getAsset(assetType as AssetType, assetId, catalog) as Asset;

  try {
    validateAssetLocalization(assetType as AssetType, asset);
    return [result(assetType as AssetType, assetId, "ASSET_BILINGUAL_COMPLETENESS", "error", true, { errorCode: "OK", path: "localizedContent.zh" }, locale)];
  } catch (error) {
    if (error instanceof AssetLocalizationError) {
      return [
        result(assetType as AssetType, assetId, "ASSET_BILINGUAL_COMPLETENESS", "error", false, {
          errorCode: error.code,
          path: error.path
        }, locale)
      ];
    }
    throw error;
  }
}

function checkApi(api: ApiContract, locale: AssetLocale): GovernanceCheckResult[] {
  const writeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(api.method);
  return [
    result("api", api.id, "API_IDEMPOTENCY", "error", !writeMethod || hasValue(api.idempotency), undefined, locale),
    result("api", api.id, "API_AUTH", "error", hasValue(api.authType), undefined, locale),
    result("api", api.id, "API_ERROR_CODES", "warning", api.errorCodes.length > 0, undefined, locale),
    result("api", api.id, "API_COMPATIBILITY", "warning", api.exposure !== "external" || hasValue(api.compatibilityPolicy), undefined, locale)
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

function checkProposal(proposal: Proposal, catalog: SpecForgeDataStore, locale: AssetLocale): GovernanceCheckResult[] {
  const risky = proposal.risks.some((risk) => /高风险|high/i.test(risk));
  const touchesApiOrEvent = proposal.impactedAssets.some((asset) => asset.type === "api" || asset.type === "event");
  const hasContextPack = catalog.contextPacks.some((pack) => pack.proposalId === proposal.id);
  return [
    result("proposal", proposal.id, "PROPOSAL_GOALS", "error", hasValue(proposal.goal) && hasValue(proposal.nonGoal), undefined, locale),
    result("proposal", proposal.id, "PROPOSAL_IMPACTED_ASSETS", "error", proposal.impactedAssets.length > 0, undefined, locale),
    result("proposal", proposal.id, "PROPOSAL_ROLLBACK", "error", !risky || hasValue(proposal.rollbackPlan), undefined, locale),
    result("proposal", proposal.id, "PROPOSAL_CONTEXT_PACK", "warning", !touchesApiOrEvent || hasContextPack, undefined, locale)
  ];
}

function checkDefault(assetType: AssetType, assetId: string, locale: AssetLocale): GovernanceCheckResult[] {
  return [result(assetType, assetId, "GOVERNANCE_NOT_CONFIGURED", "info", true, undefined, locale)];
}

export async function runGovernanceChecks(assetType: string, assetId: string, options: DerivedViewOptions = {}): Promise<GovernanceCheckResult[]> {
  const catalog = getStore(options.catalog);
  const locale = options.locale ?? "en";
  const localizationResults = maybeCheckAssetLocalization(assetType, assetId, catalog, locale);
  let ruleResults: GovernanceCheckResult[];

  switch (assetType as AssetType) {
    case "api":
      ruleResults = checkApi(getAsset<ApiContract>("api", assetId, catalog), locale);
      break;
    case "event":
      ruleResults = checkEvent(getAsset<EventContract>("event", assetId, catalog));
      break;
    case "dataModel":
      ruleResults = checkDataModel(getAsset<DataModel>("dataModel", assetId, catalog));
      break;
    case "businessRule":
      ruleResults = checkBusinessRule(getAsset<BusinessRule>("businessRule", assetId, catalog));
      break;
    case "proposal":
      ruleResults = checkProposal(getAsset<Proposal>("proposal", assetId, catalog), catalog, locale);
      break;
    default:
      ruleResults = checkDefault(assetType as AssetType, assetId, locale);
      break;
  }

  return [...localizationResults, ...ruleResults].map((item) => localizeGovernanceResult(item, locale));
}

export { builtInRules };
