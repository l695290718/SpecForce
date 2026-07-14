"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale, type MessageKey } from "../lib/i18n";
import { applyClientLocale } from "../lib/locale-client";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children, initialLocale }: { children: ReactNode; initialLocale: Locale }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = initialLocale === "zh" ? "zh-CN" : "en";
  }, [initialLocale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    applyClientLocale(nextLocale, {
      writeCookie: (value) => { document.cookie = value; },
      writeStorage: (value) => window.localStorage.setItem("specforge-locale", value),
      setDocumentLanguage: (value) => { document.documentElement.lang = value; },
      refresh: () => router.refresh()
    });
  }, [router]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey) => translate(locale, key)
    }),
    [locale, setLocale]
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
