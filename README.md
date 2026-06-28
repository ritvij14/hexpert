# Hexpert

> Full-stack web app. Monorepo: a Next.js web frontend and an Express/Lambda agent backend, sharing a TypeScript `@hexpert/shared` package.
> Purpose and target users: to be finalized — see `CLAUDE.md` Section 1.

---

## Tech Stack

- **Language:** TypeScript 6
- **Runtime:** Node.js LTS
- **Web:** Next.js 16 (app router) + React 19 — `apps/web`
- **Agent:** Express 5 on AWS Lambda via the AWS Lambda Web Adapter (response streaming) — `apps/agent`
- **Local dev (agent):** tsx 4
- **Monorepo:** npm workspaces (`apps/*`, `packages/*`)
- **Shared package:** `@hexpert/shared` (source-only TS, no build step)

---

## Getting Started

```bash
# 1. Install dependencies (sets up workspaces)
npm install

# 2. Copy environment file and fill in values
cp .env.example .env

# 3. Start development servers (web on :3000, agent on :3001)
npm run dev
```

**Requirements:**
- Node.js LTS
- npm (workspaces ship with npm 7+)

**Run apps individually:**
- `npm -w @hexpert/web run dev` — web only
- `npm -w @hexpert/agent run dev` — agent only (tsx watch)
- `npm -w @hexpert/web run build` — web production build

---

## Project Structure

See [`docs/infra/file-tree.md`](docs/infra/file-tree.md) for the full auto-generated file tree.

Core modules:
- `apps/web` — Next.js 16 app-router frontend
- `apps/agent` — Express 5 API; runs locally via tsx and on AWS Lambda via the AWS Lambda Web Adapter (response streaming)
- `packages/shared` — shared types/utilities (`@hexpert/shared`)
- `evals` — placeholder for evaluations

---

## Documentation

Full project documentation lives in:
- [`CLAUDE.md`](CLAUDE.md) — Master context file (alias of `AGENTS.md`) with architecture, conventions, and requirements
- [`docs/features/`](docs/features/) — Feature-specific documentation (templates live here)
- [`docs/infra/`](docs/infra/) — Infrastructure: schema, API contracts, deployment, patterns, decisions, testing

---

## License

To be determined.
