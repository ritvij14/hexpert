// PRD §4.3 — extract and validate BYOK headers on every /api/chat request.
// Values are attached to res.locals for the handler; never logged anywhere.
//
// X-Search-Key (Tavily) is OPTIONAL: when present it must be a valid `tvly-`
// key and enables the web_search tool for the QnA intent; when absent, QnA
// falls back to the keyless fetch_eip / decode_4byte tools + parametric
// knowledge. Wallet/audit never used it. PRD §4.3 amended accordingly.
//
// LOCAL-DEV FALLBACK: when running locally (NOT on Lambda), a missing
// X-Api-Key / X-Search-Key falls back to LOCAL_DEV_API_KEY / LOCAL_DEV_SEARCH_KEY
// from .env, so the pipeline can be smoke-tested with curl without pasting keys
// into every request. Guarded by !AWS_LAMBDA_FUNCTION_NAME: on Lambda the env
// vars are never consulted and the BYOK headers are required exactly as PRD §4.3
// specifies. These env vars must NEVER be set in the Lambda environment.

import type { Request, Response, NextFunction } from "express";
import type { Provider } from "@hexpert/shared";

export type ChatLocals = {
  apiKey: string;
  provider: Provider;
  model: string;
  searchKey: string;
};

const VALID_PROVIDERS: Provider[] = ["openai", "anthropic", "openrouter", "ollama"];

// Lambda sets AWS_LAMBDA_FUNCTION_NAME; tsx local dev does not.
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export function extractHeaders(req: Request, res: Response, next: NextFunction): void {
  const provider = req.header("X-Provider");
  const model = req.header("X-Model");
  // Headers take precedence; local-dev env vars fill the gap only off-Lambda.
  const apiKey =
    req.header("X-Api-Key") || (!isLambda ? process.env.LOCAL_DEV_API_KEY ?? "" : "");
  const searchKey =
    req.header("X-Search-Key") || (!isLambda ? process.env.LOCAL_DEV_SEARCH_KEY ?? "" : "");

  if (!apiKey || !provider || !model) {
    res.status(401).json({ error: "Missing required auth headers" });
    return;
  }
  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    res.status(401).json({ error: "Invalid X-Provider" });
    return;
  }
  // Tavily key is optional (see file header). Validate format only when present.
  if (searchKey && !searchKey.startsWith("tvly-")) {
    res.status(401).json({ error: "Invalid X-Search-Key" });
    return;
  }

  res.locals.apiKey = apiKey;
  res.locals.provider = provider as Provider;
  res.locals.model = model;
  res.locals.searchKey = searchKey;
  next();
}