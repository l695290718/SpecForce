import { describe, expect, it } from "vitest";
import { prisma } from "../persistence";
import { findReusableReceipt, insertImmutableReceipt, upsertPolicyOverlay } from "./repository";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const otherScope = { applicationServiceId: "com.huawei.celon.policyhub", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-policyhub/com.huawei.celon.policyhub" };
const overlay = { id: "scope-policy", version: 1, profileId: "ARCHITECTURE_OVERVIEW" as const };
const receipt = { architectureScope: scope, id: "receipt-epoch-test", deterministicKey: "key-epoch-test", evaluationEpoch: 1n, subjectId: "agent-1", grantDigest: "g", profileId: "ARCHITECTURE_OVERVIEW", selectorDigest: "s", purpose: "architecture", locale: "en", policyId: "enterprise-minimum-v1", policyVersion: 1, trustStatus: "SELF_CONTAINED", dimensionStatuses: [], baselineBindings: [], sourceWaterlines: {}, coverageSummary: {}, freshnessSummary: {}, reasonCodes: [], remediationActions: [], asOf: new Date("2026-08-30T10:00:00.000Z"), validUntil: new Date("2026-08-30T11:00:00.000Z"), receiptDigest: "d" };

describe("knowledge readiness persistence", () => {
  it.skipIf(!process.env.SPECFORGE_CONTINUOUS_INTEGRATION)("reuses one immutable receipt for the same exact-Scope decision", async () => {
    const first = await insertImmutableReceipt(prisma, receipt);
    const second = await insertImmutableReceipt(prisma, receipt);
    expect(second.id).toBe(first.id);
    expect(await prisma.systemKnowledgeReadinessReceipt.count({ where: { ...scope, deterministicKey: receipt.deterministicKey } })).toBe(1);
    expect(await findReusableReceipt(prisma, scope, receipt.deterministicKey, receipt.evaluationEpoch, new Date("2026-08-30T10:30:00.000Z"))).not.toBeNull();
  });

  it.skipIf(!process.env.SPECFORGE_CONTINUOUS_INTEGRATION)("never resolves a policy from another Scope", async () => {
    const testOverlay = { ...overlay, id: `scope-policy-${Date.now()}`, version: Math.floor(Date.now() / 1000) };
    await upsertPolicyOverlay(prisma, { architectureScope: otherScope, actorId: "agent-1", overlay: testOverlay });
    const result = await prisma.knowledgeReadinessPolicy.findFirst({ where: { ...scope, profileId: testOverlay.profileId, id: testOverlay.id, status: "ACTIVE" } });
    expect(result).toBeNull();
  });
});
