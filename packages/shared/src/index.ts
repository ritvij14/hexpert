// @hexpert/shared — shared types for Hexpert.
// Canonical source for every type used across @hexpert/web and @hexpert/agent.
// See docs/prds/prd.md §2 for the spec.

// ---------------------------------------------------------------------------
// Intent & messages
// ---------------------------------------------------------------------------

export type Intent = "qna" | "wallet" | "audit";

export type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type ChatRequest = {
  message: string;
  sessionId: string;
  fileContent?: string;
  fileName?: string;
};

// ---------------------------------------------------------------------------
// Provider config (BYOK — keys live in sessionStorage, never server-side)
// ---------------------------------------------------------------------------

export type Provider = "openai" | "anthropic" | "openrouter" | "ollama";

export type ProviderConfig = {
  provider: Provider;
  apiKey: string;
  model: string;
  searchKey: string;
};

// ---------------------------------------------------------------------------
// Wallet subgraph output
// ---------------------------------------------------------------------------

export type WalletProfile = {
  address: string;
  ensName: string | null;
  /** Human-readable wallet age, e.g. "3 years 2 months". */
  age: string;
  transactionCount: number;
  topContracts: string[];
  tokenHoldings: string[];
  summary: string;
  /** Keyless USD portfolio total (DefiLlama prices + multicall balances). 0 if unavailable. */
  totalUsd?: number;
  /** Top holdings by USD value, for quick display. Deterministic, not LLM-produced. */
  topHoldingsUsd?: { symbol: string; usdValue: number }[];
};

// ---------------------------------------------------------------------------
// Audit subgraph output
// ---------------------------------------------------------------------------

export type AuditSeverity = "high" | "medium" | "low" | "info";

export type AuditFinding = {
  severity: AuditSeverity;
  title: string;
  description: string;
  lineReference: string;
};

export type AuditReport = {
  contractName: string;
  findings: AuditFinding[];
  overallRisk: AuditSeverity | "none";
  summary: string;
};

// ---------------------------------------------------------------------------
// Graph state — the base state for the main LangGraph graph and subgraphs.
// Subgraphs extend this with their own fields (see apps/agent/src/graphs/).
// Per ADR-008 there is no client-held checkpoint: HITL state lives server-side
// in TTL-evicted Redis keyed by thread_id = sessionId.
// ---------------------------------------------------------------------------

export type GraphState = {
  sessionId: string;
  intent: Intent;
  messages: Message[];
  walletAddress?: string;
  fileContent?: string;
  fileName?: string;
  walletProfile?: WalletProfile;
  auditReport?: AuditReport;
  awaitingHITL: boolean;
  hitlPrompt: string;
};

// ---------------------------------------------------------------------------
// Per-message metadata + persistence
// ---------------------------------------------------------------------------

export type MessageMeta = {
  sessionId: string;
  /** UUID */
  messageId: string;
  intent: Intent;
  tokensUsed: { input: number; output: number };
  estimatedCostUsd: number;
  latencyMs: number;
  toolCallCount: number;
  /** Which subgraph handled this turn: "qna" | "wallet" | "audit" | "" */
  subgraphRan: string;
};

export type StoredMessage = Message & {
  meta: MessageMeta;
};

export type SessionStore = {
  sessionId: string;
  createdAt: number;
  messages: StoredMessage[];
};