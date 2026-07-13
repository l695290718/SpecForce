import type { AssetLocale, GovernanceCheckResult, GovernanceMessageParams } from "../types";

interface GovernanceTemplate {
  en: GovernanceCopy;
  zh: GovernanceCopy;
}

interface GovernanceCopy {
  ruleName: string | ((params?: GovernanceMessageParams) => string);
  reason: string | ((params?: GovernanceMessageParams) => string);
  suggestion: string | ((params?: GovernanceMessageParams) => string);
}

function formatFields(params?: GovernanceMessageParams): string {
  const fields = params?.missingFields;
  return Array.isArray(fields) && fields.length > 0 ? fields.join(", ") : "none";
}

function formatAssetFields(params?: GovernanceMessageParams): string {
  const fields = params?.fieldNames;
  return Array.isArray(fields) && fields.length > 0 ? fields.join(", ") : "none";
}

function formatString(params: GovernanceMessageParams | undefined, key: string, fallback: string): string {
  const value = params?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function renderCopyPart(part: GovernanceCopy[keyof GovernanceCopy], params?: GovernanceMessageParams): string {
  return typeof part === "function" ? part(params) : part;
}

const governanceTemplates: Record<string, GovernanceTemplate> = {
  ASSET_BILINGUAL_COMPLETENESS: {
    en: {
      ruleName: "Asset bilingual localization must be complete",
      reason: (params) => {
        const code = formatString(params, "errorCode", "UNKNOWN_LOCALIZATION_ERROR");
        const path = formatString(params, "path", "localizedContent.zh");
        return code === "OK" ? "Asset localization validation passed." : `${code} at ${path}`;
      },
      suggestion: (params) => {
        const code = formatString(params, "errorCode", "UNKNOWN_LOCALIZATION_ERROR");
        const path = formatString(params, "path", "localizedContent.zh");
        return code === "OK"
          ? "Keep Chinese overlays aligned with the canonical English asset."
          : `Complete the Chinese localization payload at ${path}.`;
      }
    },
    zh: {
      ruleName: "资产双语本地化必须完整",
      reason: (params) => {
        const code = formatString(params, "errorCode", "UNKNOWN_LOCALIZATION_ERROR");
        const path = formatString(params, "path", "localizedContent.zh");
        return code === "OK" ? "资产本地化校验通过。" : `${code} 位于 ${path}`;
      },
      suggestion: (params) => {
        const code = formatString(params, "errorCode", "UNKNOWN_LOCALIZATION_ERROR");
        const path = formatString(params, "path", "localizedContent.zh");
        return code === "OK" ? "继续保持中文覆盖与规范英文资产一致。" : `补齐 ${path} 处的中文本地化内容。`;
      }
    }
  },
  GOVERNANCE_NOT_CONFIGURED: {
    en: {
      ruleName: "No built-in governance rules configured for this asset type",
      reason: "This MVP does not yet define static governance rules for the asset type.",
      suggestion: "Extend packages/core/src/rules/governance.ts when this asset type needs static checks."
    },
    zh: {
      ruleName: "该资产类型暂无内置治理规则",
      reason: "当前 MVP 尚未为该资产类型配置静态治理规则。",
      suggestion: "当该资产类型需要静态检查时，再扩展 packages/core/src/rules/governance.ts。"
    }
  },
  API_IDEMPOTENCY: {
    en: {
      ruleName: "Write APIs must declare idempotency",
      reason: "Missing idempotency guarantees can cause duplicate charges or duplicate refunds.",
      suggestion: "Define a stable idempotencyKey in the request body or headers and document duplicate-request behavior."
    },
    zh: {
      ruleName: "写 API 必须声明幂等性",
      reason: "缺少幂等保证会导致重复扣款或重复退款。",
      suggestion: "在请求体或请求头中定义稳定的 idempotencyKey，并声明重复请求的响应策略。"
    }
  },
  API_AUTH: {
    en: {
      ruleName: "API must declare authType",
      reason: "Missing authType leaves the caller trust boundary undefined.",
      suggestion: "Declare service token, user scope, or an internal trust boundary."
    },
    zh: {
      ruleName: "API 必须声明 authType",
      reason: "缺少鉴权模型会让调用边界不可治理。",
      suggestion: "声明 service token、user scope 或内部信任边界。"
    }
  },
  API_ERROR_CODES: {
    en: {
      ruleName: "API must declare errorCodes",
      reason: "Callers cannot handle business failures predictably without machine-readable error codes.",
      suggestion: "List machine-readable error codes and their meaning."
    },
    zh: {
      ruleName: "API 必须声明 errorCodes",
      reason: "没有机器可读错误码时，调用方无法稳定处理业务异常。",
      suggestion: "列出机器可读的错误码及其语义。"
    }
  },
  API_COMPATIBILITY: {
    en: {
      ruleName: "External APIs must declare compatibilityPolicy",
      reason: "External contracts without compatibility rules increase the risk of breaking changes.",
      suggestion: "Document versioning rules for adding, deprecating, and removing fields."
    },
    zh: {
      ruleName: "对外 API 必须声明 compatibilityPolicy",
      reason: "对外契约缺少兼容策略会放大破坏性变更风险。",
      suggestion: "声明新增、废弃、删除字段时的版本策略。"
    }
  },
  EVENT_ENVELOPE: {
    en: {
      ruleName: "Event schema must include standard envelope fields",
      reason: (params) => `Missing fields: ${formatFields(params)}`,
      suggestion: "Add eventId, eventType, version, timestamp, and traceId."
    },
    zh: {
      ruleName: "Event schema必须包含标准信封字段",
      reason: (params) => `缺少字段：${formatFields(params)}`,
      suggestion: "补齐 eventId、eventType、version、timestamp、traceId。"
    }
  },
  EVENT_PRODUCER_CONSUMERS: {
    en: {
      ruleName: "Events must declare producer and consumers",
      reason: "Missing producers or consumers weakens impact analysis.",
      suggestion: "Declare the producing system and at least one consuming system."
    },
    zh: {
      ruleName: "Event 必须声明 producer 和 consumers",
      reason: "生产者或消费者为空会影响影响分析。",
      suggestion: "声明事件生产系统以及至少一个消费系统。"
    }
  },
  EVENT_RETRY: {
    en: {
      ruleName: "Events must declare retryPolicy",
      reason: "Without retry policy, delivery failures are not recoverable.",
      suggestion: "Declare the retry window, backoff strategy, and DLQ policy."
    },
    zh: {
      ruleName: "Event 必须声明 retryPolicy",
      reason: "缺少重试策略会让投递故障不可恢复。",
      suggestion: "声明重试窗口、退避策略和 DLQ 策略。"
    }
  },
  EVENT_COMPATIBILITY: {
    en: {
      ruleName: "Events must declare compatibilityPolicy",
      reason: "The event contract is missing evolution rules.",
      suggestion: "Document schema evolution, field deprecation, and versioning policy."
    },
    zh: {
      ruleName: "Event 必须声明 compatibilityPolicy",
      reason: "事件契约缺少演进规则。",
      suggestion: "声明 schema 演进、字段废弃和版本策略。"
    }
  },
  DATA_SENSITIVE_CLASSIFICATION: {
    en: {
      ruleName: "Sensitive fields must declare classification",
      reason: (params) => `Unclassified sensitive fields: ${formatAssetFields(params)}`,
      suggestion: "Add classification to every sensitive field."
    },
    zh: {
      ruleName: "敏感字段必须声明 classification",
      reason: (params) => `未分类敏感字段：${formatAssetFields(params)}`,
      suggestion: "为每个敏感字段补充 classification。"
    }
  },
  DATA_AMOUNT_UNIT: {
    en: {
      ruleName: "Amount fields must declare units or constraints",
      reason: (params) => `Amount fields missing units: ${formatAssetFields(params)}`,
      suggestion: "Document units such as cents, yuan, or currency in meaning or constraint."
    },
    zh: {
      ruleName: "金额字段必须声明单位或约束",
      reason: (params) => `缺少金额单位的字段：${formatAssetFields(params)}`,
      suggestion: "在 meaning 或 constraint 中声明 cents、yuan、currency 等单位。"
    }
  },
  DATA_STATUS_STATE: {
    en: {
      ruleName: "Status fields must reference a state machine or enum",
      reason: (params) => `Status fields missing lifecycle semantics: ${formatAssetFields(params)}`,
      suggestion: "Reference a state machine or enum definition."
    },
    zh: {
      ruleName: "状态字段必须关联状态机或枚举说明",
      reason: (params) => `缺少状态说明的字段：${formatAssetFields(params)}`,
      suggestion: "关联状态机或枚举定义。"
    }
  },
  DATA_PHYSICAL_MEANING: {
    en: {
      ruleName: "Physical model fields must include meaning",
      reason: (params) => `Fields missing meaning: ${formatAssetFields(params)}`,
      suggestion: "Add business meaning for every physical field."
    },
    zh: {
      ruleName: "物理模型字段必须包含 meaning",
      reason: (params) => `缺少 meaning 的字段：${formatAssetFields(params)}`,
      suggestion: "为每个物理字段补充业务含义。"
    }
  },
  RULE_HIGH_EXAMPLES: {
    en: {
      ruleName: "High-severity business rules must include examples",
      reason: "High-severity rules without examples are easy to misimplement.",
      suggestion: "Add at least one positive or negative example."
    },
    zh: {
      ruleName: "高优先级业务规则必须包含 examples",
      reason: "高优先级规则缺少示例会让实现容易误解。",
      suggestion: "补充至少一个正例或反例。"
    }
  },
  RULE_VALIDATION_CONDITION: {
    en: {
      ruleName: "Validation rules must include condition",
      reason: "A validation rule is missing its condition expression.",
      suggestion: "Add an executable or readable condition."
    },
    zh: {
      ruleName: "validation 类型规则必须包含 condition",
      reason: "校验规则缺少条件表达式。",
      suggestion: "补充可执行或可阅读的 condition。"
    }
  },
  RULE_PERMISSION_SCOPE: {
    en: {
      ruleName: "Permission rules must describe roles or permission scope",
      reason: "The permission rule does not define role or scope boundaries.",
      suggestion: "Add roles, permission points, or scope details."
    },
    zh: {
      ruleName: "permission 类型规则必须描述角色或权限范围",
      reason: "权限规则缺少角色或权限边界。",
      suggestion: "补充角色、权限点或 scope 说明。"
    }
  },
  PROPOSAL_GOALS: {
    en: {
      ruleName: "Proposals must declare goal and nonGoal",
      reason: "Missing goals or non-goals leads to scope drift.",
      suggestion: "Complete the goal and nonGoal fields."
    },
    zh: {
      ruleName: "Proposal 必须声明 goal 和 nonGoal",
      reason: "目标或非目标为空会导致范围漂移。",
      suggestion: "补充 goal 和 nonGoal。"
    }
  },
  PROPOSAL_IMPACTED_ASSETS: {
    en: {
      ruleName: "Proposals must declare impactedAssets",
      reason: "Without impacted assets, impact analysis cannot run.",
      suggestion: "Select the design assets affected by the proposal."
    },
    zh: {
      ruleName: "Proposal 必须声明 impactedAssets",
      reason: "缺少受影响资产就无法做影响分析。",
      suggestion: "选择被该提案影响的设计资产。"
    }
  },
  PROPOSAL_ROLLBACK: {
    en: {
      ruleName: "High-risk proposals must declare rollbackPlan",
      reason: "High-risk changes need a rollback path.",
      suggestion: "Add shutdown, data recovery, or compensation steps."
    },
    zh: {
      ruleName: "高风险 Proposal 必须声明 rollbackPlan",
      reason: "高风险变更缺少回滚策略。",
      suggestion: "补充关闭入口、数据恢复或补偿方案。"
    }
  },
  PROPOSAL_CONTEXT_PACK: {
    en: {
      ruleName: "API or event changes must generate a Context Pack",
      reason: "The proposal touches contracts but has no Agent Context Pack.",
      suggestion: "Generate a Context Pack and include it in the implementation instructions."
    },
    zh: {
      ruleName: "涉及 API 或 Event 变更时必须生成 Context Pack",
      reason: "提案涉及契约变更但未生成 Agent Context Pack。",
      suggestion: "生成 Context Pack 并纳入实现指令。"
    }
  }
};

export const builtInRules = Object.freeze(Object.keys(governanceTemplates));

export function renderGovernanceCopy(
  ruleCode: string,
  locale: AssetLocale,
  params?: GovernanceMessageParams
): Pick<GovernanceCheckResult, "ruleName" | "reason" | "suggestion"> | undefined {
  const template = governanceTemplates[ruleCode];
  if (!template) {
    return undefined;
  }

  const copy = template[locale];
  return {
    ruleName: renderCopyPart(copy.ruleName, params),
    reason: renderCopyPart(copy.reason, params),
    suggestion: renderCopyPart(copy.suggestion, params)
  };
}

export function localizeGovernanceResult(result: GovernanceCheckResult, locale: AssetLocale): GovernanceCheckResult {
  const copy = renderGovernanceCopy(result.ruleCode, locale, result.messageParams);
  if (!copy) {
    return result;
  }

  return {
    ...result,
    ...copy
  };
}
