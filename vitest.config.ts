// Root test config. Vitest auto-loads vitest.config.ts from the repo root, so
// `npm test` runs every layer for @hexpert/agent. When apps/web gains tests,
// split this into vitest.workspace.ts with one project per workspace (each with
// its own environment — node here, jsdom for the frontend). See
// docs/infra/testing.md.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/agent/test/**/*.test.ts"],
    // Absolute path: Vitest resolves relative setupFiles against the cwd, not
    // the config file, so a relative path silently fails to load.
    setupFiles: [fileURLToPath(new URL("./apps/agent/test/setup.ts", import.meta.url))],
    alias: {
      // Resolve @hexpert/shared to its TS source (the npm-workspace symlink
      // already does this; the alias makes it explicit and robust in the runner).
      "@hexpert/shared": fileURLToPath(
        new URL("./packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
});