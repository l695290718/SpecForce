import type { MessageKey } from "../../lib/i18n";

export type SettingsSection = "agents" | "permissions" | "runtime";

export function resolveSettingsSection(value?: string | null): SettingsSection {
  return value === "permissions" || value === "runtime" ? value : "agents";
}

export function settingsHref(section: SettingsSection, scope?: string | null) {
  const params = new URLSearchParams({ section });
  if (scope) params.set("scope", scope);
  return `/settings?${params.toString()}`;
}

export function safeIdentityMessageKey(code: string): MessageKey {
  if (code === "AUTHENTICATION_REQUIRED" || code === "CSRF_TOKEN_REJECTED" || code === "CSRF_ORIGIN_REJECTED") return "settings.error.auth";
  if (code === "OPERATION_DENIED" || code === "OWNER_ACCESS_DENIED" || code === "IDENTITY_NOT_FOUND") return "settings.error.denied";
  if (code === "INVALID_CREDENTIAL_EXPIRY" || code === "REASON_REQUIRED" || code === "INVALID_CREDENTIAL_CEILING") return "settings.error.validation";
  return "settings.error.unavailable";
}
