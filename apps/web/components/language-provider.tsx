"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultLocale, translate, type Locale, type MessageKey } from "../lib/i18n";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const saved = window.localStorage.getItem("specforge-locale");
    if (saved === "zh" || saved === "en") {
      setLocaleState(saved);
      document.documentElement.lang = saved === "zh" ? "zh-CN" : "en";
    }
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem("specforge-locale", nextLocale);
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
  };

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey) => translate(locale, key)
    }),
    [locale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}

export function T({ k }: { k: MessageKey }) {
  const { t } = useLanguage();
  return <>{t(k)}</>;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <div className="inline-flex rounded-md border border-border bg-white p-1 text-xs shadow-sm">
      {(["zh", "en"] as const).map((item) => (
        <button
          aria-pressed={locale === item}
          className={locale === item ? "rounded bg-accent px-2 py-1 font-semibold text-white" : "rounded px-2 py-1 font-medium text-slate-600 hover:bg-surface"}
          key={item}
          onClick={() => setLocale(item)}
          type="button"
        >
          {t(item === "zh" ? "language.zh" : "language.en")}
        </button>
      ))}
    </div>
  );
}
