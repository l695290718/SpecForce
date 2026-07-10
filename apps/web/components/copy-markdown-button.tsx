"use client";

import { useState } from "react";
import { useLanguage } from "./language-provider";

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200" onClick={copy} type="button">
      {copied ? t("action.copied") : t("action.copyMarkdown")}
    </button>
  );
}
