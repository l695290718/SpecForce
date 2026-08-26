import { describe, expect, it } from "vitest";
import { INTEGRATION_ATLAS_LABELS } from "./integration-atlas-canvas";

describe("integration atlas localized labels", () => {
  it("keeps the verification label bilingual", () => {
    expect(INTEGRATION_ATLAS_LABELS.en.verificationState).toBe("Verification state");
    expect(INTEGRATION_ATLAS_LABELS.zh.verificationState).toBe("验证状态");
  });
});
