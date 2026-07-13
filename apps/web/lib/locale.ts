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

export function getApiRequestLocale(request: Request): AssetLocale {
  const explicitLocale = new URL(request.url).searchParams.get("locale");
  if (explicitLocale === "zh" || explicitLocale === "en") return explicitLocale;
  return localeFromCookie(readCookie(request.headers.get("cookie"), localeCookieName));
}

export function withRequestLocale<T>(request: Request, reader: (locale: AssetLocale) => T): T {
  return reader(getApiRequestLocale(request));
}

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function withSearchParams(path: string, searchParams: RouteSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function withQueryParam(href: string, key: string, value: string): string {
  const [pathAndQuery = "", hash] = href.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(key, value);
  const serialized = params.toString();
  return `${path}${serialized ? `?${serialized}` : ""}${hash === undefined ? "" : `#${hash}`}`;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const entry of header.split(";")) {
    const [key, ...valueParts] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return undefined;
}
