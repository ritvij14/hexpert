#!/bin/bash
# Pack @hexpert/agent into a Lambda deployment zip for the AWS Lambda Web
# Adapter (ADR-011 / PRD §7.2). Layout the adapter expects at the zip root:
#   run.sh          — the handler (boots `node dist/index.js`)
#   dist/           — compiled TypeScript (produced by `tsc` in build:lambda)
#   package.json    — so npm can resolve deps
#   node_modules/   — production dependencies only
# All current deps are pure JS (no native/.node bindings), so a node_modules
# produced on macOS/arm64 runs correctly on Linux/x86_64 Lambda.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$PKG_DIR/lambda-pkg"
ZIP="$PKG_DIR/dist-lambda.zip"

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

cp -R "$PKG_DIR/dist" "$STAGE/dist"
cp "$PKG_DIR/run.sh" "$STAGE/run.sh"
chmod +x "$STAGE/run.sh"
cp "$PKG_DIR/package.json" "$STAGE/package.json"

# @hexpert/shared is a workspace package (not published) and is imported ONLY
# as `import type { ... }` — TypeScript erases those, so dist/ has zero runtime
# references to it (verified). Strip it from the staged deps so `npm install`
# does not 404 against the public registry. Nothing to bundle.
node -e '
  const fs = require("fs");
  const file = process.argv[1];
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  if (p.dependencies) delete p.dependencies["@hexpert/shared"];
  fs.writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
' "$STAGE/package.json"

# Production deps only; --ignore-scripts so no postinstall runs (we already
# built dist/ via tsc). Requires network on the dev machine.
cd "$STAGE"
npm install --omit=dev --ignore-scripts --no-audit --no-fund

cd "$PKG_DIR"
( cd "$STAGE" && zip -rq "$ZIP" run.sh dist package.json node_modules -x '*.DS_Store' )
echo "Packed Lambda deployment zip: $ZIP"