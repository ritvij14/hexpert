# Hexpert

A demo-first educational tool that showcases AI agent architecture to a developer audience at an Ethereum community event. Single unified chat interface — the agent routes and handles everything.

Built with LangChain and LangGraph on an Express/Lambda backend, proxied through a Next.js frontend deployed on Vercel.

---

## What you can do

| Capability | How to trigger | What happens |
|---|---|---|
| **Ethereum QnA** | Ask any Ethereum question | LangChain chain → web search → streamed answer |
| **Wallet analysis** | Paste an address or ENS name | Parallel fetch (ENS, txns, tokens) → HITL checkpoint → deep-dive of your choice → synthesis |
| **Smart contract audit** | Upload a `.sol` file | Parallel vulnerability checks (reentrancy, access control, overflow, …) → HITL checkpoint → follow-up action → final report |

HITL (human-in-the-loop) checkpoints pause graph execution mid-run and ask you for direction before continuing.

---

## BYOK — Bring Your Own Key

Your API key never touches our servers. On first use, enter:
- **Provider** — OpenAI, Anthropic, OpenRouter, or Ollama
- **Model** — the model string you want (e.g. `gpt-4o`, `claude-opus-4-5`)
- **LLM API key** — stored in `sessionStorage`, cleared when you close the tab
- **Tavily search key** — optional; enables web search in the QnA path

Keys are sent over HTTPS on every request via headers and discarded immediately after the LLM call.

---

## Tech Stack

- **Language:** TypeScript 6
- **Runtime:** Node.js LTS
- **Web:** Next.js 16 (app router) + React 19 — `apps/web`, deployed on Vercel
- **Agent:** Express 5 on AWS Lambda via the AWS Lambda Web Adapter (response streaming) — `apps/agent`
- **Orchestration:** LangChain (QnA) + LangGraph (wallet + audit subgraphs, HITL)
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

**Requirements:** Node.js LTS, npm 7+

**Run apps individually:**
- `npm -w @hexpert/web run dev` — web only
- `npm -w @hexpert/agent run dev` — agent only (tsx watch)
- `npm -w @hexpert/web run build` — web production build

---

## Project Structure

See [`docs/infra/file-tree.md`](docs/infra/file-tree.md) for the full auto-generated file tree.

```
apps/web/       — Next.js 16 frontend + /api/chat gateway (proxies to Lambda)
apps/agent/     — Express 5 + LangGraph agent (runs locally or on Lambda)
packages/shared — shared TypeScript types (@hexpert/shared)
evals/          — real-LLM eval suite (router, qna, wallet, audit)
infrastructure/ — AWS SAM template for Lambda deployment
```

**Evals:** `npm run eval` runs all four suites. `npm run eval:report` opens a dashboard at `http://localhost:4321` showing pass/fail, latency, token usage, and streamed answers for every trace in `evals/.runs/`.

---

## Documentation

- [`AGENTS.md`](AGENTS.md) — master context: architecture, conventions, decisions
- [`docs/prds/prd.md`](docs/prds/prd.md) — full product requirements
- [`docs/features/`](docs/features/) — per-feature documentation
- [`docs/infra/`](docs/infra/) — testing, decisions, API contracts, deployment

---

## License

To be determined.
