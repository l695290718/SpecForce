# Architecture Overview Home Design

## Intent

Provide a bilingual, concept-led entry page for SpecForge Design Center. The page
explains what the system is, how authored design facts move through the system,
and where a user can begin work. It is an orientation and navigation surface, not
a dashboard and not a cross-application-service reporting view.

The English text is canonical. Chinese is a human-facing localized overlay and
must be complete for every visible concept and navigation label.

## Information Architecture

### Route boundaries

- `/` is the architecture overview home page. It is independent of `scope` and
  does not query, count, join, or display authored assets from any application
  service.
- `/workspace?scope=<applicationServiceId>` is the existing operational
  dashboard. If no scope is supplied, it selects the saved readable application
  service, then the default Designer service.
- Existing asset, graph, proposal, Context Pack, and governance routes remain
  scoped. Links from the home page either go to a scoped workspace or preserve
  the currently selected readable scope when that is already available.

This makes the landing page safe for every user while preserving application
service isolation in operational views.

### Page narrative

The page uses one visual narrative rather than a collection of marketing cards:

1. **Positioning**: SpecForge is the design-fact center for architecture-aware
   agents and people.
2. **Authoring boundary**: MCP is the system-of-record write boundary for ADRs,
   Proposals, Context Packs, and typed links.
3. **Authority and analysis**: PostgreSQL is authoritative for authored facts
   and relationship events; graph storage is a derived projection for impact
   traversal and analysis.
4. **Design-fact flow**: `Proposal -> ADR -> Design assets -> Rules and
   contracts -> Context Pack -> Evidence`.
5. **Asset relationship map**: APIs, data models, events, rules, state
   machines, integrations, quality, and observability are shown as typed design
   assets around the flow. The map is explanatory only; it contains no live
   cross-scope asset data.
6. **Next action**: clear navigation to enter a scoped workspace, view the
   scoped relationship graph, or run scoped governance checks.

## Components

### `ArchitectureOverviewPage`

A server-rendered static route that reads only the locale. It contains the
positioning, architecture layers, fact flow, relationship map, and entry links.
It must not call asset catalog, dashboard, proposal, Context Pack, graph, or
governance data loaders.

### `WorkspaceDashboardPage`

The current dashboard implementation moves from `app/page.tsx` to
`app/workspace/page.tsx`. Its data loading and exact-scope behavior are
preserved. The redirect target for a missing scope becomes `/workspace` with a
resolved `scope` parameter.

### Application shell navigation

The sidebar exposes distinct `Overview` and `Workspace` entries. `Overview`
always points to `/`; `Workspace` points to `/workspace` and carries the
selected scope when one is known. Scope-specific links retain the existing
scope propagation behavior.

### Localization

Add message keys for all architecture-overview copy, labels, and calls to
action. No locale conditionals are allowed in the page markup beyond existing
translation primitives. English is required in the catalog; Chinese completion
is validated by the existing localization checks or a focused equivalent.

## Interaction and Visual Direction

The overview should read as an internal architecture console: calm, precise,
and visibly structured. A single full-width architecture narrative leads the
page. The fact flow uses connected stages with directional links; the asset map
uses labeled typed relationship lines and restrained animation for progressive
disclosure. Motion must respect `prefers-reduced-motion` and must never obscure
text or navigation.

Buttons link only to clear commands. Familiar Lucide icons are used for
navigation affordances. The design remains responsive: the flow and map stack
into a readable vertical sequence on small screens.

## Scope and Access Rules

- The home page must never summarize the number of assets, alerts, proposals,
  or graph relationships across scopes.
- A user enters data-bearing views only through an application service they can
  read. The existing scope switcher and access checks remain authoritative.
- The home page does not introduce the deferred authorized multi-service
  comparison capability.
- Graph, governance, and workspace destinations preserve a selected scope;
  absent selection resolves through the existing readable-scope rule.

## Error Handling

The overview has no data dependency, so it remains usable when a scoped data
source is unavailable. Navigation into a scoped destination relies on that
route's existing authorization and error states. Missing localization keys are
treated as a build/test failure rather than falling back to English silently.

## Verification

After implementation, run one consolidated stage of verification:

1. focused typecheck and lint for the Web application;
2. localization catalog coverage for new overview keys;
3. route tests proving `/` does not invoke scoped data loaders and
   `/workspace` redirects to a readable scope when absent;
4. browser checks at desktop and mobile widths for the overview and scoped
   workspace, including Chinese and English rendering;
5. an exact-scope navigation check for workspace, graph, and governance links.

The required Proposal, ADR or design-record update, Context Pack, typed links,
and evidence must be authored through MCP with the exact owning architecture
scope before the change can be marked complete. If the MCP authority is not
reachable, the repository record must say `MCP synchronization blocked` with
the failure reason and retry trigger.

## Non-goals

- No global dashboard or cross-service asset aggregation.
- No homepage editing workflow.
- No implementation of authorized multi-service comparison.
- No change to PostgreSQL authority or graph-projection consistency semantics.
