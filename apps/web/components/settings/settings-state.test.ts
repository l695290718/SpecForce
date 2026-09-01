import { describe, expect, it } from "vitest";
import { resolveSettingsSection, safeIdentityMessageKey, settingsHref } from "./settings-state";

describe("settings state", () => {
  it("defaults unknown sections to agents and retains exact scope in links", () => {
    expect(resolveSettingsSection(undefined)).toBe("agents");
    expect(resolveSettingsSection("unknown")).toBe("agents");
    expect(settingsHref("permissions", "com.huawei.celon.desiner")).toBe("/settings?section=permissions&scope=com.huawei.celon.desiner");
  });

  it("maps internal errors to safe translated summaries", () => {
    expect(safeIdentityMessageKey("OPERATION_DENIED")).toBe("settings.error.denied");
    expect(safeIdentityMessageKey("PrismaClientKnownRequestError")).toBe("settings.error.unavailable");
  });
});
