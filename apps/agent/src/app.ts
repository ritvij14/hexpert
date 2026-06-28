// The Express application, separated from the server bootstrap so it is
// importable in tests (ESM) without the `require.main === module` listen guard
// in index.ts. index.ts imports `app` and starts the server; run.sh boots
// `node dist/index.js` on Lambda (ADR-011).

import express, { Request, Response } from "express";
import { extractHeaders } from "./middleware/extractHeaders.js";
import { chatRouter } from "./routes/chat.js";

export const app = express();

// PRD §4.2 — 3mb body limit (per-field caps enforced in the chat handler).
app.use(express.json({ limit: "3mb" }));

// PRD §4.2 — CORS locked to ALLOWED_ORIGIN only. No wildcard, no echo.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const CORS_HEADERS = "Content-Type, X-Api-Key, X-Provider, X-Model, X-Search-Key, X-Session-Id";
app.use((req, res, next) => {
  const origin = req.header("Origin");
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ name: "hexpert-agent" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// PRD §4.2 — extractKey middleware before the chat handler.
app.use("/api/chat", extractHeaders, chatRouter);