import type {
  Adr,
  ApiContract,
  Asset,
  AssetLocale,
  AssetType,
  BusinessRule,
  ContextPack,
  DataField,
  DataModel,
  DomainModel,
  EventContract,
  IntegrationContract,
  LocalizedContent,
  ObservabilityDesign,
  Proposal,
  QualityRequirement,
  StateMachine,
  StateTransition
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

type TranslationRecord = Partial<Record<string, unknown>>;

interface LocalizationDefinition<T extends Asset> {
  requiredStringFields: readonly string[];
  optionalStringFields?: readonly string[];
  requiredArrayFields?: readonly string[];
  optionalArrayFields?: readonly string[];
  customFieldNames?: readonly string[];
  validateCustom?: (assetType: AssetType, asset: T, overlay: TranslationRecord) => void;
  applyCustom?: (asset: T, overlay: TranslationRecord) => T;
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

const registry: Record<AssetType, LocalizationDefinition<Asset>> = {
  domain: {
    requiredStringFields: ["name", "description"],
    requiredArrayFields: ["entities", "valueObjects", "domainServices", "businessCapabilities", "glossaryTerms"]
  },
  dataModel: {
    requiredStringFields: ["name", "description", "lifecycle", "lineage"],
    requiredArrayFields: ["relationships", "constraints"],
    customFieldNames: ["fields"],
    validateCustom: validateDataModelOverlay,
    applyCustom: applyDataModelOverlay
  },
  api: {
    requiredStringFields: ["name", "description"],
    optionalStringFields: ["authType", "idempotency", "rateLimit", "timeout", "compatibilityPolicy"]
  },
  event: {
    requiredStringFields: ["name", "description", "triggerTiming"],
    optionalStringFields: ["orderingRequirement", "retryPolicy", "deadLetterPolicy", "compatibilityPolicy"]
  },
  businessRule: {
    requiredStringFields: ["name", "description", "action"],
    optionalStringFields: ["condition", "exception"],
    requiredArrayFields: ["examples"]
  },
  stateMachine: {
    requiredStringFields: ["name", "description"],
    requiredArrayFields: ["guards", "actions"],
    customFieldNames: ["states", "events", "transitions"],
    validateCustom: validateStateMachineOverlay,
    applyCustom: applyStateMachineOverlay
  },
  integration: {
    requiredStringFields: ["name", "description", "dataMapping", "errorMapping", "sla", "timeout", "retryStrategy", "fallbackStrategy", "circuitBreaker"]
  },
  quality: {
    requiredStringFields: ["name", "description", "target", "measurement", "verificationMethod"]
  },
  observability: {
    requiredStringFields: ["name", "description", "runbook", "slo"],
    requiredArrayFields: ["alerts", "dashboards"]
  },
  adr: {
    requiredStringFields: ["name", "title", "description", "context", "decision"],
    requiredArrayFields: ["alternatives", "consequences", "constraints"]
  },
  proposal: {
    requiredStringFields: ["name", "title", "description", "background", "goal", "nonGoal", "scope", "rolloutPlan"],
    optionalStringFields: ["rollbackPlan"],
    requiredArrayFields: ["specChanges", "risks"]
  },
  contextPack: {
    requiredStringFields: ["name", "summary", "generatedMarkdown"],
    requiredArrayFields: ["constraints", "instructions"]
  }
};

export function localizeAsset<T extends Asset>(assetType: AssetType, asset: T, locale: AssetLocale): T {
  const normalized = normalizeAsset(assetType, asset) as T;
  if (locale === "en") {
    return normalized;
  }

  validateAssetLocalization(assetType, normalized);

  const overlay = getOverlay(assetType, normalized);
  const definition = registry[assetType];
  const localized = cloneAsset(normalized);

  for (const field of definition.requiredStringFields) {
    localized[field] = overlay[field];
  }

  for (const field of definition.optionalStringFields ?? []) {
    if (field in overlay) {
      localized[field] = overlay[field];
    }
  }

  for (const field of definition.requiredArrayFields ?? []) {
    localized[field] = cloneStringArray(overlay[field]);
  }

  for (const field of definition.optionalArrayFields ?? []) {
    if (field in overlay) {
      localized[field] = cloneStringArray(overlay[field]);
    }
  }

  return definition.applyCustom ? definition.applyCustom(localized as T, overlay) : (localized as T);
}

export function validateAssetLocalization(assetType: AssetType, asset: Asset): void {
  const normalized = normalizeAsset(assetType, asset);
  const overlay = getOverlay(assetType, normalized);
  const definition = registry[assetType];
  const allowedFields = new Set<string>([
    ...definition.requiredStringFields,
    ...(definition.optionalStringFields ?? []),
    ...(definition.requiredArrayFields ?? []),
    ...(definition.optionalArrayFields ?? []),
    ...(definition.customFieldNames ?? [])
  ]);

  for (const key of Object.keys(overlay)) {
    if (!allowedFields.has(key)) {
      throw createError(assetType, normalized.id, `localizedContent.zh.${key}`, "TRANSLATION_FIELD_NOT_ALLOWED");
    }
  }

  for (const field of definition.requiredStringFields) {
    assertCanonicalString(assetType, normalized, field);
    assertTranslatedString(assetType, normalized.id, overlay[field], `localizedContent.zh.${field}`);
  }

  for (const field of definition.optionalStringFields ?? []) {
    assertOptionalCanonicalString(assetType, normalized, field);
    if (field in overlay) {
      assertTranslatedString(assetType, normalized.id, overlay[field], `localizedContent.zh.${field}`);
    }
  }

  for (const field of definition.requiredArrayFields ?? []) {
    const canonical = normalized[field];
    assertCanonicalStringArray(assetType, normalized.id, canonical, field);
    assertTranslatedStringArray(assetType, normalized.id, canonical, overlay[field], `localizedContent.zh.${field}`);
  }

  for (const field of definition.optionalArrayFields ?? []) {
    const canonical = normalized[field];
    if (canonical !== undefined) {
      assertCanonicalStringArray(assetType, normalized.id, canonical, field);
    }
    if (field in overlay) {
      assertTranslatedStringArray(assetType, normalized.id, canonical, overlay[field], `localizedContent.zh.${field}`);
    }
  }

  definition.validateCustom?.(assetType, normalized as never, overlay);
}

function getOverlay(assetType: AssetType, asset: Asset): TranslationRecord {
  const overlay = asset.localizedContent?.zh;
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    throw createError(assetType, asset.id, "localizedContent.zh", "ASSET_TRANSLATION_REQUIRED");
  }

  return overlay;
}

function normalizeAsset(assetType: AssetType, asset: Asset): Asset {
  if (assetType !== "proposal") {
    return asset;
  }

  const proposal = cloneAsset(asset as Proposal) as Proposal;
  const englishOverlay = proposal.localizedContent?.en;
  if (!englishOverlay || typeof englishOverlay !== "object" || Array.isArray(englishOverlay)) {
    return proposal;
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

  return proposal;
}

function cloneAsset<T extends Asset>(asset: T): T {
  return {
    ...asset,
    localizedContent: cloneLocalizedContent(asset.localizedContent)
  };
}

function cloneLocalizedContent(localizedContent?: LocalizedContent): LocalizedContent | undefined {
  if (!localizedContent) {
    return undefined;
  }

  return {
    en: cloneRecord(localizedContent.en),
    zh: cloneRecord(localizedContent.zh)
  };
}

function cloneRecord(record?: Partial<Record<string, unknown>>): Partial<Record<string, unknown>> | undefined {
  if (!record) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, cloneUnknown(value)]));
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

