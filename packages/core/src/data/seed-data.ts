import type { ContextPack, SpecForgeDataStore } from "../types";

const now = "2026-07-09T00:00:00.000Z";

export const seedData: SpecForgeDataStore = {
  domains: [
    {
      id: "domain-order",
      name: "订单领域",
      code: "ORDER",
      description: "负责订单创建、支付状态、退款协作和订单生命周期治理。",
      boundedContext: "Order Management",
      owner: "Order Platform Team",
      entities: ["Order", "OrderLine", "Refund"],
      valueObjects: ["Money", "RefundReason", "OrderStatus"],
      domainServices: ["RefundEligibilityService", "OrderRefundCoordinator"],
      businessCapabilities: ["订单管理", "部分退款", "退款状态追踪"],
      glossaryTerms: ["可退金额", "部分退款", "退款单"],
      createdAt: now,
      updatedAt: now
    }
  ],
  dataModels: [
    {
      id: "data-order",
      name: "订单数据模型",
      code: "ORDER_DATA",
      description: "订单主表与订单明细的物理数据模型。",
      modelType: "physical",
      domainId: "domain-order",
      tables: ["orders", "order_lines"],
      entities: ["Order", "OrderLine"],
      fields: [
        { fieldName: "order_id", displayName: "订单 ID", dataType: "uuid", meaning: "订单唯一标识", nullable: false, constraint: "primary key", sensitiveLevel: "none", classification: "business-id", example: "ord_1001", owner: "Order Platform Team" },
        { fieldName: "status", displayName: "订单状态", dataType: "varchar", meaning: "订单生命周期状态，枚举：PAID、PARTIALLY_REFUNDED、REFUNDED", nullable: false, constraint: "enum OrderStatus", sensitiveLevel: "none", classification: "status", example: "PAID", owner: "Order Platform Team" },
        { fieldName: "paid_amount_cents", displayName: "已支付金额", dataType: "integer", meaning: "以分为单位的订单已支付金额", nullable: false, constraint: "unit=cents; >=0", sensitiveLevel: "internal", classification: "financial", example: "129900", owner: "Order Platform Team" }
      ],
      relationships: ["Order 1..n OrderLine", "Order 1..n Refund"],
      constraints: ["paid_amount_cents >= refunded_amount_cents"],
      dataClassification: "internal",
      lifecycle: "hot 180 days, archive 7 years",
      lineage: "Order service write model",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "data-refund",
      name: "退款数据模型",
      code: "REFUND_DATA",
      description: "记录部分退款申请、支付退款结果和幂等键。",
      modelType: "physical",
      domainId: "domain-order",
      tables: ["refunds"],
      entities: ["Refund"],
      fields: [
        { fieldName: "refund_id", displayName: "退款 ID", dataType: "uuid", meaning: "退款单唯一标识", nullable: false, constraint: "primary key", sensitiveLevel: "none", classification: "business-id", example: "rf_1001", owner: "Order Platform Team" },
        { fieldName: "amount_cents", displayName: "退款金额", dataType: "integer", meaning: "以分为单位的退款金额", nullable: false, constraint: "unit=cents; >0", sensitiveLevel: "internal", classification: "financial", example: "29900", owner: "Order Platform Team" },
        { fieldName: "status", displayName: "退款状态", dataType: "varchar", meaning: "退款状态机状态，枚举：REQUESTED、PROCESSING、SUCCEEDED、FAILED", nullable: false, constraint: "enum RefundStateMachine", sensitiveLevel: "none", classification: "status", example: "REQUESTED", owner: "Order Platform Team" },
        { fieldName: "idempotency_key", displayName: "幂等键", dataType: "varchar", meaning: "调用方提交退款请求的幂等键", nullable: false, constraint: "unique(order_id,idempotency_key)", sensitiveLevel: "confidential", classification: "security-token", example: "idem_20260709_01", owner: "Order Platform Team" }
      ],
      relationships: ["Refund n..1 Order"],
      constraints: ["amount_cents <= refundable_amount_cents", "unique(order_id, idempotency_key)"],
      dataClassification: "confidential",
      lifecycle: "hot 365 days, archive 10 years",
      lineage: "CreateRefund API and payment callbacks",
      createdAt: now,
      updatedAt: now
    }
  ],
  apis: [
    {
      id: "api-create-refund",
      name: "CreateRefund API Contract",
      method: "POST",
      path: "/api/orders/{orderId}/refunds",
      description: "为已支付订单创建部分退款申请。",
      domainId: "domain-order",
      providerSystem: "Order Service",
      consumers: ["Customer Support Console", "Merchant Portal"],
      requestSchema: { orderId: "string", amountCents: "number", reason: "string", idempotencyKey: "string" },
      responseSchema: { refundId: "string", status: "REQUESTED" },
      errorCodes: ["ORDER_NOT_PAID", "REFUND_AMOUNT_EXCEEDED", "DUPLICATE_IDEMPOTENCY_KEY"],
      authType: "service-jwt + operator-scope:refund.write",
      idempotency: "Required via idempotencyKey; duplicate keys return the original refund.",
      rateLimit: "100 rpm per merchant",
      timeout: "2s",
      compatibilityPolicy: "Backward-compatible additive changes only for public consumers.",
      openapiSpec: "openapi: 3.1.0\npaths:\n  /api/orders/{orderId}/refunds:\n    post:\n      operationId: createRefund",
      exposure: "external",
      createdAt: now,
      updatedAt: now
    }
  ],
  events: [
    {
      id: "event-refund-created",
      name: "RefundCreated Event Contract",
      topic: "order.refund.created",
      eventType: "RefundCreated",
      description: "退款申请创建后发布，支付域据此开始退款处理。",
      domainId: "domain-order",
      producer: "Order Service",
      consumers: ["Payment Service", "Notification Service"],
      schema: { eventId: "string", eventType: "RefundCreated", version: "1.0", timestamp: "string", traceId: "string", refundId: "string", orderId: "string", amountCents: "number" },
      triggerTiming: "After refund row committed",
      idempotencyKey: "refundId",
      orderingRequirement: "Ordered by orderId",
      retryPolicy: "Exponential backoff for 24h",
      deadLetterPolicy: "Route to order.refund.created.dlq after retry exhausted",
      compatibilityPolicy: "Schema evolution is backward compatible within major version.",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "event-refund-succeeded",
      name: "RefundSucceeded Event Contract",
      topic: "order.refund.succeeded",
      eventType: "RefundSucceeded",
      description: "支付系统确认退款成功后，由订单域发布给下游系统。",
      domainId: "domain-order",
      producer: "Order Service",
      consumers: ["Finance Service", "Notification Service"],
      schema: { eventId: "string", eventType: "RefundSucceeded", version: "1.0", timestamp: "string", traceId: "string", refundId: "string", paymentRefundId: "string" },
      triggerTiming: "After payment callback accepted",
      idempotencyKey: "paymentRefundId",
      orderingRequirement: "Ordered by refundId",
      retryPolicy: "Exponential backoff for 72h",
      deadLetterPolicy: "Route to order.refund.succeeded.dlq",
      compatibilityPolicy: "No field removal in v1.",
      createdAt: now,
      updatedAt: now
    }
  ],
  businessRules: [
    {
      id: "rule-refund-amount",
      name: "部分退款金额不能超过可退金额",
      code: "REFUND_AMOUNT_LIMIT",
      description: "单次退款金额与历史退款总额之和不得超过订单已支付金额。",
      domainId: "domain-order",
      ruleType: "amount",
      condition: "order.paidAmountCents - order.refundedAmountCents >= requestedRefundAmountCents",
      action: "Allow refund creation and emit RefundCreated.",
      exception: "Reject with REFUND_AMOUNT_EXCEEDED.",
      examples: ["订单支付 100 元，已退 30 元，本次最多可退 70 元。"],
      relatedAssets: [
        { type: "api", id: "api-create-refund", label: "CreateRefund API Contract" },
        { type: "dataModel", id: "data-refund", label: "退款数据模型" }
      ],
      severity: "high",
      createdAt: now,
      updatedAt: now
    }
  ],
  stateMachines: [
    {
      id: "sm-refund",
      name: "退款状态机",
      description: "管理退款从申请到支付确认的状态迁移。",
      domainId: "domain-order",
      states: ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"],
      transitions: [
        { from: "REQUESTED", to: "PROCESSING", trigger: "RefundCreated", condition: "payment request accepted", action: "call payment refund", emitsEvent: "RefundCreated", idempotent: true, failureHandling: "Retry payment request" },
        { from: "PROCESSING", to: "SUCCEEDED", trigger: "PaymentRefundSucceeded", action: "mark refund succeeded", emitsEvent: "RefundSucceeded", idempotent: true, failureHandling: "Ignore duplicate callback" },
        { from: "PROCESSING", to: "FAILED", trigger: "PaymentRefundFailed", action: "mark refund failed", idempotent: true, failureHandling: "Manual review for inconsistent payment state" }
      ],
      initialState: "REQUESTED",
      terminalStates: ["SUCCEEDED", "FAILED"],
      events: ["RefundCreated", "PaymentRefundSucceeded", "PaymentRefundFailed", "RefundSucceeded"],
      guards: ["amount within refundable balance", "idempotency key unique"],
      actions: ["call payment refund", "emit domain event", "update order refund totals"],
      createdAt: now,
      updatedAt: now
    }
  ],
  integrations: [
    {
      id: "integration-payment-refund",
      name: "订单系统调用支付系统退款",
      description: "订单域通过支付系统退款 API 发起实际资金退款。",
      domainId: "domain-order",
      sourceSystem: "Order Service",
      targetSystem: "Payment Service",
      protocol: "HTTPS REST",
      dataMapping: "refundId -> merchantRefundNo; amountCents -> amount.cents",
      errorMapping: "PAYMENT_TIMEOUT -> retryable; PAYMENT_REJECTED -> business failure",
      sla: "p95 < 800ms for payment request acceptance",
      timeout: "1500ms",
      retryStrategy: "3 attempts with exponential backoff",
      fallbackStrategy: "Queue for async retry and surface PROCESSING state",
      circuitBreaker: "Open after 50% failures over 1 minute",
      owner: "Order Platform Team",
      createdAt: now,
      updatedAt: now
    }
  ],
  qualityRequirements: [
    {
      id: "quality-refund-latency",
      name: "CreateRefund 延迟要求",
      description: "退款创建接口在高峰期仍需快速返回处理状态。",
      assetType: "api",
      assetId: "api-create-refund",
      domainId: "domain-order",
      category: "performance",
      target: "p95 <= 300ms excluding payment provider latency",
      measurement: "API gateway and service histogram",
      priority: "high",
      verificationMethod: "Load test with 300 rps mixed traffic",
      createdAt: now,
      updatedAt: now
    }
  ],
  observabilityDesigns: [
    {
      id: "obs-refund-success-rate",
      name: "退款成功率 Observability Design",
      description: "围绕退款创建、支付调用、支付回调和事件投递建立可观测性。",
      assetType: "api",
      assetId: "api-create-refund",
      domainId: "domain-order",
      metrics: ["refund.create.count", "refund.payment.success_rate", "refund.payment.retry.count", "refund.amount.exceeded.count"],
      logs: ["refundId", "orderId", "idempotencyKeyHash", "paymentRefundId", "failureReason"],
      traces: ["CreateRefund API", "RefundEligibilityService", "PaymentService.refund", "EventPublisher"],
      alerts: ["refund success rate < 98% for 10m", "payment retry count > 100 for 5m"],
      dashboards: ["Order Refund Operations", "Payment Refund Dependency"],
      runbook: "Check payment provider incident status, inspect DLQ, replay failed payment callbacks after deduplication.",
      slo: "99% refunds reach terminal state within 15 minutes.",
      createdAt: now,
      updatedAt: now
    }
  ],
  adrs: [
    {
      id: "adr-no-sync-inventory",
      name: "订单域不直接同步调用库存域",
      title: "订单域不直接同步调用库存域",
      description: "退款流程不引入订单到库存的同步耦合。",
      domainId: "domain-order",
      status: "accepted",
      context: "部分退款只影响资金与订单履约状态，不应在退款主链路中同步阻塞库存域。",
      decision: "订单域通过领域事件通知库存相关流程，不在退款 API 中直接调用库存域。",
      alternatives: ["退款成功后同步调用库存释放接口", "由库存域定时扫描订单退款状态"],
      consequences: ["降低退款链路耦合", "库存补偿需要处理事件延迟", "需要事件幂等消费"],
      constraints: ["RefundSucceeded 事件必须可重放", "库存域不得依赖退款 API 同步响应"],
      relatedAssets: [
        { type: "event", id: "event-refund-succeeded", label: "RefundSucceeded Event Contract" },
        { type: "proposal", id: "proposal-partial-refund", label: "支持订单部分退款 Proposal" }
      ],
      owner: "Architecture Board",
      createdAt: now,
      updatedAt: now
    }
  ],
  proposals: [
    {
      id: "proposal-partial-refund",
      name: "支持订单部分退款 Proposal",
      title: "支持订单部分退款",
      description: "为订单系统增加部分退款能力，支持客服和商家按订单行或指定金额发起退款。",
      domainId: "domain-order",
      background: "现有订单退款只能全额处理，无法覆盖售后补差价、缺货部分退款等场景。",
      goal: "支持在可退金额范围内创建部分退款，并向支付系统发起异步退款。",
      nonGoal: "不支持跨订单合并退款，不改变支付清算账务模型。",
      scope: "订单域、支付集成、退款事件、退款可观测性。",
      impactedAssets: [
        { type: "domain", id: "domain-order", label: "订单领域" },
        { type: "dataModel", id: "data-order", label: "订单数据模型" },
        { type: "dataModel", id: "data-refund", label: "退款数据模型" },
        { type: "api", id: "api-create-refund", label: "CreateRefund API Contract" },
        { type: "event", id: "event-refund-created", label: "RefundCreated Event Contract" },
        { type: "event", id: "event-refund-succeeded", label: "RefundSucceeded Event Contract" },
        { type: "businessRule", id: "rule-refund-amount", label: "部分退款金额不能超过可退金额" },
        { type: "stateMachine", id: "sm-refund", label: "退款状态机" },
        { type: "integration", id: "integration-payment-refund", label: "订单系统调用支付系统退款" },
        { type: "observability", id: "obs-refund-success-rate", label: "退款成功率 Observability Design" },
        { type: "adr", id: "adr-no-sync-inventory", label: "订单域不直接同步调用库存域" }
      ],
      specChanges: ["新增退款表", "新增 CreateRefund API", "新增退款事件", "新增退款状态机"],
      risks: ["高风险：金额计算错误会造成资损", "支付回调重复可能导致状态错乱", "事件投递失败会影响下游通知"],
      rolloutPlan: "先对客服后台灰度，验证支付成功率和对账结果后开放商家入口。",
      rollbackPlan: "关闭 CreateRefund 写入口，保留状态查询与支付回调处理，人工处理已创建退款。",
      status: "reviewing",
      createdAt: now,
      updatedAt: now
    }
  ],
  contextPacks: []
};

export const seededContextPack: ContextPack = {
  id: "ctx-partial-refund",
  name: "支持订单部分退款 Agent Context Pack",
  proposalId: "proposal-partial-refund",
  targetAgent: "Codex",
  summary: "实现订单部分退款能力，重点保护金额、幂等和事件一致性。",
  includedAssets: seedData.proposals[0]!.impactedAssets,
  constraints: ["不要绕过 RefundEligibilityService", "所有写接口必须使用 idempotencyKey", "事件消费者必须幂等"],
  instructions: ["先实现领域规则和数据迁移", "再实现 API 与事件发布", "最后补治理校验和可观测性指标"],
  generatedMarkdown: "",
  createdAt: now
};

seedData.contextPacks.push(seededContextPack);
