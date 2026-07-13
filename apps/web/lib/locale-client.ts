import type { AssetLocale } from "@specforge/core";

export interface ClientLocaleEffects {
  writeCookie: (value: string) => void;
  writeStorage: (value: AssetLocale) => void;
  setDocumentLanguage: (value: string) => void;
  refresh: () => void;
}

export function applyClientLocale(locale: AssetLocale, effects: ClientLocaleEffects): void {
  effects.writeCookie(`specforge-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`);
  effects.writeStorage(locale);
  effects.setDocumentLanguage(locale === "zh" ? "zh-CN" : "en");
  effects.refresh();
}
