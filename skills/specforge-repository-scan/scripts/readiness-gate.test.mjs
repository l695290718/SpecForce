import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyReadiness } from "./readiness-gate.mjs";

test("classifies the first source-derived scan as bootstrap", () => {
  assert.equal(classifyReadiness({ trustStatus: "SOURCE_CHECK_REQUIRED", reasonCodes: ["KNOWLEDGE_SOURCE_NOT_CONFIGURED", "KNOWLEDGE_PENDING_PROMOTION"], remediationActions: ["START_FULL_SCAN"] }, true).mode, "BOOTSTRAP_SCAN");
});

test("blocks non-bootstrap readiness failures", () => {
  assert.equal(classifyReadiness({ trustStatus: "BLOCKED", reasonCodes: ["KNOWLEDGE_RECONCILIATION_BLOCKED"], remediationActions: ["START_FULL_SCAN"] }, true).mode, "BLOCKED");
  assert.equal(classifyReadiness({ trustStatus: "SELF_CONTAINED", reasonCodes: [], remediationActions: [] }, false).mode, "BLOCKED");
});
