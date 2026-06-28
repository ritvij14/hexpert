// PRD §3.4 — Next.js API gateway. Proxies /api/chat to the agent (Lambda URL)
// and streams the SSE response through to the browser. Local-dev path: when
// LAMBDA_URL points at the local agent (http://localhost:3001), skip SigV4
// signing — the local agent has no IAM auth (ADR-012). SigV4 is for the deployed
// IAM-authed Function URL only and is intentionally NOT implemented here yet.

import type { ChatRequest } from "@hexpert/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Match the 55s upstream timeout (below). Vercel's default serverless function
// timeout is 10s on every plan; raise it so streaming chat isn't killed mid-turn.
// Hobby plan caps at 10s — this value only takes effect on Pro (60s) or higher.
export const maxDuration = 55;

const BYOK_HEADERS = ["x-api-key", "x-provider", "x-model", "x-search-key"];

// Per-field caps (ADR-007). The agent's express.json limit is 3mb.
const MAX_TOTAL = 3_000_000;
const MAX_MESSAGE = 8192;
const MAX_FILE_NAME = 256;
const MAX_FILE_CONTENT = 64 * 1024;

function json(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const lambdaUrl = process.env.LAMBDA_URL;
  if (!lambdaUrl) return json("LAMBDA_URL is not configured on the server.", 500);

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TOTAL) return json("Payload exceeds 3MB limit.", 413);

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return json("Invalid JSON body.", 400);
  }

  if (typeof body.message !== "string" || body.message.length > MAX_MESSAGE) {
    return json("`message` must be a string ≤ 8KB.", 413);
  }
  if (typeof body.sessionId !== "string" || !body.sessionId) {
    return json("`sessionId` is required.", 400);
  }
  if (body.fileName !== undefined) {
    if (typeof body.fileName !== "string" || body.fileName.length > MAX_FILE_NAME) {
      return json("`fileName` must be a string ≤ 256B.", 413);
    }
  }
  if (body.fileContent !== undefined) {
    if (typeof body.fileContent !== "string" || body.fileContent.length > MAX_FILE_CONTENT) {
      return json("`fileContent` must be a string ≤ 64KB.", 413);
    }
  }

  const upstream = new Headers();
  upstream.set("content-type", "application/json");
  for (const h of BYOK_HEADERS) {
    const v = req.headers.get(h);
    if (v) upstream.set(h, v);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const upstreamRes = await fetch(`${lambdaUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: upstream,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Forward auth/validation errors with their status so the client can react
    // (e.g. 401 → prompt to check keys).
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => "");
      return new Response(text || JSON.stringify({ error: `Upstream ${upstreamRes.status}` }), {
        status: upstreamRes.status,
        headers: { "content-type": upstreamRes.headers.get("content-type") ?? "application/json" },
      });
    }
    if (!upstreamRes.body) return json("Upstream returned no body.", 502);
    // Stream the SSE body straight through.
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (controller.signal.aborted) return json("Upstream timed out after 55s.", 504);
    return json(err instanceof Error ? `Upstream unavailable: ${err.message}` : "Upstream unavailable.", 502);
  }
}