function validateDataModelOverlay(assetType: AssetType, asset: DataModel, overlay: TranslationRecord): void {
  const translatedFields = overlay.fields;
  if (!translatedFields || typeof translatedFields !== "object" || Array.isArray(translatedFields)) {
    throw createError(assetType, asset.id, "localizedContent.zh.fields", "ASSET_TRANSLATION_REQUIRED");
  }

  const translatedRecord = translatedFields as Record<string, unknown>;
  const canonicalFields = new Map(asset.fields.map((field) => [field.fieldName, field]));

  for (const fieldName of Object.keys(translatedRecord)) {
    if (!canonicalFields.has(fieldName)) {
      throw createError(assetType, asset.id, `localizedContent.zh.fields.${fieldName}`, "TRANSLATION_STRUCTURE_MISMATCH");
    }
  }

  for (const field of asset.fields) {
    const translated = translatedRecord[field.fieldName];
    if (!translated || typeof translated !== "object" || Array.isArray(translated)) {
      throw createError(assetType, asset.id, `localizedContent.zh.fields.${field.fieldName}`, "ASSET_TRANSLATION_REQUIRED");
    }

    validateTranslatedDataField(assetType, asset.id, field, translated as Record<string, unknown>);
  }
}

function validateTranslatedDataField(assetType: AssetType, assetId: string, field: DataField, translated: Record<string, unknown>): void {
  const allowedKeys = new Set(["displayName", "meaning", "constraint", "classification", "example"]);

  for (const key of Object.keys(translated)) {
    if (!allowedKeys.has(key)) {
      throw createError(assetType, assetId, `localizedContent.zh.fields.${field.fieldName}.${key}`, "TRANSLATION_FIELD_NOT_ALLOWED");
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

function applyDataModelOverlay(asset: DataModel, overlay: TranslationRecord): DataModel {
  const translatedFields = overlay.fields as Record<string, Record<string, unknown>>;
  return {
    ...asset,
    fields: asset.fields.map((field) => applyTranslatedDataField(field, translatedFields[field.fieldName]))
  };
}

function applyTranslatedDataField(field: DataField, translated: Record<string, unknown>): DataField {
  return {
    ...field,
    displayName: translated.displayName as string,
    meaning: translated.meaning === undefined ? field.meaning : (translated.meaning as string),
    constraint: translated.constraint === undefined ? field.constraint : (translated.constraint as string),
    classification: translated.classification === undefined ? field.classification : (translated.classification as string),
    example: translated.example === undefined ? field.example : (translated.example as string)
  };
}

function validateStateMachineOverlay(assetType: AssetType, asset: StateMachine, overlay: TranslationRecord): void {
  validateLabelRecord(assetType, asset.id, asset.states, overlay.states, "localizedContent.zh.states");
  validateLabelRecord(assetType, asset.id, asset.events, overlay.events, "localizedContent.zh.events");

  const translatedTransitions = overlay.transitions;
  if (!translatedTransitions || typeof translatedTransitions !== "object" || Array.isArray(translatedTransitions)) {
    throw createError(assetType, asset.id, "localizedContent.zh.transitions", "ASSET_TRANSLATION_REQUIRED");
  }

  const transitionRecord = translatedTransitions as Record<string, unknown>;
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

    const translatedRecord = translated as Record<string, unknown>;
    const allowedKeys = new Set(["condition", "action", "failureHandling"]);

    for (const nestedKey of Object.keys(translatedRecord)) {
      if (!allowedKeys.has(nestedKey)) {
        throw createError(assetType, asset.id, `localizedContent.zh.transitions.${key}.${nestedKey}`, "TRANSLATION_FIELD_NOT_ALLOWED");
      }
    }

    for (const narrativeField of ["condition", "action", "failureHandling"] as const) {
      if (transition[narrativeField] !== undefined) {
        assertTranslatedString(assetType, asset.id, translatedRecord[narrativeField], `localizedContent.zh.transitions.${key}.${narrativeField}`);
      }
    }
  }
}

function validateLabelRecord(assetType: AssetType, assetId: string, canonical: string[], translated: unknown, path: string): void {
  if (!translated || typeof translated !== "object" || Array.isArray(translated)) {
    throw createError(assetType, assetId, path, "ASSET_TRANSLATION_REQUIRED");
  }

  const translatedRecord = translated as Record<string, unknown>;
  const canonicalKeys = new Set(canonical);

  for (const key of Object.keys(translatedRecord)) {
    if (!canonicalKeys.has(key)) {
      throw createError(assetType, assetId, `${path}.${key}`, "TRANSLATION_STRUCTURE_MISMATCH");
    }
  }

  for (const key of canonical) {
    assertTranslatedString(assetType, assetId, translatedRecord[key], `${path}.${key}`);
  }
}

function applyStateMachineOverlay(asset: StateMachine, overlay: TranslationRecord): StateMachine {
  const translatedStates = overlay.states as Record<string, string>;
  const translatedEvents = overlay.events as Record<string, string>;
  const translatedTransitions = overlay.transitions as Record<string, Record<string, string>>;

  return {
    ...asset,
    states: asset.states.map((state) => translatedStates[state]),
    events: asset.events.map((event) => translatedEvents[event]),
    transitions: asset.transitions.map((transition) => {
      const translated = translatedTransitions[getTransitionKey(transition)];
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
