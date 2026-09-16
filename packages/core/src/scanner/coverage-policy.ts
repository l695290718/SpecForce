import { contentDigest } from "../federation/digest";

export type ScanFileClassificationKind = "SUPPORTED" | "EXCLUDED" | "REQUIRED_UNSUPPORTED" | "OUT_OF_POLICY";

export interface ScanCoveragePolicyRule {
  id: string;
  classification: Exclude<ScanFileClassificationKind, "SUPPORTED">;
  pattern: RegExp;
}

export interface ScanCoveragePolicy {
  id: string;
  version: string;
  rules: ScanCoveragePolicyRule[];
}

export interface ScanFileClassification {
  classification: ScanFileClassificationKind;
  ruleId: string;
}

export const defaultScanCoveragePolicy: ScanCoveragePolicy = {
  id: "specforge-governed-local-repository",
  version: "1",
  rules: [
    { id: "excluded-generated-or-private", classification: "EXCLUDED", pattern: /(^|\/)(\.git|\.pnpm-store|\.specforge|\.worktrees|node_modules|vendor|dist|build|coverage|\.next|target)(\/|$)/i },
    { id: "excluded-sensitive-material", classification: "EXCLUDED", pattern: /(^|\/)(\.env(?:\.|$)|.*\.(pem|key|p12|pfx|jks)|id_rsa(?:\.|$))/i },
    { id: "required-deployment-declaration", classification: "REQUIRED_UNSUPPORTED", pattern: /(^|\/)(Dockerfile|docker-compose[^/]*\.(ya?ml)|compose[^/]*\.(ya?ml)|\.github\/workflows\/[^/]+\.(ya?ml)|\.gitlab-ci\.ya?ml|(?:charts|helm|k8s|kubernetes|deploy)\/.*)$/i }
  ]
};

export function classifyScanFile(path: string, supported: boolean, policy: ScanCoveragePolicy = defaultScanCoveragePolicy): ScanFileClassification {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  for (const rule of policy.rules) {
    if (rule.classification === "REQUIRED_UNSUPPORTED" && supported) continue;
    if (rule.pattern.test(normalized)) return { classification: rule.classification, ruleId: rule.id };
  }
  return supported
    ? { classification: "SUPPORTED", ruleId: "supported-source" }
    : { classification: "OUT_OF_POLICY", ruleId: "outside-governed-policy" };
}

export function scanCoveragePolicyDigest(policy: ScanCoveragePolicy): string {
  return contentDigest({
    id: policy.id,
    version: policy.version,
    rules: policy.rules.map((rule) => ({ id: rule.id, classification: rule.classification, pattern: rule.pattern.source, flags: rule.pattern.flags }))
  });
}
