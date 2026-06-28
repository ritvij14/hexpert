# Hexpert — UI Design Prompt (v1)

> Self-contained prompt for AI design tools.
> Grounded in the Hexpert PRD. The product is a demo/teaching tool for a live
> Ethereum-community audience — design for technical credibility, not consumers.

---

## 1. What Hexpert is

Hexpert is a developer-facing AI agent for an Ethereum developer community. From one unified chat, a user can:

- **Ask** Ethereum/Solidity questions (answered with cited doc sources),
- **Analyse** a wallet address (ENS, activity, holdings, then a chosen deep-dive),
- **Audit** an uploaded `.sol` smart contract (parallel vulnerability checks, then a chosen follow-up).

The agent routes between three intents invisibly behind a single chat — there are no modes, tabs, or screens to switch. The user just types (and optionally attaches a `.sol` file).

It is a **demo and educational tool**, shown live on stage at a small Ethereum hackathon/community event. Audience: developers, builders, Web3 engineers. It must feel like something a senior developer would actually build and use — not a consumer app.

---

## 2. Audience & tone

- Developers, not general consumers. Web3-native: comfortable with terminals, dark UIs, hex addresses, Solidity.
- Expects precision, density, technical credibility over friendliness.
- Closer to a dev tool (Linear, Vercel dashboard, Warp terminal) than a consumer product (Notion, ChatGPT).
- No marketing language, no hero sections, no landing-page elements.

---

## 3. Design direction

**Dark mode only.** No light mode.

**Aesthetic:** technical, minimal, slightly futuristic. Terminal-meets-modern-dev-tool. Not cyberpunk, not neon-heavy — understated and precise. Sharp or subtly-rounded corners (not pillowy). Dense but breathable.

**Color palette:**
- Deep dark background, near-black (not pure black). Slightly lighter surface for cards/panels.
- Muted primary accent — Ethereum-adjacent but not the cliché ETH-blue. Consider muted teal, indigo, or slate. Use sparingly for interactive emphasis only.
- **Severity colors must be readable and distinct** — used for audit findings: red (high), amber (medium), green (low/info-safe), slate/grey (info).
- On-chain data (wallet addresses, tx hashes, token amounts) rendered in monospace with a terminal-native tint (muted green or amber) — subtle, not glowing.

**Typography (exactly two typefaces):**
- UI chrome & copy: a clean geometric sans (Inter, Geist, or similar).
- Code, addresses, hashes, Solidity snippets: a monospace (Geist Mono, JetBrains Mono, or similar).
- Never mix more than two.

---

## 4. Layout

Single-page application. No route navigation, no mode switching. Everything lives on one screen.

```
┌──────────────────────────────────────────────────────────────┐
│  HEXPERT                                            ⚙ settings│  top bar: wordmark left, gear right
├──────────┬───────────────────────────────────────────────────┤
│ + New   │                                                   │
│ chat    │           conversation thread                     │
│          │                                                   │
│ THREADS  │   [user msg]                                       │
│ • What..│   [assistant msg + intent tag]                     │
│ • Audit..│   [wallet profile card / audit findings card]      │
│ • vitalik│   [HITL question + option chips]                  │
│          │                                                   │
│          ├───────────────────────────────────────────────────┤
│          │  📎  Message Hexpert…                       Send   │  input bar
└──────────┴───────────────────────────────────────────────────┘
```

- **Left sidebar = thread list** (see §6). Not optional. Collapsible for the talk if more horizontal room is needed, but it is the primary navigation between conversations.
- **Main area = the active conversation thread.** This is the primary surface.
- **Input bar pinned to bottom of the main area:** text input + paperclip (`.sol` attach) + send button. Attached file shows as a chip above/beside the input.

---

## 5. Key screens & states

### 5.1 Empty — first ever load (no threads, no keys)

BYOK onboarding gate. No threads exist yet. Single, on-brand, non-error call to action:
- One-liner of what Hexpert does and example prompts ("Ask about gas, paste a wallet, or drop a `.sol` to audit.")
- Primary CTA: "Configure keys" → opens settings panel (§5.7).
- Chat input is visible but disabled with a hint ("Add your API keys to start").

