import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function promptResult(description: string, text: string) {
  return {
    description,
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text }
      }
    ]
  };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "design_feature",
    {
      title: "Design feature",
      description: "Guide an agent from natural-language requirement to proposal, impact analysis, context pack, and governance checks.",
      argsSchema: {
        applicationServiceId: z.string(),
        locale: z.enum(["en", "zh"]).optional(),
        requirement: z.string(),
        domainHint: z.string().optional()
      }
    },
    ({ applicationServiceId, locale, requirement, domainHint }) =>
      promptResult(
        "Design a feature through SpecForge MCP tools.",
        [
          "You are using SpecForge Design Center as the MCP-native source of design truth.",
          `Requirement: ${requirement}`,
          `Application service: ${applicationServiceId}`,
          `Locale: ${locale ?? "en"}`,
          domainHint ? `Domain hint: ${domainHint}` : undefined,
          "",
          "Workflow:",
          "1. Clarify business goal, actors, constraints, and success metrics.",
          "2. Evaluate system knowledge readiness with evaluate_system_knowledge_readiness, then read only the bounded facts returned by read_system_knowledge using the exact application-service architectureScope.",
          "3. Use search_design_assets only as a compatibility fallback; obey the configured legacy-read enforcement mode.",
          "4. Identify domain model, data model, API/event changes, business rules, state machines, and non-functional requirements.",
          "5. Create a complete English-canonical Proposal with localizedContent.zh and the exact application-service architectureScope using create_proposal.",
          "6. Run analyze_proposal_impact in the same application-service scope.",
          "7. Generate a Context Pack with generate_context_pack in the same application-service scope.",
          "8. Run run_governance_checks in the same application-service scope and report unresolved warnings.",
          "Do not execute arbitrary code or invent asset ids without checking SpecForge first."
        ]
          .filter(Boolean)
          .join("\n")
      )
  );

  server.registerPrompt(
    "review_design_proposal",
    {
      title: "Review design proposal",
      description: "Review a SpecForge proposal for impact, missing assets, risks, and governance.",
      argsSchema: { applicationServiceId: z.string(), locale: z.enum(["en", "zh"]).optional(), proposalId: z.string() }
    },
    ({ applicationServiceId, locale, proposalId }) =>
      promptResult(
        "Review a proposal with SpecForge MCP tools.",
        `Review proposal ${proposalId} in application service ${applicationServiceId} with locale ${locale ?? "en"}. Use scoped asset tools/resources, run analyze_proposal_impact and run_governance_checks with the same applicationServiceId, then summarize missing design assets, risks, and recommended next changes.`
      )
  );

  server.registerPrompt(
    "generate_api_contract",
    {
      title: "Generate API contract",
      description: "Draft API contract changes from a proposal.",
      argsSchema: { proposalId: z.string() }
    },
    ({ proposalId }) => promptResult("Draft API contract", `Use proposal ${proposalId} and related assets to draft an API contract. Include method, path, auth, idempotency, request/response schemas, error codes, compatibility policy, and tests.`)
  );

  server.registerPrompt(
    "generate_event_contract",
    {
      title: "Generate event contract",
      description: "Draft event contract changes from a proposal.",
      argsSchema: { proposalId: z.string() }
    },
    ({ proposalId }) => promptResult("Draft event contract", `Use proposal ${proposalId} and related assets to draft event contracts. Include topic, producer, consumers, schema envelope, ordering, retry, DLQ, compatibility, and idempotency.`)
  );

  server.registerPrompt(
    "model_data",
    {
      title: "Model data",
      description: "Generate or improve data model details.",
      argsSchema: { proposalId: z.string().optional(), assetId: z.string().optional() }
    },
    ({ proposalId, assetId }) => promptResult("Model data", `Model data for ${proposalId ? `proposal ${proposalId}` : `asset ${assetId ?? "the current design"}`}. Include fields, meaning, classification, constraints, lifecycle, lineage, and state references.`)
  );

  server.registerPrompt(
    "generate_test_plan",
    {
      title: "Generate test plan",
      description: "Generate test suggestions from design assets.",
      argsSchema: { proposalId: z.string().optional(), assetId: z.string().optional() }
    },
    ({ proposalId, assetId }) => promptResult("Generate test plan", `Generate a test plan for ${proposalId ? `proposal ${proposalId}` : `asset ${assetId ?? "the selected design"}`}. Cover unit, contract, event schema, state machine, integration, observability, rollback, and governance checks.`)
  );

  server.registerPrompt(
    "generate_coding_context",
    {
      title: "Generate coding context",
      description: "Generate Codex implementation context from a proposal.",
      argsSchema: { applicationServiceId: z.string(), locale: z.enum(["en", "zh"]).optional(), proposalId: z.string() }
    },
    ({ applicationServiceId, locale, proposalId }) => promptResult("Generate Codex context", `Generate coding context for Codex from proposal ${proposalId} in application service ${applicationServiceId} with locale ${locale ?? "en"}. Call generate_context_pack with the same applicationServiceId and targetAgent=codex, then produce implementation tasks, tests, constraints, and do-not rules.`)
  );

  server.registerPrompt(
    "browse_3a_architecture",
    {
      title: "Browse 3A architecture",
      description: "Navigate the published BIZ, SYS, and TECH architecture projection without reading mutable current-state facts.",
      argsSchema: { applicationServiceId: z.string(), scopePath: z.string(), baselineId: z.string().optional(), locale: z.enum(["en", "zh"]).optional() }
    },
    ({ applicationServiceId, scopePath, baselineId, locale }) => promptResult(
      "Browse a governed 3A architecture projection through SpecForge MCP.",
      [
        "Use the exact architectureScope for every call; do not infer or broaden Scope.",
        `Architecture service: ${applicationServiceId}`,
        `Scope path: ${scopePath}`,
        `Locale: ${locale ?? "en"}`,
        baselineId ? `Requested baseline: ${baselineId}` : "First list official published baselines.",
        "Workflow:",
        "1. Call list_3a_published_baselines and choose an official immutable baseline.",
        "2. Call list_3a_projection_manifests and use a published 3a.v2 manifest.",
        "3. Use search_3a_architecture_facts with bounded paging and an optional BIZ/SYS/TECH filter.",
        "4. Use get_3a_architecture_fact for bilingual fact detail and evidence, then trace_3a_architecture_path for bounded impact paths.",
        "5. Use get_3a_alignment for explicit cross-layer relationships and compare_3a_published_baselines for immutable drift.",
        "Never pass currentAssertionIds to the new drift operation, and never treat a graph projection as authoritative."
      ].join("\n")
    )
  );

  server.registerPrompt(
    "implementation_preflight",
    {
      title: "Implementation preflight",
      description: "Read the exact Scope design context and open a governed change session before coding.",
      argsSchema: {
        applicationServiceId: z.string(),
        scopePath: z.string(),
        intent: z.string(),
        affectedFactIds: z.string(),
        expectedEvidenceRefs: z.string()
      }
    },
    ({ applicationServiceId, scopePath, intent, affectedFactIds, expectedEvidenceRefs }) => promptResult(
      "Prepare and close a governed implementation session.",
      [
        "Before changing code, call prepare_design_change with the exact architectureScope.",
        `Scope: ${applicationServiceId} (${scopePath})`,
        `Intent: ${intent}`,
        `Affected facts: ${affectedFactIds}`,
        `Expected evidence: ${expectedEvidenceRefs}`,
        "Do not implement if the receipt is missing, the affected fact is absent, or reconciliation is BLOCKED.",
        "Record the returned sessionId. After focused verification, call close_design_change_session with CONVERGED and command/result evidence, or BLOCKED with a reason and retry trigger.",
        "Keep repository ADRs and MCP ADR/Proposal/Context Pack/design facts synchronized in the same exact Scope."
      ].join("\n")
    )
  );
}
