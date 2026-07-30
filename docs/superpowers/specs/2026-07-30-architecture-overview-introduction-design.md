# Architecture Overview Introduction Design

## Intent

Evolve the existing SpecForge architecture overview at `/` into a modern,
bilingual product introduction. Its job is to explain the product model and
guide a visitor to the correct scoped work surface. It is not a dashboard,
marketing landing page, or a source of cross-application-service metrics.

English copy remains canonical. Chinese remains a complete human-facing
overlay through the existing localization catalog.

## Design Direction

Use a bright engineering-blueprint surface with one deep ink architecture
canvas. The canvas is the signature visual: a staged design-fact flow from
Change through Proposal, ADR, design assets, governance, Context Pack, and
evidence. It makes the product lifecycle legible before a visitor chooses a
scoped destination.

The surrounding page remains calm and information-dense. It uses structural
rules, labels, and typed node groups instead of nested promotional cards.

## Page Narrative

1. The hero canvas states the product purpose and visualizes the governed flow
   of design facts. It contains the scoped workspace, graph, and governance
   destinations.
2. A concise three-part explanation presents MCP-native authoring, scoped
   ownership, and PostgreSQL-authoritative graph projection.
3. A typed asset constellation presents APIs, data models, events, rules,
   state machines, integrations, quality, and observability as related design
   concepts. It is explanatory, never live cross-scope data.
4. The final navigation path makes the next user action clear while preserving
   a selected `scope` parameter for data-bearing routes.

## Interaction And Motion

- On initial load, the canvas stages reveal in lifecycle order with small,
  staggered vertical movement.
- Connectors use a low-contrast directional signal to suggest fact flow.
- Asset nodes respond to keyboard focus and hover by raising their contrast and
  emphasizing their local typed relationship, without hiding text or changing
  layout.
- Motion is decorative only: no destination or state depends on an animation.
- `prefers-reduced-motion: reduce` disables all continuous and entrance motion
  while preserving the final visual hierarchy and keyboard navigation.

## Boundaries

- The overview continues to make no asset, proposal, Context Pack, graph, or
  dashboard loader calls.
- It shows no authored-fact counts, alerts, relationships, or metrics from any
  application-service scope.
- Scoped entry links keep the selected application-service scope exactly as
  supplied by existing `overviewDestinations` behavior.
- No editing is added; design records remain MCP-authored.

## Components

- `ArchitectureOverviewPage` owns semantic page structure and localized copy.
- Small presentational components own the lifecycle stage and asset-node
  rendering, keeping links, semantics, and motion classes explicit.
- Overview-specific CSS owns the canvas, responsive topology, focus treatment,
  and reduced-motion behavior. Existing global shell styles remain unchanged.

## Failure Handling

This remains static and usable when scoped data services are unavailable.
Broken scoped destinations are handled by their existing routes. Missing
translation keys and malformed scoped links remain test failures.

## Verification

Run one consolidated verification stage after implementation:

1. overview route and destination unit tests;
2. Web lint and focused test suites;
3. localization coverage for every new human-facing key;
4. desktop and mobile browser screenshots in English and Chinese;
5. a reduced-motion browser check and a scope-preserving link check.

The existing ADR, Proposal, Context Pack, evidence record, and typed links for
the architecture overview must be updated through MCP in the exact Designer
Scope and read back before this change is considered complete.

## Non-goals

- No global metrics or a cross-scope dashboard.
- No live graph traversal in the overview.
- No editing workflow or separate visual asset service.
- No change to PostgreSQL authority, graph projection, or scope authorization.
