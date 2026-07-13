import type {
  Adr,
  AdrLocalizedFields,
  ApiContract,
  ApiContractLocalizedFields,
  Asset,
  AssetLocale,
  AssetLocalizedContentMap,
  AssetType,
  AssetTypeMap,
  BusinessRule,
  BusinessRuleLocalizedFields,
  ContextPack,
  ContextPackLocalizedFields,
  DataField,
  DataFieldLocalizedFields,
  DataModel,
  DataModelLocalizedFields,
  DomainModel,
  DomainModelLocalizedFields,
  EventContract,
  EventContractLocalizedFields,
  IntegrationContract,
  IntegrationContractLocalizedFields,
  LocalizedContent,
  ObservabilityDesign,
  ObservabilityDesignLocalizedFields,
  Proposal,
  ProposalLocalizedFields,
  QualityRequirement,
  QualityRequirementLocalizedFields,
  StateMachine,
  StateMachineLocalizedFields,
  StateTransition,
  StateTransitionLocalizedFields
} from "../types";

export type LocalizationIssueCode =
  | "ASSET_TRANSLATION_REQUIRED"
  | "CANONICAL_CONTENT_REQUIRED"
  | "TRANSLATION_FIELD_NOT_ALLOWED"
  | "TRANSLATION_STRUCTURE_MISMATCH"
  | "TRANSLATION_TECHNICAL_FIELD_MUTATION";

export interface LocalizationIssue {
  code: LocalizationIssueCode;
  assetType: AssetType;
  assetId: string;
  path: string;
}

export class AssetLocalizationError extends Error implements LocalizationIssue {
  code: LocalizationIssueCode;
  assetType: AssetType;
  assetId: string;
  path: string;

  constructor(issue: LocalizationIssue) {
    super(`${issue.code}: ${issue.path}`);
    this.name = "AssetLocalizationError";
    this.code = issue.code;
    this.assetType = issue.assetType;
    this.assetId = issue.assetId;
    this.path = issue.path;
  }
}

type OverlayFor<TType extends AssetType> = NonNullable<AssetLocalizedContentMap[TType]["zh"]>;
type DefinitionMap = {
  [TType in AssetType]: LocalizationDefinition<AssetTypeMap[TType], OverlayFor<TType>>;
};

interface LocalizationDefinition<TAsset extends Asset, TOverlay extends object> {
  requiredStringFields: readonly (keyof TOverlay & string)[];
  optionalStringFields?: readonly (keyof TOverlay & string)[];
  requiredArrayFields?: readonly (keyof TOverlay & string)[];
  optionalArrayFields?: readonly (keyof TOverlay & string)[];
  customFieldNames?: readonly (keyof TOverlay & string)[];
  technicalFieldNames?: readonly string[];
  validateCustom?: (assetType: AssetType, asset: TAsset, overlay: TOverlay) => void;
  applyCustom?: (asset: TAsset, overlay: TOverlay) => TAsset;
}

const proposalCompatibilityFields = [
  "name",
  "title",
  "description",
  "background",
  "goal",
  "nonGoal",
  "scope",
  "rolloutPlan",
  "rollbackPlan"
] as const;

const proposalCompatibilityArrayFields = ["specChanges", "risks"] as const;

