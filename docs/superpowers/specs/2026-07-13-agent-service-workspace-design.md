# Agent Service Workspace Design

## Goal

Replace the current global dashboard with a scoped workspace for one active
Agent and one active application service. Support one Agent working across
multiple authorized services without mixing its drafts, activity, and task state.

## Model

`AgentServiceWorkspace` is identified by `(agentId, applicationServiceId)`.
It stores the active workspace state, recent assets, draft references, pending
work, and generation history. Design assets, proposals, contracts, and graph
relations remain shared service-level facts and are never copied into a personal
workspace.

The default Agent is `specforge-default-agent`; its default service is
`com.huawei.celon.desiner`. The Agent may switch to any readable service, but
only the Designer service is writable in the initial mock grants.

## Dashboard Views

- **Agent workspace:** default home view. Counts and lists are filtered by both
  active service and the Agent's readable scope. It shows recent work and pending
  actions owned by the active `(agent, service)` pair.
- **Service workspace:** a service-level view for shared assets, proposals,
  governance, graph, and impact analysis. It is not personalized except for
  authorization and selected service.
- **Platform overview:** an administrator-only aggregate. It can summarize all
  product families and services, but never becomes the default Agent dashboard.

## Authorization

All reads are filtered by the active Agent's inherited read grants. Writes need
an inherited write grant on an application service. Cross-service impact results
include a target only when the Agent can read both endpoint scopes.

## Persistence

Add `AgentServiceWorkspace` with `agentType`, `agentId`,
`applicationServiceId`, `recentAssetIds`, `pendingTasks`, `draftIds`,
`generationHistory`, `createdAt`, and `updatedAt`. The initial MVP may persist
the structured collections as JSON, while service scope remains normalized and
indexed. A unique constraint covers `(agentType, agentId, applicationServiceId)`.

## Acceptance Criteria

- Changing service updates dashboard totals and recent work to that service only.
- Returning to a service restores its Agent-specific workspace state.
- Service-level assets are not duplicated per Agent.
- A read-only service does not show persistent write actions.
- Platform overview is separate from the default Agent home page.

## Deferred Features

- **Authorized multi-service comparison:** an explicit view that lets an Agent
  compare or aggregate only the application services for which it has read
  grants. This is deferred from the MVP. Until it is implemented, every normal
  dashboard, catalog, search result, and graph is bound to exactly one selected
  application service; cross-service results appear only in explicit impact
  analysis.
