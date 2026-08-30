import { describe, expect, it } from "vitest";
import type { Permission } from "@specforge/core";
import { resolveKnowledgeReadMode } from "./compatibility";

const ordinaryCaller = { permissions: ["asset:read"] as Permission[] };
const diagnosticCaller = { permissions: ["asset:read", "knowledge:diagnostic"] as Permission[] };

describe("legacy knowledge read compatibility", () => {
  it("keeps payload compatibility while auditing ordinary reads in observe mode", () => {
    expect(resolveKnowledgeReadMode({ enforcement: "observe" }, ordinaryCaller)).toEqual({ allow: true, mode: "OBSERVE", emitDeprecationAudit: true });
  });

  it("denies ordinary low-level reads after enforcement", () => {
    expect(resolveKnowledgeReadMode({ enforcement: "enforce" }, ordinaryCaller)).toEqual({ allow: false, mode: "ENFORCE", emitDeprecationAudit: true });
  });

  it("allows only explicitly authorized diagnostic bypass", () => {
    expect(resolveKnowledgeReadMode({ enforcement: "enforce" }, diagnosticCaller)).toEqual({ allow: true, mode: "DIAGNOSTIC_ONLY", emitDeprecationAudit: false });
  });
});
