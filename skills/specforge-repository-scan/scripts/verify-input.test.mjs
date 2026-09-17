import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyInput } from "./verify-input.mjs";

const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "specforge-scan-"));

test("requires an explicit exact Scope", () => {
  assert.throws(() => verifyInput({ repositoryPath }), /SCAN_SCOPE_REQUIRED/);
  assert.throws(() => verifyInput({ repositoryPath, applicationServiceId: "com.specforge.designcenter", scopePath: "" }), /SCAN_SCOPE_PATH_REQUIRED/);
});

test("normalizes a valid repository scan input", () => {
  const result = verifyInput({ repositoryPath, applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" });
  assert.equal(result.applicationServiceId, "com.specforge.designcenter");
  assert.equal(result.includePaths.length, 0);
});

test("rejects path traversal in include and exclude paths", () => {
  const input = { repositoryPath, applicationServiceId: "com.specforge.designcenter", scopePath: "scope" };
  assert.throws(() => verifyInput({ ...input, includePaths: ["../outside"] }), /SCAN_INCLUDE_PATHS_OUTSIDE_REPOSITORY/);
  assert.throws(() => verifyInput({ ...input, excludePaths: ["/outside"] }), /SCAN_EXCLUDE_PATHS_OUTSIDE_REPOSITORY/);
});
