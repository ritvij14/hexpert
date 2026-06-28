# Hexpert

> **Master context file. Single source of truth for this project. All docs/ files are modules that extend this. README.md is a public-facing summary derived from this.**

---

## 1. Project Identity

**Name:** Hexpert
**Purpose:** Add more info when the necessary details are ready.
**Type:** Full-Stack Web App (monorepo: web + agent)
**Primary Users:** Add more info when the necessary details are ready.
**Stage:** Idea / MVP
**Repo:** Add more info when the necessary details are ready.

---

## 2. Tech Stack

> Do not contradict this section anywhere else. If a technology decision changes, update here first.

Always be clear on the major release of the tech stack being used, and link the documentation to that version in this section.

**Language:** TypeScript
**Runtime / Platform:** Node.js (LTS) — local dev; agent targets AWS Lambda (runtime version TBD)
**Framework:** Next.js 16 (app router) for `apps/web`; Express 5 for `apps/agent`, deployed on AWS Lambda via the AWS Lambda Web Adapter (response streaming — ADR-011)
**State Management:** Zustand v5 (`apps/web` only)
**Styling:** Tailwind CSS v4 (`apps/web` only)
**Package Manager:** npm (workspaces)

**Versioned docs:**

- Next.js V16 — https://nextjs.org/docs
- React V19 — https://react.dev
- Express V5 — https://expressjs.com/en/5x/api.html
- AWS Lambda Web Adapter — https://github.com/aws/aws-lambda-web-adapter (response streaming)
- TypeScript V6 — https://www.typescriptlang.org/docs/
- tsx V4 — https://github.com/privatenumber/tsx
- Zustand V5 — https://zustand.docs.pmnd.rs
- Tailwind CSS V4 — https://tailwindcss.com

**Data:**

- Primary store: IndexedDB (client-side, `apps/web` only) — conversation history only; the Lambda backend is stateless, and HITL checkpoint state lives server-side in TTL-evicted Redis keyed by `sessionId` (ADR-008), not client-side
- Search: None yet
- Cache: None yet
- File storage: None yet

**Infrastructure:**

- Hosting: `apps/agent` on AWS Lambda; `apps/web` on Vercel (Next.js API Routes act as the server-side gateway, proxying to Lambda)
- Cloud provider: AWS (agent) — add more info when ready
- CI/CD: None yet

**Auth:** None yet — add more info when ready
**Queue / Jobs:** None yet
**Testing:** Vitest 4 (`npm test` from repo root) — see `docs/infra/testing.md`

**Key External Integrations:**

- Add more info when the necessary details are ready.

---

## 3. Repository Structure

> Auto-generated summary of top-level structure. Full tree in `docs/infra/file-tree.md`.
> Updated automatically when top-level directories change.

```
├── .agents
│   ├── skills
│   └── hooks.json
├── .claude
│   ├── skills -> ../.agents/skills
│   ├── settings.json -> ../.agents/hooks.json
│   └── settings.local.json
├── .codex
│   ├── skills -> ../.agents/skills
│   └── hooks.json -> ../.agents/hooks.json
├── apps
│   ├── agent
│   └── web
├── docs
│   ├── design
│   ├── features
│   ├── infra
│   ├── prds
│   └── demo-runbook.md
├── evals
│   ├── .runs
│   ├── lib
│   ├── .gitkeep
│   ├── audit.eval.ts
│   ├── qna.eval.ts
│   ├── README.md
│   ├── render-report.ts
│   ├── router.eval.ts
│   └── wallet.eval.ts
├── infrastructure
│   ├── .aws-sam
│   ├── README.md
│   ├── samconfig.toml
│   └── template.yaml
├── packages
│   └── shared
├── scripts
│   ├── generate-tree.sh
│   ├── on-session-start.sh
│   └── on-session-stop.sh
├── .env.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md -> AGENTS.md
├── package-lock.json
├── package.json
├── README.md
└── vitest.config.ts
```

---

## 4. Architecture Overview

> How this system is structured at a high level. For deep dives, see docs/features/ and docs/infra/ (to be created when needed).

**Pattern:** Monorepo (npm workspaces)

**Core modules and what each owns:**

- `apps/web` — Next.js 16 app-router frontend
- `apps/agent` — Express 5 API; runs locally via tsx and on AWS Lambda via the AWS Lambda Web Adapter (response streaming — ADR-011)
- `packages/shared` — shared types/utilities, importable as `@hexpert/shared`

**Data flow (happy path):**

1. Add more info when the necessary details are ready.

**Key architectural decisions:**

> For full reasoning on each decision, see `docs/infra/decisions.md` (to be created when needed).

- Monorepo via npm workspaces: one tree, `@hexpert/shared` importable by both apps.
- `@hexpert/shared` is source-only TS (no build step): consumed via `transpilePackages` in web and directly by tsx in agent.
- Agent entry (`apps/agent/src/index.ts`) starts the Express server (`app.listen` on `PORT`); it runs unchanged locally (tsx) and on Lambda, where the AWS Lambda Web Adapter fronts the HTTP server and streams Function URL events through (response streaming — ADR-011). No `serverless-http`.

