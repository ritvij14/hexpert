// PRD §4.5b — per-request LLM client factory.
// Created per request from res.locals values; never at module level, never
// persisted, never logged.

import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import type { Provider } from "@hexpert/shared";

export type CreateLLMParams = {
  provider: Provider;
  apiKey: string;
  model: string;
};

export function createLLM({ provider, apiKey, model }: CreateLLMParams) {
  switch (provider) {
    case "openai":
      return new ChatOpenAI({ model, apiKey });
    case "openrouter":
      // OpenRouter is OpenAI-compatible; point the client at its baseURL.
      return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
      });
    case "anthropic":
      return new ChatAnthropic({ model, apiKey });
    case "ollama":
      // Ollama Cloud remote API (ADR for R1): Bearer token in Authorization header.
      return new ChatOllama({
        model,
        baseUrl: "https://ollama.com",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}