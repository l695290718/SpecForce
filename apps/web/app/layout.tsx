import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "../components/app-shell";
import { LanguageProvider } from "../components/language-provider";
import { getRequestLocale } from "../lib/locale";
import "./styles/globals.css";

export const metadata: Metadata = {
  title: "SpecForge Design Center",
  description: "智设中枢 - AI-native specification driven design center"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <LanguageProvider initialLocale={locale}>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </LanguageProvider>
      </body>
    </html>
  );
}