---

## 5. Conventions

> The Coding Agent (Codex/Claude) must follow these at all times. These are non-negotiable.

### Naming

- Add more info when the necessary details are ready (defaults: files kebab-case, types/interfaces PascalCase, functions/vars camelCase, env vars SCREAMING_SNAKE_CASE).

### Code Style

- Write as little code as possible to accomplish the task.
- Only do things you are more than 90% sure about. If unsure, use the AskUserQuestion tool to ask a series of MCQ questions before writing any code.
- No over-complication. Prefer simple, obvious solutions over clever abstractions. If a simpler approach exists, take it.

### Code Structure

- **All business logic lives in _Zustand Stores_ as actions.** Components are UI-only — no logic, no `useEffect` for side effects. State and business logic live in feature-scoped stores under `apps/web/stores/`.
- **Single `updateAppState(partial)` for all state updates** — no individual setters.
- **Store actions access state via `get()`** — never require state as parameters.
- **`constants/`, if and when needed, is pure data only** — no functions, no business logic.
- **Store cleanup convention:** For every action that acquires a resource, there must be a corresponding action that releases it. Example acquire/release pair: `startStream`/`stopStream`.
- Before writing a `useEffect`, check the policy below. Most cases should be a ref callback, event handler, or store action instead.
- **Living rule:** When a new global pattern or constraint is established that applies across all features (not just one), add it here immediately — do not wait until session end.

### useEffect Policy

> See also: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

Before writing a `useEffect`, check which category it falls into:

1. **Derived state** — Use `useMemo`, a plain `const`, or CSS. Never an effect.
2. **Syncing React to an external system** (pushing a ref/state to a store) — Use ref callbacks or event handlers. Never an effect.
3. **"Do X when Y changes"** — Trigger from the event that _caused_ the change, not from observing the change. Move to a store action.
4. **Subscribing to external event sources** (resize, WebSocket, beforeunload) — Legitimate, but prefer `useSyncExternalStore` or a custom hook. If a `useEffect` is truly needed, it must only exist at the React/browser boundary.

**Self-review checklist:**

- Can this be a ref callback instead?
- Can this be triggered by the user action that caused the state change?
- Am I watching state just to call another action? (anti-pattern)
- Does this have proper cleanup for every resource it acquires?

**Code review rule:** If Claude encounters a `useEffect` while reading or reviewing code, flag it with which category (1–4) it falls into and whether it should be refactored.

### Module Boundaries

- Never import from another feature's internal files. Cross-feature access goes through that feature's public API (index.ts / barrel file). If no public API exists, create one before importing.
- See `docs/infra/patterns.md` → Cross-Feature Access (to be created when needed).

### Critical Paths — Confirm Before Modifying

> Files listed here are load-bearing. Do not refactor, rename, or change their interfaces without explicit user confirmation.

- Add more info when the necessary details are ready.

### File Navigation

- For files exceeding ~500 lines, add a navigation comment block at the top of the file listing key sections with line ranges. Keep it updated when the file changes significantly.
- Format: `// === NAVIGATION === // L1-50: Exports and types // L120-200: Core processing // L450-500: Error handling`
- **The Coding Agent (Codex/Claude): when reading a file >500 lines, read only the first 50 lines first to check for a `NAVIGATION` block. Use it to read only the relevant section instead of the full file.**

### Error Handling

- Add more info when the necessary details are ready.

### Testing

- Full testing philosophy, taxonomy, and workflow: see `docs/infra/testing.md` — read it before writing any tests.
- Three layers required: unit (pure logic), integration (routes → service → database), flow (multi-step user journeys).
- Every endpoint needs: happy path, input validation, and authorization tests at minimum.
- Mock only at the external boundary (email, payment, third-party APIs). Never mock your own database in integration tests.
- Test names read as user-facing descriptions: `"returns 403 when agent accesses another agent's contact"`.
- Runner: `npm test` / `npm run test:watch` / `npm run test:coverage` (Vitest 4). Layer-specific commands and the eval harness live in `docs/infra/testing.md`.

### Git

- Add more info when the necessary details are ready.

### Other

- Add more info when the necessary details are ready.

---

## 6. Environment & Configuration

**Environment files:**

- `.env` — local development (never committed)
- `.env.example` — committed, shows all required keys without values (currently empty)

**Required environment variables:**

```
# None yet — add more info when the necessary details are ready.
```

**Key configuration files:**

- `package.json` (root) — npm workspaces config + root `dev` script
- `apps/web/tsconfig.json` — web TypeScript config
- `apps/web/next.config.mjs` — Next.js config (transpiles `@hexpert/shared`)
- `apps/agent/tsconfig.json` — agent TypeScript config
- `packages/shared/tsconfig.json` — shared TypeScript config

---

## 7. Development Setup

> How to get this running from scratch.

```bash
# 1. Install dependencies (sets up workspaces)
npm install

# 2. Copy environment file and fill in values
cp .env.example .env

# 3. Start development servers (web + agent concurrently)
npm run dev
```

