// Unit tests for the eval harness itself (pure — no app, no network).
import { describe, it, expect } from "vitest";
import {
  parseSse,
  intentIs,
  tokensContain,
  toolCalled,
  hitlSuspended,
  hasDone,
  noError,
  type SseFrame,
} from "./harness.js";

const SAMPLE_SSE = [
  'data: {"type":"token","text":"Ethereum "}',
  'data: {"type":"token","text":"is a chain."}',
  'data: {"type":"tool","name":"web_search"}',
  'data: {"type":"meta","meta":{"sessionId":"s1","intent":"qna","messageId":"m1","tokensUsed":{"input":1,"output":4},"estimatedCostUsd":0,"latencyMs":12,"toolCallCount":1,"subgraphRan":"qna"}}',
  "data: [DONE]",
  "",
].join("\n\n");

describe("parseSse", () => {
  it("parses token/tool/meta frames and the [DONE] sentinel", () => {
    const frames = parseSse(SAMPLE_SSE);
    expect(frames.map((f) => f.type)).toEqual(["token", "token", "tool", "meta", "done"]);
  });

  it("ignores comment lines and non-JSON payloads", () => {
    const weird = ": keepalive\n\ndata: not-json\n\ndata: {\"type\":\"token\",\"text\":\"x\"}\n\n";
    expect(parseSse(weird).map((f) => f.type)).toEqual(["token"]);
  });
});

describe("scorers", () => {
  const frames: SseFrame[] = parseSse(SAMPLE_SSE);

  it("intentIs matches the meta intent", () => {
    expect(intentIs("qna")(frames).pass).toBe(true);
    expect(intentIs("wallet")(frames).pass).toBe(false);
  });

  it("tokensContain matches a substring of concatenated tokens", () => {
    expect(tokensContain("is a chain")(frames).pass).toBe(true);
    expect(tokensContain("bitcoin")(frames).pass).toBe(false);
  });

  it("toolCalled matches a tool name", () => {
    expect(toolCalled("web_search")(frames).pass).toBe(true);
    expect(toolCalled("etherscan")(frames).pass).toBe(false);
  });

  it("hitlSuspended is false when no hitl frame is present", () => {
    expect(hitlSuspended(frames).pass).toBe(false);
  });

  it("hasDone and noError hold on a clean stream", () => {
    expect(hasDone(frames).pass).toBe(true);
    expect(noError(frames).pass).toBe(true);
  });

  it("noError fails when an error frame is present", () => {
    const err = parseSse('data: {"type":"error","error":"boom"}\n\ndata: [DONE]\n\n');
    expect(noError(err).pass).toBe(false);
  });
});