import { cookies, headers } from "next/headers";
import type { ScopedPrincipal } from "@specforge/core";
import { resolveWebAuthMode, resolveWebPrincipal } from "./3a/principal";

export async function getRequestPrincipal(): Promise<ScopedPrincipal> {
  return resolveWebPrincipal({
    authMode: resolveWebAuthMode(),
    headers: await headers(),
    cookies: await cookies()
  });
}

export async function getOptionalRequestPrincipal(): Promise<ScopedPrincipal | null> {
  try {
    return await getRequestPrincipal();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (["AUTHENTICATION_REQUIRED", "WEB_PRINCIPAL_RESOLVER_REQUIRED", "WEB_PRINCIPAL_CLAIMS_REQUIRED", "WEB_PRINCIPAL_CLAIMS_INVALID"].includes(message)) {
      return null;
    }
    throw error;
  }
}

export async function resolveRequestPrincipal(request: Request): Promise<ScopedPrincipal> {
  return resolveWebPrincipal({
    authMode: resolveWebAuthMode(),
    headers: request.headers,
    cookies: cookieReader(request.headers.get("cookie"))
  });
}

function cookieReader(header: string | null) {
  const values = new Map(
    (header ?? "").split(";").map((part) => part.trim().split("=", 2) as [string, string]).filter(([name, value]) => Boolean(name && value))
  );
  return { get: (name: string) => {
    const value = values.get(name);
    return value === undefined ? undefined : { value: decodeURIComponent(value) };
  } };
}