**Key scripts:**

- `npm run dev` — runs web + agent concurrently (web on :3000, agent on :3001)
- `npm -w @hexpert/web run dev` — web only (Next.js dev)
- `npm -w @hexpert/web run build` — web production build
- `npm -w @hexpert/agent run dev` — agent only (tsx watch)
- `bash scripts/generate-tree.sh` — regenerate file tree in docs/infra/file-tree.md (script to be created when needed)

---

## 8. Project Requirements (PRDs)

> PRDs live as standalone files in `docs/prds/` (to be created when needed). Never embed requirements in this file — write a PRD document instead.

**How to use PRDs:**

- Starting a project: write your PRD in `docs/prds/prd.md`.
- Adding a feature later: write a focused PRD in `docs/prds/<feature-name>.md`.
- Add more info when the necessary details are ready.

**Writing good PRDs:**

- Write requirements as clear functional statements: "Users can filter contacts by tag" — not "The experience should feel intuitive".
- Include explicit dependencies between features.
- Keep each PRD focused on one scope (the whole project, or one feature area).

### PRD Index

> Add rows as PRDs are created.

| PRD | Scope | Status |
| --- | --- | --- |
| Add more info when the necessary details are ready. | | |

---

## 9. Feature Documentation Index

> Each feature has its own doc in docs/features/. Read the relevant doc before working on a feature.
> When a feature doc exceeds ~400 lines, it is promoted to a directory (docs/features/[feature]/).

| Feature | Doc | Status |
| --- | --- | --- |
| Agent Architecture | `docs/features/agent-architecture.md` | Stable |
| Web Frontend | `docs/features/frontend.md` | Stable |
| Add more info when the necessary details are ready. | | |

---

## 10. Infrastructure Documentation Index

> Cross-cutting infrastructure docs (to be created when needed). Referenced by feature docs when needed.

| Topic | Doc |
| --- | --- |
| File tree | docs/infra/file-tree.md |
| Architecture decisions | docs/infra/decisions.md |
| Database schema | docs/infra/schema.md |
| API contracts | docs/infra/api-contracts.md |
| Deployment | docs/infra/deployment.md |
| Patterns | docs/infra/patterns.md |
| Testing | docs/infra/testing.md |
| Open risks | docs/infra/risks.md |

---

## 11. Working With The Coding Agent (Codex/Claude) Code

> Instructions The Coding Agent (Codex/Claude) must follow in every session.

**At the start of every session:**

1. Read this file fully.
2. Understand what to work on — check with the user if the current task is unclear.
3. Read the relevant feature doc from `docs/features/` for the current task.
4. Read relevant infra docs only if the task touches that infra layer.
5. **Re-surface open risks:** before starting work, read `docs/infra/risks.md` and list every `STATUS: OPEN` item to the user. If the current task touches an open risk, say so explicitly and don't quietly work around it. (This file is also auto-printed at session start by the `SessionStart` hook — `scripts/on-session-start.sh` — and goes silent once no `STATUS: OPEN` lines remain.)

**Context Loading Rules**

NEVER load all feature docs at once. Load ONLY:

1. This file (CLAUDE.md) — always
2. The ONE feature doc relevant to the current task — always
3. Infra docs ONLY if the task explicitly touches that layer

For tasks that span multiple features, load the PRIMARY feature doc (the one being modified most) fully. For secondary features, load only their Data Model and Dependencies sections.

**How to find the right feature doc for a task:**

- Feature doc filenames match the feature area in kebab-case — e.g. "Contact Management" → `docs/features/contact-management.md`
- If a feature has been promoted to a directory, the index is at `docs/features/[feature-name]/README.md`
- Cross-reference Section 9 (Feature Documentation Index) if the mapping is unclear.

If unsure which feature doc to load, ask before loading anything.

**Before starting any task:**

- Check task dependencies — never work on a task whose dependency is not done.
- If the task is ambiguous, read the feature doc before asking for clarification.
- If a task is large or complex, break it into subtasks first — do not start implementation on the parent task directly. Work through the subtasks.

**New Chat Session Rule:**
Before exploring code or doing any work in a fresh chat session, read this file and the key feature documentation first. Do NOT use explore tools immediately — use the documentation to understand the codebase first.

**Documentation Discrepancy = Urgent:**
If you discover any documentation that contradicts actual code behavior, STOP immediately and report to user. This is high-priority — fix the documentation before anything else. Do not continue working on any other task until resolved.

**During a session:**

- Keep task/progress tracking up to date — do not leave work in stale states.
- The moment you discover something that changes how a future task should be implemented, stop and record it BEFORE continuing. Do not defer this. Stale task descriptions compound.

**Failure Recovery (5-Retry Limit):**
If any tool, command, or sub-agent fails 5 times consecutively, STOP immediately:

1. Report to user: "Hit 5-retry limit on [operation]. Need your help to proceed."
2. Wait for user input — do not attempt anything else.

**At the end of every session:**

- Mark completed work as done.
- Update any future tasks affected by discoveries made this session.
