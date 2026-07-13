import {
  AssetLocalizationError,
  localizeAsset,
  type Asset,
  type AssetLocale,
  type LocalizationIssueCode,
  type AssetType,
  type AssetTypeMap
} from "@specforge/core";

const legacyReadFallbackCodes = new Set<LocalizationIssueCode>([
  "ASSET_TRANSLATION_REQUIRED",
  "TRANSLATION_FIELD_NOT_ALLOWED",
  "TRANSLATION_STRUCTURE_MISMATCH",
  "TRANSLATION_TECHNICAL_FIELD_MUTATION"
]);

export function isLegacyTranslationError(error: unknown): error is AssetLocalizationError {
  return error instanceof AssetLocalizationError && legacyReadFallbackCodes.has(error.code);
}

export function safeLocalizeAssetForRead<TType extends AssetType>(
  assetType: TType,
  asset: AssetTypeMap[TType],
  locale: AssetLocale
): AssetTypeMap[TType];
export function safeLocalizeAssetForRead<TAsset extends Asset>(assetType: AssetType, asset: TAsset, locale: AssetLocale): TAsset;
export function safeLocalizeAssetForRead(assetType: AssetType, asset: Asset, locale: AssetLocale): Asset {
  try {
    return localizeAsset(assetType, asset, locale);
  } catch (error) {
    if (locale !== "zh" || !isLegacyTranslationError(error)) throw error;
    return localizeAsset(assetType, asset, "en");
  }
}

export async function withLegacyDerivedReadFallback<TResult>(
  locale: AssetLocale,
  read: (resolvedLocale: AssetLocale) => Promise<TResult>
): Promise<TResult> {
  try {
    return await read(locale);
  } catch (error) {
    if (locale !== "zh" || !isLegacyTranslationError(error)) throw error;
    return read("en");
  }
}
