// Flow layer — a full /api/chat turn through the Express app with the two
// external boundaries mocked, so it runs deterministically with no keys and no
// network:
//   - LLM boundary:  createLLM → FakeListChatModel (LangChain's built-in fake)
//   - Redis boundary: getCheckpointer → MemorySaver (in-memory checkpointer)
// See docs/infra/testing.md → Flow layer.
import { describe, it, expect, vi, beforeAll } from "vitest";

// vi.mock factories are hoisted above imports, so they cannot reference values
// that are initialised by top-level imports. Use hoisted holders populated in
// beforeAll (which runs after imports).
const llmHolder = vi.hoisted(() => ({ current: undefined as unknown }));
const cpHolder = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("../../src/utils/llmFactory.js", () => ({
  // responses[0] → intent classifier returns "qna"; responses[1] → QnA answer.
  createLLM: () => llmHolder.current,
}));
vi.mock("../../src/checkpointer.js", () => ({
  initCheckpointer: () => Promise.resolve(),
  getCheckpointer: () => cpHolder.current,
}));

import { FakeListChatModel } from "@langchain/core/utils/testing";
import { MemorySaver } from "@langchain/langgraph";
import { app } from "../../src/app.js";
import { runTurn, intentIs, hasDone, noError } from "../eval/harness.js";

const headers = {
  "X-Provider": "openai",
  "X-Model": "gpt-test",
  "X-Api-Key": "test-key",
  "X-Search-Key": "tvly-test",
};

beforeAll(() => {
  llmHolder.current = new FakeListChatModel({
    responses: ["qna", "Ethereum is a decentralized blockchain."],
  });
  cpHolder.current = new MemorySaver();
});

describe("QnA flow (mocked LLM, in-memory checkpointer)", () => {
  it("routes a general question to qna and completes the SSE stream", async () => {
    const frames = await runTurn(app, {
      sessionId: "qna-flow-1",
      message: "What is Ethereum?",
      headers,
    });
    // Robust invariants (do not depend on whether tokens stream):
    expect(noError(frames).pass).toBe(true);
    expect(intentIs("qna")(frames).pass).toBe(true);
    expect(hasDone(frames).pass).toBe(true);
  });
});