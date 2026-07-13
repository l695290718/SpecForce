# Proposal, README, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the completed architecture changes as bilingual MCP-native proposals, document the current system accurately, and publish the verified code to `origin/main`.

**Architecture:** Proposal definitions remain reproducible source fixtures and are written to PostgreSQL only through the MCP `upsert_proposal` tool. The root README describes the service-scope authorization model, Web and MCP boundaries, local PostgreSQL workflow, and verified commands. Git publishing includes only project source and documentation, excluding local package caches and unrelated user files.

**Tech Stack:** TypeScript, MCP SDK, Prisma/PostgreSQL, Vitest, Next.js, Git.

## Global Constraints

- Create exactly three proposals: strict application-service isolation, Agent-service workspace, and MCP-native scoped seeding.
- Every proposal includes complete Chinese and English localized content.
- Proposal writes must use `upsert_proposal`; no direct database insertion is allowed.
- Publish to the existing `origin/main` remote without force-push.

---

### Task 1: Define Bilingual Architecture Proposals

**Files:**
- Modify: `prisma/data/specforge-self-design.ts`
- Create: `prisma/data/specforge-self-design.test.ts`

**Interfaces:**
- Produces `architectureChangeProposals: Proposal[]` with three stable IDs and `localizedContent.zh`/`localizedContent.en`.

- [ ] Add a failing test asserting the three proposal IDs, `implemented` status, and complete bilingual fields.
- [ ] Run `node_modules/.bin/vitest.CMD run prisma/data/specforge-self-design.test.ts` and confirm the export is absent.
- [ ] Add the three proposal definitions with impacted asset references, risks, rollout, and rollback.
- [ ] Run the focused test and confirm it passes.

### Task 2: Persist Proposals Through MCP

**Files:**
- Modify: `apps/mcp-server/src/seed.ts`

**Interfaces:**
- Consumes `architectureChangeProposals`.
- Calls `upsert_proposal` once per proposal with the Designer application-service scope.

- [ ] Add the proposal loop to the existing fail-fast MCP seed flow.
- [ ] Run `node_modules/.bin/tsx.CMD apps/mcp-server/src/seed.ts`.
- [ ] Query PostgreSQL and verify all three IDs, localized payloads, and Designer scope.

### Task 3: Rewrite the Root README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents Web, MCP, Core, PostgreSQL, Huawei scope hierarchy, authorization, seed behavior, commands, and deferred multi-service comparison.

- [ ] Replace stale in-memory and allow-all claims with current behavior.
- [ ] Add Windows-friendly setup and MCP examples that include `applicationServiceId` or `architectureScope`.
- [ ] Verify every documented command exists in `package.json`.

### Task 4: Verify and Publish

**Files:**
- Modify: all implementation and documentation files already changed for strict isolation.

**Interfaces:**
- Produces one normal Git commit on `main` and pushes it to `origin/main`.

- [ ] Run focused tests, Web/MCP typechecks, production build, MCP seed, and scoped HTTP checks.
- [ ] Review `git diff --check` and exclude `.pnpm-store/` plus unrelated user files from staging.
- [ ] Commit with `feat: enforce application service isolation`.
- [ ] Pull with rebase if required, push `main`, and verify local HEAD equals `origin/main`.
