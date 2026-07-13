import type { AssetLocale } from "@specforge/core";
import { cookies } from "next/headers";

export const localeCookieName = "specforge-locale";
export const defaultRequestLocale: AssetLocale = "en";

export function localeFromCookie(value: string | undefined): AssetLocale {
  return value === "zh" || value === "en" ? value : defaultRequestLocale;
}

export async function getRequestLocale(): Promise<AssetLocale> {
  return localeFromCookie((await cookies()).get(localeCookieName)?.value);
}

export function localeCookieValue(locale: AssetLocale): string {
  return `${localeCookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function withQueryParam(href: string, key: string, value: string): string {
  const [pathAndQuery = "", hash] = href.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(key, value);
  const serialized = params.toString();
  return `${path}${serialized ? `?${serialized}` : ""}${hash === undefined ? "" : `#${hash}`}`;
}