### 5.2 Empty — returning user (threads exist, keys cleared on tab close)

The "remember chats, never credentials" state. This is a distinct, important screen — get it right or it reads as a bug.
- Left sidebar shows the saved thread list (populated).
- No active thread / "New chat" empty state in main area.
- Chat input disabled. A clear, calm banner/notice in the main area:
  **"Your conversations are saved on this device. Add your API keys to resume — keys are never stored."**
- CTA: "Configure keys" → settings panel.

### 5.3 Active chat — QnA mode

User asked an Ethereum question; agent is responding with a cited text answer.
- User message bubble (right-aligned, subdued background — be consistent throughout).
- Assistant message (left-aligned, slightly different surface, no avatar or a minimal hex glyph).
- **Intent tag** on each assistant message: a small pill `Q&A` / `WALLET` / `AUDIT` — so the audience can see which path the router chose. Muted, not loud.
- **Streaming:** tokens appear as they generate (SSE-style), not a static spinner. Show a streaming cursor while generating. (Streaming is a hard requirement for v1 — a blank screen for 10–30s is demo death.)
- Source citations rendered cleanly as footnote/link chips under or within the answer.

### 5.4 Active chat — Wallet analysis (HITL checkpoint)

The most important screen. Agent did an initial wallet analysis and is pausing for direction.

- **Wallet profile card** rendered as a structured full-width card in-thread (not a text blob): ENS name, wallet age, transaction count, token holdings (compact), one-line summary.
- Below the card: the agent's HITL message — a question with options **DeFi positions / NFT activity / Governance / Full summary**.
- Options render as **selectable chips** (multi-select allowed for wallet deep-dive). Selected chips take the accent color; unselected are outlined.
- The user may also just type their choice in the input. Clicking a chip populates/sends the reply.
- After the user picks and the agent resumes, render the deep-dive results as a continuation of the same thread. A subtle "thinking" indicator that implies multi-step/parallel processing (not a plain spinner) while deep-dive nodes run.

### 5.5 Active chat — Audit mode (HITL checkpoint)

User attached a `.sol` file; agent ran parallel vulnerability checks and presents initial findings.

- **Findings card** in-thread: compact list of vulnerabilities, each row = severity badge + title + line reference.
  - HIGH: red filled · MEDIUM: amber filled · LOW: green outlined/muted · INFO: slate outlined.
- **Overall risk indicator** prominently displayed (HIGH / MEDIUM / LOW) at the top of the card.
- Below the card: HITL question "What would you like me to do next?" with single-select options **Generate fix / Show exploit scenario / Full report only** (same chip style as wallet, but single-select).
- After the user picks, the follow-up renders in-thread. Code (fixes, exploit walkthroughs) renders in a Solidity-highlighted code block (§5.8).

### 5.6 File-attached state (pre-send)

User clicked the paperclip and chose a `.sol`. Before sending:
- Attached file as a chip near the input: file icon + filename (truncate long names) + dismiss (×) button.
- Send button stays the primary action — the file rides along with the next message.
- **Validation error state:** if the file is not `.sol` or exceeds 50KB, show an inline error chip/message near the input ("`.sol` files only, max 50KB") and block send until resolved or dismissed.

### 5.7 Settings panel

Triggered by the gear icon. Slide-over, modal, or inline drawer — whichever is most native to the dev-tool aesthetic. Exactly four fields:

