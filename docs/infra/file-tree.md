# File Tree

> **Auto-generated. Do not edit manually.**
> Updated automatically after every Claude Code session via the `Stop` and `SubagentStop` hooks.
> To regenerate manually: `bash scripts/generate-tree.sh`
> Last generated: 2026-06-28 11:19:55 UTC

---

```
/Users/ritvij14/Desktop/Projects/hexpert
├── .agents
│   ├── skills
│   │   ├── deploy
│   │   │   └── SKILL.md
│   │   ├── git-push
│   │   │   └── SKILL.md
│   │   └── wrap-up
│   │       └── SKILL.md
│   └── hooks.json
├── .claude
│   ├── skills -> ../.agents/skills
│   ├── settings.json -> ../.agents/hooks.json
│   └── settings.local.json
├── .codex
│   ├── skills -> ../.agents/skills
│   └── hooks.json -> ../.agents/hooks.json
├── apps
│   ├── agent
│   │   ├── docs
│   │   │   └── infra
│   │   │       └── file-tree.md
│   │   ├── lambda-pkg
│   │   │   ├── package-lock.json
│   │   │   ├── package.json
│   │   │   └── run.sh
│   │   ├── scripts
│   │   │   └── pack-lambda.sh
│   │   ├── src
│   │   │   ├── chains
│   │   │   │   └── qnaChain.ts
│   │   │   ├── graphs
│   │   │   │   ├── auditGraph.ts
│   │   │   │   ├── auditSchema.ts
│   │   │   │   ├── mainGraph.ts
│   │   │   │   ├── state.ts
│   │   │   │   ├── walletGraph.ts
│   │   │   │   └── walletSchema.ts
│   │   │   ├── middleware
│   │   │   │   └── extractHeaders.ts
│   │   │   ├── routes
│   │   │   │   └── chat.ts
│   │   │   ├── spikes
│   │   │   │   └── audit-hitl-spike.ts
│   │   │   ├── tools
│   │   │   │   ├── blockscout.ts
│   │   │   │   ├── contractFetcher.ts
│   │   │   │   ├── decode4byte.ts
│   │   │   │   ├── ens.ts
│   │   │   │   ├── etherscan.ts
│   │   │   │   ├── etherscanRateLimit.ts
│   │   │   │   ├── fetchEip.ts
│   │   │   │   ├── fileReader.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── portfolio.ts
│   │   │   │   ├── snapshot.ts
│   │   │   │   └── webSearch.ts
│   │   │   ├── utils
│   │   │   │   ├── llmFactory.ts
│   │   │   │   └── sanitise.ts
│   │   │   ├── app.ts
│   │   │   ├── checkpointer.ts
│   │   │   └── index.ts
│   │   ├── test
│   │   │   ├── eval
│   │   │   │   ├── harness.test.ts
│   │   │   │   └── harness.ts
│   │   │   ├── flow
│   │   │   │   └── qna.test.ts
│   │   │   ├── integration
│   │   │   │   └── routes.test.ts
│   │   │   ├── unit
│   │   │   │   └── sanitise.test.ts
│   │   │   └── setup.ts
│   │   ├── .env.example
│   │   ├── dist-lambda.zip
│   │   ├── package.json
│   │   ├── run.sh
│   │   └── tsconfig.json
│   └── web
│       ├── app
│       │   ├── api
│       │   │   └── chat
│       │   │       └── route.ts
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components
│       │   ├── AuditReportView.tsx
│       │   ├── ChatInput.tsx
│       │   ├── ChatStream.tsx
│       │   ├── CodeBlock.tsx
│       │   ├── DesignSystem.tsx
│       │   ├── Header.tsx
│       │   ├── HITLChips.tsx
│       │   ├── Markdown.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── SettingsDrawer.tsx
│       │   ├── Sidebar.tsx
│       │   ├── WalletProfileView.tsx
│       │   └── WebSearchActivity.tsx
│       ├── lib
│       │   ├── file.ts
│       │   ├── hitl.ts
│       │   ├── idb.ts
│       │   └── sse.ts
│       ├── stores
│       │   └── chatStore.ts
│       ├── .env.local
│       ├── .env.local.example
│       ├── next-env.d.ts
│       ├── next.config.mjs
│       ├── package.json
│       ├── postcss.config.mjs
│       ├── tsconfig.json
│       └── tsconfig.tsbuildinfo
├── docs
│   ├── design
│   │   ├── DESIGN.md
│   │   ├── generated-page.html
│   │   └── original-design-prompt.md
│   ├── features
│   │   ├── _feature-directory-index-template.md
│   │   ├── _feature-template.md
│   │   ├── agent-architecture.md
│   │   ├── frontend.md
│   │   └── intent-upgrades.md
│   ├── infra
│   │   ├── api-contracts.md
│   │   ├── aws-security-audit.md
│   │   ├── decisions.md
│   │   ├── deployment.md
│   │   ├── file-tree.md
│   │   ├── patterns.md
│   │   ├── risks.md
│   │   ├── schema.md
│   │   └── testing.md
│   ├── prds
│   │   └── prd.md
│   └── demo-runbook.md
├── evals
│   ├── .runs
│   │   ├── audit-2026-06-28T08-42-57-079Z.json
│   │   ├── audit-2026-06-28T09-00-35-158Z.json
│   │   ├── qna-2026-06-27T22-01-13-354Z.json
│   │   ├── qna-2026-06-28T08-43-54-963Z.json
│   │   ├── router-2026-06-28T08-42-41-924Z.json
│   │   ├── wallet-2026-06-28T08-45-11-087Z.json
│   │   └── wallet-2026-06-28T10-56-41-119Z.json
│   ├── lib
│   │   └── run.ts
│   ├── .gitkeep
│   ├── audit.eval.ts
│   ├── qna.eval.ts
│   ├── README.md
│   ├── render-report.ts
│   ├── router.eval.ts
│   └── wallet.eval.ts
├── infrastructure
│   ├── .aws-sam
│   │   └── build.toml
│   ├── README.md
│   ├── samconfig.toml
│   └── template.yaml
├── packages
│   └── shared
│       ├── src
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── scripts
│   ├── generate-tree.sh
│   ├── on-session-start.sh
│   └── on-session-stop.sh
├── .env.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md -> AGENTS.md
├── package-lock.json
├── package.json
├── README.md
└── vitest.config.ts
```

---

## Notes

- Excluded from tree: node_modules .git dist build out .next .nuxt coverage .cache .turbo .taskmaster/cache __pycache__ .pytest_cache venv .venv env .env target .dart_tool build Pods .gradle .idea .vscode *.egg-info
- Max depth shown: 6 levels
- To show deeper: edit `MAX_DEPTH` in `scripts/generate-tree.sh`
