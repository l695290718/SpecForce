import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCAN_LIMITS,
  canonicalUnsignedRelease,
  validateScanBatch,
  validateScanSession,
  validateScannerRelease,
  verifyScannerRelease
} from "./index";
import type { ArchitectureScope, ScanSessionDescriptor } from "./index";

const fixtureUrl = (name: string) => new URL(`../fixtures/${name}`, import.meta.url);
const fixture = <T>(name: string): T => JSON.parse(readFileSync(fixtureUrl(name), "utf8")) as T;

describe("scan contract v2", () => {
  it("accepts the shared session and batch fixtures", () => {
    const session = validateScanSession(fixture("valid-session.json"));
    const batch = validateScanBatch(fixture("valid-batch.json"), session);

    expect(session.contractVersion).toBe("2.0");
    expect(batch.sequence).toBe(0);
  });

  it("rejects a client batch carrying a different Scope", () => {
    const invalid = fixture<{ expectedArchitectureScope: ArchitectureScope; batch: unknown }>("invalid-cross-scope-batch.json");

    expect(() => validateScanBatch(invalid.batch, invalid.expectedArchitectureScope)).toThrow("SCOPE_MISMATCH");
  });

  it("freezes the approved production budgets", () => {
    expect(SCAN_LIMITS).toEqual({
      maxObservationsPerBatch: 500,
      maxBatchBytes: 4_194_304,
      maxExcerptBytes: 8_192,
      maxSourceFileBytes: 10_485_760,
      maxObservationsPerSession: 100_000
    });
  });

  it("enforces observation, canonical-byte, excerpt, and session ceilings", () => {
    const session = fixture<ScanSessionDescriptor>("valid-session.json");
    const batch = fixture<Record<string, any>>("valid-batch.json");

    const tooMany = structuredClone(batch);
    tooMany.observations = Array.from({ length: 501 }, () => structuredClone(batch.observations[0]));
    tooMany.coverageDelta.observationCount = 501;
    expect(() => validateScanBatch(tooMany, session)).toThrow("SCAN_BATCH_OBSERVATION_LIMIT_EXCEEDED");

    const tooLarge = structuredClone(batch);
    tooLarge.observations[0].payload.padding = "x".repeat(SCAN_LIMITS.maxBatchBytes);
    expect(() => validateScanBatch(tooLarge, session)).toThrow("SCAN_BATCH_BYTE_LIMIT_EXCEEDED");

    const excerptTooLarge = structuredClone(batch);
    excerptTooLarge.observations[0].evidenceRefs[0].excerpt = "界".repeat(3_000);
    expect(() => validateScanBatch(excerptTooLarge, session)).toThrow("SCAN_EXCERPT_BYTE_LIMIT_EXCEEDED");

    const limitsTooLarge = structuredClone(session);
    limitsTooLarge.limits.maxObservationsPerSession = SCAN_LIMITS.maxObservationsPerSession + 1;
    expect(() => validateScanSession(limitsTooLarge)).toThrow("SCAN_LIMITS_EXCEEDED");
  });

  it("rejects undeclared envelope properties", () => {
    const batch = { ...fixture<Record<string, unknown>>("valid-batch.json"), clientOverride: true };
    expect(() => validateScanBatch(batch)).toThrow("SCAN_BATCH_INVALID:ADDITIONAL_PROPERTY");
  });

  it("keeps RFC 8785 release bytes stable and verifies the shared signature", async () => {
    const release = fixture("signed-release.json");
    const expected = readFileSync(fixtureUrl("signed-release.canonical.json"), "utf8").trim();
    const canonical = new TextDecoder().decode(canonicalUnsignedRelease(release));

    expect(canonical).toBe(expected);
    await expect(verifyScannerRelease(release, "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=")).resolves.toBe(true);
  });

  it("validates portable release runtime compatibility while preserving legacy native manifests", () => {
    const legacy = fixture("signed-release.json");
    expect(validateScannerRelease(legacy).platform).toBe("windows-amd64");

    const portable = {
      ...legacy,
      releaseId: "scanner-release:2.1.0-portable",
      scannerVersion: "2.1.0",
      platform: "any",
      artifactKind: "PORTABLE_SCRIPT",
      architecture: "any",
      runtime: { name: "node", versionRange: ">=20 <23" },
      entrypoint: "scanner.mjs"
    };
    expect(validateScannerRelease(portable)).toMatchObject({ artifactKind: "PORTABLE_SCRIPT", runtime: { name: "node" } });
    expect(() => validateScannerRelease({ ...portable, runtime: undefined })).toThrow("SCANNER_PORTABLE_RUNTIME_REQUIRED");
    expect(() => validateScannerRelease({ ...portable, platform: "windows-amd64" })).toThrow("SCANNER_PORTABLE_PLATFORM_INVALID");
  });

  it("declares JSON Schema 2020-12 as the canonical schema", () => {
    const schema = fixture<{ $schema: string; $id: string }>("../schema/scan-contract-v2.schema.json");
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("https://specforge.dev/schema/scan-contract-v2.schema.json");
  });
});