- **Provider** — segmented control or styled select: `OpenAI` / `Anthropic` / `OpenRouter` / `Ollama` (label Ollama plainly — it is the user's local Ollama, not a hosted cloud).
- **LLM API key** — password input with show/hide toggle.
- **Model** — text input (user types e.g. `gpt-4o-mini`, `claude-sonnet-4-6`, `kimi-k2.6`).
- **Tavily API key** — password input with show/hide toggle, clearly labelled "Web Search Key".

Notice below the fields: **"Keys are sent over HTTPS and never stored on our servers. They are cleared when you close this tab. Your conversations are saved on this device only."**

Save button (primary). No cancel — closing the panel discards unsaved changes. Optional: a "Clear all conversations" destructive action at the bottom of the panel (deletes the IndexedDB thread store), styled muted/danger.

### 5.8 Code block component

- Solidity syntax highlighting.
- Line numbers.
- Copy button.
- Dark background even within the dark UI (a touch deeper than the card surface).

---

## 6. Thread sidebar (multi-session)

The left sidebar is the conversation switcher — it is **not** mode navigation (there are no modes).

- **"+ New chat"** button at the top (primary, accent-outlined). Disabled until keys are configured.
- **Thread list:** each row = truncated first user message as the label + a relative timestamp. Active thread highlighted with the accent (left border or surface tint).
- **Per-thread actions on hover:** delete (×). Optional rename is out of scope for v1 — labels are derived from the first user message.
- **Empty sidebar state:** a muted "No conversations yet" line.
- The sidebar reflects conversations stored locally in IndexedDB. It persists across tab/browser close. Keys do not (see §5.2).
- Do **not** add an analytics/cost panel to the sidebar — per-message cost/analytics display is out of scope for v1.

---

## 7. Component specs

**Message bubbles**
- User: right-aligned, subdued surface.
- Assistant: left-aligned, slightly different surface, minimal/no avatar.
- Structured responses (wallet profile, audit findings) break out of the bubble and render as full-width cards in the thread.

**Intent tags**
- Small pill on assistant messages: `Q&A`, `WALLET`, `AUDIT`. Muted, monospace optional.

**Severity badges**
- HIGH: red, filled. MEDIUM: amber, filled. LOW: green, outlined/muted. INFO: slate, outlined.

**HITL option chips**
- Clearly interactive — distinct from body text. Wallet = multi-select. Audit = single-select.
- States: unselected (outlined), selected (accent fill), hover, disabled.

**Loading/streaming**
- Streaming cursor on the in-progress assistant message. No elaborate skeletons.
- For wallet/audit parallel phases: a subtle multi-step "thinking" indicator (e.g., animated step labels like "Fetching ENS · Txns · Tokens…") — implies parallelism, not a generic spinner.

**Error states (in-thread)**
- Render errors as an assistant-style message with a muted red/danger accent:
  - 401 → "Couldn't authenticate. Check your API keys." + "Open settings" link.
  - 413 → "That file or request is too large (50KB limit)."
  - 502 / timeout → "The agent didn't respond in time. Try again."

---

## 8. What to avoid

- No light mode.
- No mode-switching navigation — there are no modes; the sidebar is for *conversations* only.
- No stacked modal overlays.
- No marketing language, hero sections, or landing-page elements.
- No emojis in UI chrome (only within agent-generated text if contextually apt).
- No pillowy/over-rounded everything — sharp or subtly rounded is more dev-native.
- No elaborate loading skeletons.
- No drag-and-drop upload zone as a separate area — the paperclip in the input is the only file entry point.
- No analytics/cost dashboard — out of scope for v1.

---

## 9. Deliverables expected

1. Full-screen design for each of: §5.1 (no threads, no keys), §5.2 (threads exist, no keys), §5.3 (QnA streaming), §5.4 (wallet HITL), §5.5 (audit HITL), §5.6 (file attached), §5.7 (settings open).
2. Thread sidebar states: empty, populated (active highlight), hover (delete affordance).
3. Chat input states: idle, file-attached, file-rejected (wrong type / >50KB), disabled (no keys).
4. HITL chips: unselected, selected, hover, disabled — for both multi-select (wallet) and single-select (audit).
5. Audit findings card in isolation (with overall-risk indicator + per-finding severity badges).
6. Wallet profile card in isolation.
7. Code block component (Solidity, line numbers, copy button).
8. In-thread error states (401 / 413 / 502).
9. Color palette + typography reference sheet (two typefaces only; severity colors; on-chain-data monospace tint).
