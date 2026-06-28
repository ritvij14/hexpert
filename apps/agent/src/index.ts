// Server bootstrap. The Express app lives in ./app.ts (importable in tests);
// this module owns the checkpointer init + app.listen, guarded so importing it
// (e.g. in tests) does not start a server. Runs unchanged locally (tsx dev) and
// on Lambda: the AWS Lambda Web Adapter (ADR-011) boots the app via
// `node dist/index.js` (run.sh), so this module is the main module in both cases
// and `app.listen` starts the HTTP server the adapter proxies Function URL
// events to (PORT, default 8000 on Lambda). SSE frames stream through unchanged
// because the adapter uses Lambda response streaming, not serverless-http's
// buffered invoke.
import { app } from "./app.js";
import { initCheckpointer } from "./checkpointer.js";

export { app };

if (require.main === module) {
  const port = process.env.PORT ?? 3001;
  initCheckpointer()
    .then(() => {
      app.listen(port, () => {
        console.log(`hexpert agent listening on http://localhost:${port}`);
      });
    })
    .catch((err) => {
      console.error("Failed to init HITL checkpointer:", err);
      process.exit(1);
    });
}