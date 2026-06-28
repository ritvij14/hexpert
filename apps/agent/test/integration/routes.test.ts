// Integration layer — the real Express app via supertest, no AWS, no real LLM.
// Proves the route/middleware/CORS wiring without invoking the graph. See
// docs/infra/testing.md.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("Express app routes", () => {
  it("GET /health returns {status:'ok'} with 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET / returns the agent name", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "hexpert-agent" });
  });

  it("POST /api/chat with no BYOK headers returns 401", async () => {
    // extractHeaders reads LOCAL_DEV_* per-request (off-Lambda fallback), so
    // clear them so the middleware rejects regardless of what .env provides.
    const savedKey = process.env.LOCAL_DEV_API_KEY;
    const savedSearch = process.env.LOCAL_DEV_SEARCH_KEY;
    delete process.env.LOCAL_DEV_API_KEY;
    delete process.env.LOCAL_DEV_SEARCH_KEY;
    try {
      const res = await request(app)
        .post("/api/chat")
        .set("Content-Type", "application/json")
        .send({ message: "hi", sessionId: "s1" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Missing required auth headers" });
    } finally {
      if (savedKey !== undefined) process.env.LOCAL_DEV_API_KEY = savedKey;
      if (savedSearch !== undefined) process.env.LOCAL_DEV_SEARCH_KEY = savedSearch;
    }
  });

  it("OPTIONS /api/chat preflight returns 204 and echoes the allowed origin", async () => {
    // ALLOWED_ORIGIN is captured by app.ts at import time; setup.ts sets a
    // default before import, so this value is present.
    const origin = process.env.ALLOWED_ORIGIN;
    expect(origin, "ALLOWED_ORIGIN must be set before app import").toBeTruthy();
    const res = await request(app)
      .options("/api/chat")
      .set("Origin", origin as string)
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });
});