#!/bin/bash
# on-session-start.sh
# Called via Claude Code SessionStart hook at the start of every session.
#
# Re-surfaces any OPEN demo-day risks so they stay top of mind. The reminder
# is self-extinguishing: once no "STATUS: OPEN" lines remain in risks.md it
# prints nothing. Resolve an item by marking it STATUS: RESOLVED (with the
# fix) or by deleting it — don't just tolerate the nag.

DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
RISKS="$DIR/docs/infra/risks.md"
AUDIT="$DIR/docs/infra/aws-security-audit.md"

print_open() {
  # $1 = file path, $2 = banner title, $3 = trailing note
  [ -f "$1" ] || return 0
  grep -q "STATUS: OPEN" "$1" || return 0
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║  ⚠  $2  ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  cat "$1"
  echo ""
  echo "────────────────────────────────────────────────────────────────────"
  echo "$3"
  echo "────────────────────────────────────────────────────────────────────"
}

print_open "$RISKS" \
  "OPEN RISKS — docs/infra/risks.md       " \
  "Per AGENTS.md §11 step 5: list every STATUS: OPEN item to the user before starting work this session."

print_open "$AUDIT" \
  "OPEN AWS SECURITY — docs/infra/aws-security-audit.md " \
  "AWS Lambda exposure audit: list every STATUS: OPEN item to the user before starting work this session."
