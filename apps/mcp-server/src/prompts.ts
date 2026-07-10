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
        requirement: z.string(),
        domainHint: z.string().optional()
      }
    },
    ({ requirement, domainHint }) =>
      promptResult(
        "Design a feature through SpecForge MCP tools.",
        [
          "You are using SpecForge Design Center as the MCP-native source of design truth.",
          `Requirement: ${requirement}`,
          domainHint ? `Domain hint: ${domainHint}` : undefined,
          "",
          "Workflow:",
          "1. Clarify business goal, actors, constraints, and success metrics.",
          "2. Search existing assets with search_design_assets.",
          "3. Identify domain model, data model, API/event changes, business rules, state machines, and non-functional requirements.",
          "4. Create a Proposal with create_proposal.",
          "5. Run analyze_proposal_impact.",
          "6. Generate a Context Pack with generate_context_pack.",
          "7. Run run_governance_checks and report unresolved warnings.",
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
      argsSchema: { proposalId: z.string() }
    },
    ({ proposalId }) =>
      promptResult(
        "Review a proposal with SpecForge MCP tools.",
        `Review proposal ${proposalId}. Read specforge://proposals/${proposalId}, run analyze_proposal_impact, run_governance_checks, and summarize missing design assets, risks, and recommended next changes.`
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
      argsSchema: { proposalId: z.string() }
    },
    ({ proposalId }) => promptResult("Generate Codex context", `Generate coding context for Codex from proposal ${proposalId}. Call generate_context_pack with targetAgent=codex, then produce implementation tasks, tests, constraints, and do-not rules.`)
  );
}
