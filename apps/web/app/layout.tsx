import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { LanguageProvider } from "../components/language-provider";
import "./styles/globals.css";

export const metadata: Metadata = {
  title: "SpecForge Design Center",
  description: "智设中枢 - AI-native specification driven design center"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <LanguageProvider>
          <AppShell>{children}</AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