const registry: DefinitionMap = {
  domain: {
    requiredStringFields: ["name", "description"],
    requiredArrayFields: ["entities", "valueObjects", "domainServices", "businessCapabilities", "glossaryTerms"],
    technicalFieldNames: ["id", "code", "boundedContext", "owner", "domainId", "createdAt", "updatedAt", "architectureScope"]
  },
  dataModel: {
    requiredStringFields: ["name", "description", "lifecycle", "lineage"],
    requiredArrayFields: ["relationships", "constraints"],
    customFieldNames: ["fields"],
    technicalFieldNames: [
      "id",
      "code",
      "modelType",
      "domainId",
      "tables",
      "entities",
      "dataClassification",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ],
    validateCustom: validateDataModelOverlay,
    applyCustom: applyDataModelOverlay
  },
  api: {
    requiredStringFields: ["name", "description"],
    optionalStringFields: ["authType", "idempotency", "rateLimit", "timeout", "compatibilityPolicy"],
    technicalFieldNames: [
      "id",
      "method",
      "path",
      "domainId",
      "providerSystem",
      "consumers",
      "requestSchema",
      "responseSchema",
      "errorCodes",
      "openapiSpec",
      "exposure",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  event: {
    requiredStringFields: ["name", "description", "triggerTiming"],
    optionalStringFields: ["orderingRequirement", "retryPolicy", "deadLetterPolicy", "compatibilityPolicy"],
    technicalFieldNames: [
      "id",
      "topic",
      "eventType",
      "domainId",
      "producer",
      "consumers",
      "schema",
      "idempotencyKey",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  businessRule: {
    requiredStringFields: ["name", "description", "action"],
    optionalStringFields: ["condition", "exception"],
    requiredArrayFields: ["examples"],
    technicalFieldNames: [
      "id",
      "code",
      "domainId",
      "ruleType",
      "relatedAssets",
      "severity",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  stateMachine: {
    requiredStringFields: ["name", "description"],
    requiredArrayFields: ["guards", "actions"],
    customFieldNames: ["states", "events", "transitions"],
    technicalFieldNames: [
      "id",
      "domainId",
      "initialState",
      "terminalStates",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ],
    validateCustom: validateStateMachineOverlay,
    applyCustom: applyStateMachineOverlay
  },
  integration: {
    requiredStringFields: ["name", "description", "dataMapping", "errorMapping", "sla", "timeout", "retryStrategy", "fallbackStrategy", "circuitBreaker"],
    technicalFieldNames: [
      "id",
      "domainId",
      "sourceSystem",
      "targetSystem",
      "protocol",
      "owner",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  quality: {
    requiredStringFields: ["name", "description", "target", "measurement", "verificationMethod"],
    technicalFieldNames: [
      "id",
      "assetType",
      "assetId",
      "domainId",
      "category",
      "priority",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  observability: {
    requiredStringFields: ["name", "description", "runbook", "slo"],
    requiredArrayFields: ["alerts", "dashboards"],
    technicalFieldNames: [
      "id",
      "assetType",
      "assetId",
      "domainId",
      "metrics",
      "logs",
      "traces",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  adr: {
    requiredStringFields: ["name", "title", "description", "context", "decision"],
    requiredArrayFields: ["alternatives", "consequences", "constraints"],
    technicalFieldNames: [
      "id",
      "domainId",
      "status",
      "relatedAssets",
      "owner",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  proposal: {
    requiredStringFields: ["name", "title", "description", "background", "goal", "nonGoal", "scope", "rolloutPlan"],
    optionalStringFields: ["rollbackPlan"],
    requiredArrayFields: ["specChanges", "risks"],
    technicalFieldNames: [
      "id",
      "domainId",
      "impactedAssets",
      "status",
      "createdAt",
      "updatedAt",
      "architectureScope"
    ]
  },
  contextPack: {
    requiredStringFields: ["name", "summary", "generatedMarkdown"],
    requiredArrayFields: ["constraints", "instructions"],
    technicalFieldNames: [
      "id",
      "proposalId",
      "targetAgent",
      "includedAssets",
      "createdAt",
      "architectureScope"
    ]
  }
};

export function localizeAsset<TType extends AssetType>(assetType: TType, asset: AssetTypeMap[TType], locale: AssetLocale): AssetTypeMap[TType];
export function localizeAsset<T extends Asset>(assetType: AssetType, asset: T, locale: AssetLocale): T;
export function localizeAsset(assetType: AssetType, asset: Asset, locale: AssetLocale): Asset {
  const normalized = normalizeAsset(assetType, asset);
  if (locale === "en") {
    return normalized;
  }

  validateAssetLocalization(assetType, normalized);

  const overlay = getOverlay(assetType, normalized);
  const definition = registry[assetType] as LocalizationDefinition<Asset, object>;
  const localized = cloneAsset(normalized);

  for (const field of definition.requiredStringFields) {
    localized[field] = overlay[field as keyof typeof overlay];
  }

  for (const field of definition.optionalStringFields ?? []) {
    if (field in overlay) {
      localized[field] = overlay[field as keyof typeof overlay];
    }
  }

  for (const field of definition.requiredArrayFields ?? []) {
    localized[field] = cloneStringArray(overlay[field as keyof typeof overlay]);
  }

  for (const field of definition.optionalArrayFields ?? []) {
    if (field in overlay) {
      localized[field] = cloneStringArray(overlay[field as keyof typeof overlay]);
    }
  }

  return definition.applyCustom ? definition.applyCustom(localized, overlay) : localized;
}

export function validateAssetLocalization(assetType: AssetType, asset: Asset): void {
  const normalized = normalizeAsset(assetType, asset);
  const overlay = getOverlay(assetType, normalized);
  const definition = registry[assetType] as LocalizationDefinition<Asset, object>;
  const allowedFields = new Set<string>([
    ...definition.requiredStringFields,
    ...(definition.optionalStringFields ?? []),
    ...(definition.requiredArrayFields ?? []),
    ...(definition.optionalArrayFields ?? []),
    ...(definition.customFieldNames ?? [])
  ]);
  const technicalFields = new Set<string>(definition.technicalFieldNames ?? []);

  for (const key of Object.keys(overlay)) {
    if (!allowedFields.has(key)) {
      const code = technicalFields.has(key) ? "TRANSLATION_TECHNICAL_FIELD_MUTATION" : "TRANSLATION_FIELD_NOT_ALLOWED";
      throw createError(assetType, normalized.id, `localizedContent.zh.${key}`, code);
    }
  }

  for (const field of definition.requiredStringFields) {
    assertCanonicalString(assetType, normalized, field);
    assertTranslatedString(assetType, normalized.id, overlay[field as keyof typeof overlay], `localizedContent.zh.${field}`);
  }

  for (const field of definition.optionalStringFields ?? []) {
    assertOptionalCanonicalString(assetType, normalized, field);
    if (field in overlay) {
      assertTranslatedString(assetType, normalized.id, overlay[field as keyof typeof overlay], `localizedContent.zh.${field}`);
    }
  }

  for (const field of definition.requiredArrayFields ?? []) {
    const canonical = normalized[field];
    assertCanonicalStringArray(assetType, normalized.id, canonical, field);
    assertTranslatedStringArray(assetType, normalized.id, canonical, overlay[field as keyof typeof overlay], `localizedContent.zh.${field}`);
  }

  for (const field of definition.optionalArrayFields ?? []) {
    const canonical = normalized[field];
    if (canonical !== undefined) {
      assertCanonicalStringArray(assetType, normalized.id, canonical, field);
    }
    if (field in overlay) {
      assertTranslatedStringArray(assetType, normalized.id, canonical, overlay[field as keyof typeof overlay], `localizedContent.zh.${field}`);
    }
  }

  definition.validateCustom?.(assetType, normalized, overlay);
}

function getOverlay<TType extends AssetType>(assetType: TType, asset: AssetTypeMap[TType]): OverlayFor<TType> {
  const overlay = asset.localizedContent?.zh;
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    throw createError(assetType, asset.id, "localizedContent.zh", "ASSET_TRANSLATION_REQUIRED");
  }

  return overlay as OverlayFor<TType>;
}

function normalizeAsset<TType extends AssetType>(assetType: TType, asset: AssetTypeMap[TType]): AssetTypeMap[TType] {
  if (assetType !== "proposal") {
    return asset;
  }

  const proposal = cloneAsset(asset as Proposal);
  const englishOverlay = proposal.localizedContent?.en;
  if (!englishOverlay || typeof englishOverlay !== "object" || Array.isArray(englishOverlay)) {
    return proposal as AssetTypeMap[TType];
  }

  for (const field of proposalCompatibilityFields) {
    const current = proposal[field];
    const fallback = englishOverlay[field];
    if (!isNonEmptyString(current) && typeof fallback === "string" && fallback.trim()) {
      proposal[field] = fallback;
    }
  }

  for (const field of proposalCompatibilityArrayFields) {
    const current = proposal[field];
    const fallback = englishOverlay[field];
    if ((!Array.isArray(current) || current.length === 0) && Array.isArray(fallback)) {
      proposal[field] = [...fallback];
    }
  }

  return proposal as AssetTypeMap[TType];
}

function cloneAsset<T extends Asset>(asset: T): T {
  return {
    ...asset,
    localizedContent: cloneLocalizedContent(asset.localizedContent)
  };
}

function cloneLocalizedContent<TZh extends object, TEn extends object = TZh>(
  localizedContent?: LocalizedContent<TZh, TEn>
): LocalizedContent<TZh, TEn> | undefined {
  if (!localizedContent) {
    return undefined;
  }

  return {
    zh: cloneUnknown(localizedContent.zh) as TZh | undefined,
    en: cloneUnknown(localizedContent.en) as TEn | undefined
  };
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknown);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, cloneUnknown(nestedValue)]));
  }

  return value;
}

function assertCanonicalString(assetType: AssetType, asset: Asset, field: string): void {
  if (!isNonEmptyString(asset[field])) {
    throw createError(assetType, asset.id, field, "CANONICAL_CONTENT_REQUIRED");
  }
}

function assertOptionalCanonicalString(assetType: AssetType, asset: Asset, field: string): void {
  const value = asset[field];
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw createError(assetType, asset.id, field, "CANONICAL_CONTENT_REQUIRED");
  }
}

function assertTranslatedString(assetType: AssetType, assetId: string, value: unknown, path: string): void {
  if (!isNonEmptyString(value)) {
    throw createError(assetType, assetId, path, "ASSET_TRANSLATION_REQUIRED");
  }
}

function assertCanonicalStringArray(assetType: AssetType, assetId: string, value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw createError(assetType, assetId, field, "CANONICAL_CONTENT_REQUIRED");
  }
}

function assertTranslatedStringArray(assetType: AssetType, assetId: string, canonical: unknown, translated: unknown, path: string): void {
  if (!Array.isArray(canonical) || !Array.isArray(translated)) {
    throw createError(assetType, assetId, path, "ASSET_TRANSLATION_REQUIRED");
  }

  if (canonical.length !== translated.length || translated.some((item) => typeof item !== "string")) {
    throw createError(assetType, assetId, path, "TRANSLATION_STRUCTURE_MISMATCH");
  }
}

function cloneStringArray(value: unknown): string[] {
  return Array.isArray(value) ? [...value] as string[] : [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function createError(assetType: AssetType, assetId: string, path: string, code: LocalizationIssueCode): AssetLocalizationError {
  return new AssetLocalizationError({
    code,
    assetType,
    assetId,
    path
  });
}

function validateDataModelOverlay(assetType: AssetType, asset: DataModel, overlay: DataModelLocalizedFields): void {
  const translatedFields = overlay.fields;
  if (!translatedFields || typeof translatedFields !== "object" || Array.isArray(translatedFields)) {
    throw createError(assetType, asset.id, "localizedContent.zh.fields", "ASSET_TRANSLATION_REQUIRED");
  }

  const canonicalFields = new Map(asset.fields.map((field) => [field.fieldName, field]));

  for (const fieldName of Object.keys(translatedFields)) {
    if (!canonicalFields.has(fieldName)) {
      throw createError(assetType, asset.id, `localizedContent.zh.fields.${fieldName}`, "TRANSLATION_STRUCTURE_MISMATCH");
    }
  }

  for (const field of asset.fields) {
    const translated = translatedFields[field.fieldName];
    if (!translated || typeof translated !== "object" || Array.isArray(translated)) {
      throw createError(assetType, asset.id, `localizedContent.zh.fields.${field.fieldName}`, "ASSET_TRANSLATION_REQUIRED");
    }

    validateTranslatedDataField(assetType, asset.id, field, translated);
  }
}

function validateTranslatedDataField(
  assetType: AssetType,
  assetId: string,
  field: DataField,
  translated: DataFieldLocalizedFields
): void {
  const allowedKeys = new Set(["displayName", "meaning", "constraint", "classification", "example"]);
  const technicalKeys = new Set(["fieldName", "dataType", "nullable", "defaultValue", "sensitiveLevel", "owner"]);

  for (const key of Object.keys(translated)) {
    if (!allowedKeys.has(key)) {
      const code = technicalKeys.has(key) ? "TRANSLATION_TECHNICAL_FIELD_MUTATION" : "TRANSLATION_FIELD_NOT_ALLOWED";
      throw createError(assetType, assetId, `localizedContent.zh.fields.${field.fieldName}.${key}`, code);
    }
  }

  assertTranslatedString(assetType, assetId, translated.displayName, `localizedContent.zh.fields.${field.fieldName}.displayName`);

  if (field.meaning !== undefined) {
    assertTranslatedString(assetType, assetId, translated.meaning, `localizedContent.zh.fields.${field.fieldName}.meaning`);
  }

  if (field.constraint !== undefined) {
    assertTranslatedString(assetType, assetId, translated.constraint, `localizedContent.zh.fields.${field.fieldName}.constraint`);
  }
}

function applyDataModelOverlay(asset: DataModel, overlay: DataModelLocalizedFields): DataModel {
  return {
    ...asset,
    fields: asset.fields.map((field) => applyTranslatedDataField(field, overlay.fields[field.fieldName]))
  };
}

function applyTranslatedDataField(field: DataField, translated: DataFieldLocalizedFields): DataField {
  return {
    ...field,
    displayName: translated.displayName,
    meaning: translated.meaning === undefined ? field.meaning : translated.meaning,
    constraint: translated.constraint === undefined ? field.constraint : translated.constraint,
    classification: translated.classification === undefined ? field.classification : translated.classification,
    example: translated.example === undefined ? field.example : translated.example
  };
}

function validateStateMachineOverlay(assetType: AssetType, asset: StateMachine, overlay: StateMachineLocalizedFields): void {
  validateLabelRecord(assetType, asset.id, asset.states, overlay.states, "localizedContent.zh.states");
  validateLabelRecord(assetType, asset.id, asset.events, overlay.events, "localizedContent.zh.events");

  const transitionRecord = overlay.transitions;
  if (!transitionRecord || typeof transitionRecord !== "object" || Array.isArray(transitionRecord)) {
    throw createError(assetType, asset.id, "localizedContent.zh.transitions", "ASSET_TRANSLATION_REQUIRED");
  }

  const canonicalKeys = new Set(asset.transitions.map(getTransitionKey));

  for (const key of Object.keys(transitionRecord)) {
    if (!canonicalKeys.has(key)) {
      throw createError(assetType, asset.id, `localizedContent.zh.transitions.${key}`, "TRANSLATION_STRUCTURE_MISMATCH");
    }
  }

  for (const transition of asset.transitions) {
    const key = getTransitionKey(transition);
    const translated = transitionRecord[key];
    if (!translated || typeof translated !== "object" || Array.isArray(translated)) {
      throw createError(assetType, asset.id, `localizedContent.zh.transitions.${key}`, "ASSET_TRANSLATION_REQUIRED");
    }

    const allowedKeys = new Set(["condition", "action", "failureHandling"]);
    const technicalKeys = new Set(["from", "to", "trigger", "emitsEvent", "idempotent"]);

    for (const nestedKey of Object.keys(translated)) {
      if (!allowedKeys.has(nestedKey)) {
        const code = technicalKeys.has(nestedKey) ? "TRANSLATION_TECHNICAL_FIELD_MUTATION" : "TRANSLATION_FIELD_NOT_ALLOWED";
        throw createError(assetType, asset.id, `localizedContent.zh.transitions.${key}.${nestedKey}`, code);
      }
    }

    for (const narrativeField of ["condition", "action", "failureHandling"] as const) {
      if (transition[narrativeField] !== undefined) {
        assertTranslatedString(assetType, asset.id, translated[narrativeField], `localizedContent.zh.transitions.${key}.${narrativeField}`);
      }
    }
  }
}

function validateLabelRecord(assetType: AssetType, assetId: string, canonical: string[], translated: Record<string, string>, path: string): void {
  if (!translated || typeof translated !== "object" || Array.isArray(translated)) {
    throw createError(assetType, assetId, path, "ASSET_TRANSLATION_REQUIRED");
  }

  const canonicalKeys = new Set(canonical);

  for (const key of Object.keys(translated)) {
    if (!canonicalKeys.has(key)) {
      throw createError(assetType, assetId, `${path}.${key}`, "TRANSLATION_STRUCTURE_MISMATCH");
    }
  }

  for (const key of canonical) {
    assertTranslatedString(assetType, assetId, translated[key], `${path}.${key}`);
  }
}

function applyStateMachineOverlay(asset: StateMachine, overlay: StateMachineLocalizedFields): StateMachine {
  return {
    ...asset,
    guards: [...overlay.guards],
    actions: [...overlay.actions],
    transitions: asset.transitions.map((transition) => {
      const translated = overlay.transitions[getTransitionKey(transition)];
      return {
        ...transition,
        condition: translated.condition ?? transition.condition,
        action: translated.action ?? transition.action,
        failureHandling: translated.failureHandling ?? transition.failureHandling
      };
    })
  };
}

function getTransitionKey(transition: StateTransition): string {
  return `${transition.from}::${transition.to}::${transition.trigger}`;
}
