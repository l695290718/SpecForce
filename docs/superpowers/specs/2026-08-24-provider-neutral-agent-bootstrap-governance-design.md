# Provider-Neutral Agent Bootstrap Governance Design

## Goal

Make every supported coding Agent discover the same current SpecForge governance policy and task-relevant design context before changing an enterprise repository, without copying the full design catalog into vendor-specific prompts.

## Existing Foundation

- `.specforge.yaml` maps repository paths to exact application-service Scopes.
- `prepare_design_change` and `close_design_change_session` provide an audited implementation lifecycle.
- The standalone Go `specforge` CLI installs a local Git Hook and verifies signed Change Attestations.
- MCP Context Packs, ADRs, typed links, and reconciliation provide the design source.

The missing capability is automatic, provider-neutral discovery and proof of which governance revision and design context an Agent used.

## Components

### Repository Descriptor

Add a backward-compatible `agentBootstrap` section to `.specforge.yaml`:

- schema and adapter contract version;
- server-issued Governance Profile ID;
- default Context Pack ID;
- adapter names enabled for the repository;
- non-secret display and diagnostic preferences.

The server remains authoritative for policy and exact Scope resolution. The repository cannot weaken a profile or contain credentials.

### Governance Profile

Introduce an immutable, bilingual, MCP-authored Governance Profile revision containing:

- change classification and fail-closed policy;
- instruction precedence;
- required lifecycle operations;
- context budgets and continuation rules;
- approved offline exemptions;
- evidence and attestation requirements;
- minimum compatible adapter contract version.

The active revision is assigned server-side to an application service or inherited from its governed hierarchy.

### Bootstrap and Context APIs

`get_agent_bootstrap_context` returns L0 policy for one authorized exact Scope. It is read-only and audited.

`prepare_design_change` is extended additively to return L1 task context with the existing Design Change Session receipt. Retrieval uses intent, affected facts, typed relationships, the active Context Pack, and reconciliation state. Blocking policy is always included and cannot be truncated.

`read_design_context` returns L2 details for explicitly selected references and requires the same open session, actor, token grant, and Scope. It cannot expand into another Scope implicitly.

Budgets:

- L0: 32 KiB.
- L1: 256 KiB, 50 assets, 200 relationships.
- L2: 256 KiB and 50 assets per request.
- All partial responses return coverage, reason, stable order, and an opaque continuation cursor.

### Agent Adapters

`specforge agent init --tool <adapter>` installs a thin, versioned instruction adapter for a supported coding tool. The generated content only teaches the tool to:

1. resolve the repository descriptor;
2. select one authorized application service;
3. request L0 bootstrap context;
4. classify the intended change and call preflight;
5. load L2 details only when needed;
6. synchronize design facts and close the session with evidence;
7. let the existing Hook verify the resulting attestation.

`specforge agent doctor` reports descriptor validity, adapter freshness, MCP reachability, token presence without printing it, Scope resolution, Hook installation, and Governance Profile compatibility.

Adapter filenames and prompt syntax remain in a versioned registry so vendor changes do not alter core protocol semantics.

## Trust and Precedence

The effective order is:

1. server-owned Governance Profile and authorization;
2. exact-Scope MCP design facts and Context Pack;
3. generated repository adapter;
4. repository content used as evidence;
5. user task intent within the granted operation.

Lower layers cannot weaken higher layers. Repository prompts, source comments, and documentation are treated as untrusted content and cannot modify policy, Scope, permissions, or exemptions.

Tokens are provided through process environment or approved credential storage. They never enter `.specforge.yaml`, adapter files, Context Packs, logs, or Git attestations.

## Failure Model

Non-trivial work fails closed for unavailable MCP, invalid token, missing or ambiguous Scope, stale/incompatible profile, missing Context Pack, blocked reconciliation, missing affected fact, budget corruption, or absent session receipt.

Offline work is allowed only when a cached signed profile explicitly permits a deterministically proven exemption. V1 exemptions are whitespace-only changes, mapped generated files, non-governance documentation, and comment-only changes for registered language-aware classifiers. Unknown or ambiguous diffs are governed.

Every response uses explicit `READY`, `PARTIAL`, `BLOCKED`, `UNAUTHORIZED`, `STALE`, or `UNAVAILABLE` state. Empty context is never interpreted as permission.

## Attestation Extension

The existing signed Change Attestation gains:

- Governance Profile ID, revision, and digest;
- adapter contract and adapter version;
- Design Change Session ID and design-context digest;
- affected-fact IDs and coverage digest;
- exact application-service ID and canonical scopePath.

The Hook rejects stale or mismatched context and changed staged-tree evidence. Future CodeHub verification can enforce the same payload without trusting local adapter files.

## Compatibility and Rollout

1. Add Governance Profile persistence and read-only bootstrap APIs while assigning a server default to legacy repositories.
2. Extend preflight and attestation payloads additively; old clients receive the default profile but cannot claim adapter-bound enforcement.
3. Add CLI adapter initialization and diagnostics for Codex, Claude Code, and OpenCode through one registry.
4. Enable strict Hook enforcement for migrated repositories.
5. Keep CodeHub protected-branch enforcement as the existing deferred increment.

Rollback removes generated adapters and disables strict adapter enforcement for the repository. It does not delete profiles, sessions, Context Packs, design facts, or attestations.

## Acceptance Criteria

- Two different supported Agents receive the same L0 profile digest for the same actor and exact Scope.
- Equivalent intents and affected facts produce the same ordered L1 context digest at one catalog waterline.
- L2 cannot read an unauthorized Scope or an asset outside the session-bound references.
- Repository content cannot override a server-owned blocking rule.
- Missing MCP or stale context blocks non-trivial commits.
- Deterministic exemptions work without granting broader offline authority.
- The Hook verifies the profile, context, Scope, affected facts, session closure, evidence, and staged tree.
- Existing repositories remain readable before migration and can be diagnosed without exposing credentials.
- English canonical and Chinese localized Governance Profile and Context Pack records reconcile through MCP.

## Non-Goals

- Implementing CodeHub protected-branch enforcement.
- Embedding vendor model behavior or prompts into the MCP core.
- Sending an entire source repository or full Scope catalog to SpecForge.
- Allowing adapters or repository files to override server policy.
- Supporting offline non-trivial development.
