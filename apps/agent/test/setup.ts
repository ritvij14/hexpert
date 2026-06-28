// Vitest global setup for @hexpert/agent (see docs/infra/testing.md).
//
// Loads local .env files into process.env so tests read config the same way the
// running agent does. `override: false` means a real shell/CI environment
// (e.g. GitHub Secrets in CI) always wins; .env only fills gaps. Locally this
// picks up LOCAL_DEV_API_KEY / LOCAL_DEV_SEARCH_KEY / REDIS_URL; in CI, where
// there is no .env file, those come from the CI environment instead.
//
// Tests always run "off-Lambda": AWS_LAMBDA_FUNCTION_NAME is cleared so the
// BYOK-header middleware's local-dev fallback (extractHeaders.ts) behaves the
// same as `npm -w @hexpert/agent run dev`.
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
const agentEnv = fileURLToPath(new URL("../.env", import.meta.url));
for (const file of [rootEnv, agentEnv]) {
  if (existsSync(file)) loadEnv({ path: file, override: false });
}

// Tests are never on Lambda — keep the local-dev code paths active.
delete process.env.AWS_LAMBDA_FUNCTION_NAME;

// Test-only defaults (shell/CI env and .env still win via override:false above).
// ALLOWED_ORIGIN is captured by app.ts at import time, so it must be set before
// the first test imports the app. The integration OPTIONS test asserts against
// this value.
process.env.ALLOWED_ORIGIN ??= "https://hexpert.ritvij.dev";