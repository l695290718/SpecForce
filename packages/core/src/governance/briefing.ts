export interface BriefingAssetInput {
  id: string;
  name: string;
  description?: string;
  status?: string;
}

export interface GovernanceBriefing {
  counts: { rules: number; adrsAccepted: number; adrsOther: number };
  rules: BriefingAssetInput[];
  acceptedAdrs: BriefingAssetInput[];
  otherAdrs: BriefingAssetInput[];
  orientationChecklist: { en: string[]; zh: string[] };
  digest: string;
}

function normalizeAssets(items: BriefingAssetInput[]): BriefingAssetInput[] {
  const seen = new Set<string>();
  return items
    .filter((item) => item.id && !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({ id: item.id, name: item.name ?? item.id, description: (item.description ?? "").replace(/\s+/g, " ").trim(), status: item.status }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

const CHECKLIST_EN = [
  "Run or read docs/governance-briefing.md before your first implementation turn.",
  "Open a design-context preflight in the exact owning scope before changing code, schema, or contracts.",
  "Write every authored fact through MCP tools; never bypass to direct database access.",
  "Keep English canonical fields complete and provide full Chinese overlays for human-facing content.",
  "Close the session with CONVERGED evidence only after focused tests, build, and live verification pass.",
  "For current system knowledge, evaluate readiness before read_system_knowledge; legacy reads are compatibility fallbacks subject to enforcement.",
  "Record deferred work as backlog facts with owner, trigger, and rationale - never silently drop it."
];

const CHECKLIST_ZH = [
  "首轮实现前运行或阅读 docs/governance-briefing.md。",
  "修改代码、模式或契约前，在精确归属 Scope 打开设计上下文预检。",
  "所有已编写事实必须经 MCP 工具写入；禁止绕行直查或直写数据库。",
  "英文字段保持规范完整，面向人的内容提供完整中文覆盖。",
  "聚焦测试、构建与线上验证全部通过后，才能以 CONVERGED 证据关闭会话。",
  "读取系统现状知识时，先评估就绪状态，再调用 read_system_knowledge；旧读取仅作为受门禁控制的兼容回退。",
  "延期工作必须登记为带负责人、触发条件与理由的待办事实——不得静默丢弃。"
];

/** Environment-agnostic deterministic digest (FNV-1a 64-bit as hex) so the compiler bundles into web and node alike. */
function briefingDigest(payload: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= BigInt(payload.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function compileGovernanceBriefing(input: { rules: BriefingAssetInput[]; adrs: BriefingAssetInput[] }): GovernanceBriefing {
  const rules = normalizeAssets(input.rules);
  const adrs = normalizeAssets(input.adrs);
  const acceptedAdrs = adrs.filter((adr) => (adr.status ?? "accepted").toLowerCase() === "accepted");
  const otherAdrs = adrs.filter((adr) => (adr.status ?? "accepted").toLowerCase() !== "accepted");
  const digest = briefingDigest(`${rules.map((rule) => rule.id).join(",")}|${adrs.map((adr) => adr.id).join(",")}`);
  return {
    counts: { rules: rules.length, adrsAccepted: acceptedAdrs.length, adrsOther: otherAdrs.length },
    rules,
    acceptedAdrs,
    otherAdrs,
    orientationChecklist: { en: CHECKLIST_EN, zh: CHECKLIST_ZH },
    digest
  };
}

export function renderGovernanceBriefingMarkdown(briefing: GovernanceBriefing, generatedAtIso: string): string {
  const lines: string[] = [];
  lines.push("# Governance Briefing / 治理简报");
  lines.push("");
  lines.push(`Generated ${generatedAtIso} from SpecForge system records via MCP. Digest \`${briefing.digest}\`. Regenerate with \`pnpm governance:briefing\` - do not hand-edit.`);
  lines.push("");
  lines.push(`基于 SpecForge 系统记录经 MCP 于 ${generatedAtIso} 生成。摘要 \`${briefing.digest}\`。使用 \`pnpm governance:briefing\` 重新生成——请勿手改。`);
  lines.push("");
  lines.push("## Orientation checklist / 入职清单");
  briefing.orientationChecklist.en.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push("");
  briefing.orientationChecklist.zh.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push("");
  lines.push(`## Business rules in force (${briefing.counts.rules}) / 生效业务规则`);
  for (const rule of briefing.rules) {
    lines.push(`- **${rule.id}** — ${rule.name}: ${rule.description}`);
  }
  lines.push("");
  lines.push(`## Accepted ADRs (${briefing.counts.adrsAccepted}) / 已接受架构决策`);
  for (const adr of briefing.acceptedAdrs) {
    lines.push(`- **${adr.id}** — ${adr.name}${adr.description ? `: ${adr.description}` : ""}`);
  }
  if (briefing.otherAdrs.length > 0) {
    lines.push("");
    lines.push(`## Other ADR statuses (${briefing.counts.adrsOther}) / 其他状态决策`);
    for (const adr of briefing.otherAdrs) {
      lines.push(`- **${adr.id}** — ${adr.name} (${adr.status}): ${adr.description}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
