# API Contracts

> **Complete API reference for Hexpert.**
> Feature docs link here for full endpoint details.
> This is the contract — it defines what the API promises to clients.
> Last updated: 2026-06-26

---

## Global Conventions

**Base URL:** `http://localhost:3001` (local `apps/agent`) · deployed Lambda URL TBD
**Auth:** BYOK — every request carries provider credentials in headers (see below). No server-side session or token.
**Content-Type:** `application/json` for request bodies.
**Response:** `POST /api/chat` responds with a Server-Sent Events stream (`text/event-stream`); each event is `data: <json>\n\n`, terminated by `data: [DONE]\n\n`. Non-stream errors (auth, body-cap) are plain JSON.
**Dates:** ISO 8601 format — `YYYY-MM-DDTHH:mm:ssZ`

**Non-stream error response (plain JSON):**
```json
{
  "error": "Human readable message"
}
```

---

## Endpoints

---

### Agent Endpoints

#### `POST /api/chat`

**Description:** Single streaming endpoint for all agent turns (QnA, wallet, audit). New turns invoke the main graph; if a suspended HITL checkpoint exists in Redis for this `sessionId`, the graph resumes the suspended subgraph directly (router skipped) via `Command({ resume: message })`.
**Auth:** BYOK headers (required)
**Feature doc:** [`docs/features/agent-architecture.md`](../features/agent-architecture.md)

**Request headers (BYOK — keys live in `sessionStorage` client-side, never logged server-side):**

| Header | Required | Description |
|---|---|---|
| `X-Provider` | yes | One of `openai`, `anthropic`, `openrouter`, `ollama` |
| `X-Model` | yes | Model id for the chosen provider (e.g. `gpt-4.1-mini`, `claude-haiku-4-5`, `glm-5.2:cloud`) |
| `X-Api-Key` | yes | API key for the provider. Off-Lambda, falls back to `LOCAL_DEV_API_KEY` if absent. |
| `X-Search-Key` | yes | Tavily key, must start with `tvly-`. Off-Lambda, falls back to `LOCAL_DEV_SEARCH_KEY`. Required on every request even though only QnA uses web search. |

**Request body (`ChatRequest`):**
```json
{
  "message": "string — required — the user's text (≤ 8KB)",
  "sessionId": "string — required — identifies the thread; reused across a HITL suspend→resume",
  "fileContent": "string — optional — Solidity source for an audit turn (≤ 64KB)",
  "fileName": "string — optional — e.g. \"Vulnerable.sol\" (≤ 256B)"
}
```

Per-field caps are enforced by the Next.js gateway (ADR-007): `Content-Length` pre-check rejects > 3MB; `message` ≤ 8KB, `fileName` ≤ 256B, `fileContent` ≤ 64KB. (`checkpointState` is no longer sent by the client — ADR-008.)

**Response `200` — SSE stream.** Frame types, in arrival order:

| Frame | Shape | When |
|---|---|---|
| `token` | `{"type":"token","text":"…"}` | Partial assistant text from `on_chat_model_stream` (QnA answer, wallet deep-dive/final-synthesis prose, audit fix/exploit prose). |
| `tool` | `{"type":"tool","name":"…"}` | A tool was invoked (`on_tool_start`) — e.g. `web_search`, `fetch_transactions`, `fetch_contract_source`. (`record_audit_findings` and `record_wallet_profile` are intercepted, never invoked, so they never emit this frame.) |
| `hitl` | `{"type":"hitl","question":"…","options":["…","…"]}` | The graph suspended at a HITL `interrupt()` (e.g. audit `hitlCheckpoint`). `options` are the exact strings the client must send back as the next `message` on the same `sessionId`. |
| `report` | `{"type":"report","auditReport":{...}}` | `finalReport` produced a structured `AuditReport`. Emitted on resume turns that complete the audit; `finalReport` is deterministic (no LLM call), so the report is never streamed as `token` frames. |
| `meta` | `{"type":"meta","meta":MessageMeta}` | Terminal per-turn metadata. Exactly one per turn. |
| `[DONE]` | literal `data: [DONE]` | End of stream. |
| `error` | `{"type":"error","error":"…"}` | Mid-stream failure, followed by `[DONE]`. |

`MessageMeta`:
```json
{
  "sessionId": "string",
  "messageId": "uuid",
  "intent": "qna | wallet | audit",
  "tokensUsed": { "input": 0, "output": 0 },
  "estimatedCostUsd": 0,
  "latencyMs": 0,
  "toolCallCount": 0,
  "subgraphRan": "qna | wallet | audit"
}
```

**New turn vs. resume (same endpoint, same `sessionId`):**
- **New turn:** send `message` (+ `fileContent`/`fileName` for audit). Router classifies intent; the appropriate subgraph runs; if it hits an `interrupt()`, the stream ends after a `hitl` frame + `meta` + `[DONE]` (checkpoint suspended in Redis, keyed by `thread_id = sessionId`).
- **Resume:** send the chosen `hitl` option text as `message` on the **same `sessionId`**, no `fileContent`. The handler detects the suspended checkpoint (`getState().next` non-empty), resumes via `Command({ resume: message })` (router skipped), and streams the follow-up to completion. If the checkpoint TTL has lapsed, the request is treated as a fresh turn.
- No `checkpointState` is ever sent by the client or returned by the server (ADR-008).

**Errors:**

| HTTP | Frame | When |
|---|---|---|
| 401 | plain JSON `{"error":"Missing required auth headers"}` | Any required header missing/invalid, or `X-Search-Key` not `tvly-`-prefixed. |
| 413 | plain JSON (field-specific message) | `Content-Length` > 3MB or a field exceeds its per-field cap. |
| 200 | SSE `{"type":"error",…}` + `[DONE]` | Mid-stream failure (e.g. audit analysis did not produce valid findings after retry). |

**Proxying:** In the deployed path the browser calls the Next.js gateway (`apps/web/app/api/chat/route.ts`), which validates headers/body size and streams the request through to Lambda. Locally, curl hits `apps/agent` directly on `:3001`.

---

## Webhooks

> None. Hexpert sends no webhooks.

---

## Rate Limits

> None imposed by the app. Provider-side rate limits apply to the user's own BYOK key.