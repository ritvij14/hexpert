# Hexpert — AWS Lambda Security Audit

> Audit of the `hexpert-agent` CloudFormation stack (`infrastructure/template.yaml`)
> for over-exposure / over-permissioning. **Auto-printed at every session start**
> via the `SessionStart` hook (`scripts/on-session-start.sh`) as long as any
> `STATUS: OPEN` line remains. Resolve by marking `STATUS: RESOLVED` (with the
> fix) or by deleting — don't just tolerate the nag.

Last reviewed: 2026-06-27

---

## Method

Two layers:

1. **Static** — read from `infrastructure/template.yaml` + `apps/agent/src/index.ts`
   (CORS). Done.
2. **Live** — `aws` CLI inspection of the deployed function, its execution role's
   managed + inline policies, the Function URL config, and the resource-based
   policy. **DONE (2026-06-27)** — see S4 (role), S9 (caller identity).

---

## S1 — Function URL is public + unauthenticated [BY DESIGN, ACCEPTED]
**What:** `AWS::Lambda::Url` with `AuthType: NONE` and a
`AWS::Lambda::Permission` granting `lambda:InvokeFunctionUrl` to `Principal: "*"`
(template.yaml L64–77). Anyone with the URL can `POST /api/chat` and `GET /health`.
**Is it "too open"?** This is the standard pattern for a web-app-backed public
Lambda. Browser access is constrained by CORS (see S5); `curl`/any HTTP client is
not. The URL is not meant to be secret, but it should not be published/linkified.
Real abuse is limited because a useful `/api/chat` turn requires BYOK provider
keys (`X-Api-Key`) — an attacker without those gets no LLM output — but they can
still trigger cold starts and consume Etherscan/Redis quota.
**Mitigation (prod, not demo):** front with API Gateway + usage-plan keys, or an
AWS WAF rate-based rule. For the demo: accept.
**Fix committed (ADR-012, 2026-06-27):** Function URL switched to
`AuthType: AWS_IAM`; the `Principal: "*"` resource-based policy deleted. Only an
AWS principal with `lambda:InvokeFunctionUrl` may invoke (in prod the
`hexpert-vercel` IAM user; for now root for testing). Anonymous/unsigned calls are
rejected at the AWS layer before the Lambda runs — this also closes the S2
cost-abuse vector. **Pending redeploy to apply.**
**STATUS: OPEN (pending redeploy)**

## S2 — No rate limiting / throttling / WAF on the public URL
**What:** The Function URL has no throttle, no WAF, no per-IP cap. A flood of
requests burns Lambda invocations (free tier: 1M/month) + Etherscan quota +
Upstash Redis ops.
**Mitigation (prod):** AWS WAF rate-based rule on the URL, or move behind API
Gateway with usage plans + throttling. For the demo: accept; monitor AWS billing
if the URL leaks.
**Fix committed (ADR-012, 2026-06-27):** with `AuthType: AWS_IAM`, anonymous
callers cannot invoke at all — the flood vector is closed at the AWS layer. A
determined attacker with valid AWS creds is a different threat (out of scope for
the demo). **Pending redeploy to apply.**
**STATUS: OPEN (pending redeploy)**

## S3 — Secrets stored as plaintext Lambda environment variables
**What:** `ETHERSCAN_API_KEY` and `REDIS_URL` are set as plaintext Lambda env vars
(template.yaml L56, L58). `NoEcho: true` keeps them out of CloudFormation
outputs/console echoes, but they are visible in the Lambda console
(Configuration → Environment variables) to anyone with
`lambda:GetFunctionConfiguration`, and are not encrypted with a customer-managed
KMS CMK (Lambda's default service key only).
**Mitigation (prod):** move to SSM Parameter Store / Secrets Manager + a KMS CMK,
loaded at cold start. For the demo: acceptable — both keys are low-sensitivity
(free Etherscan key; Upstash URL for TTL'd demo checkpoints).
**Rotation note (2026-06-27):** these values were entered via the
`sam deploy --guided` prompts and now sit in plaintext in the Lambda env. If the
Function URL is ever shared/published, treat both as compromised and rotate
(Etherscan: regenerate key; Upstash: rotate the password in the console and
redeploy). Do not paste these values into docs/PRs/commits.
**STATUS: OPEN (low priority)**

## S4 — Execution role policy breadth — RESOLVED (least-privilege)
**What:** `AWS::Serverless::Function` with no explicit `Role:` → SAM auto-creates
an execution role. **Live-verified (2026-06-27):**
- Attached managed policies: exactly `AWSLambdaBasicExecutionRole`
  (CloudWatch Logs: `logs:CreateLogGroup/Stream/PutLogEvents` on
  `arn:aws:logs:*:*:log-group:/aws/lambda/*`). **Nothing broader.**
- Inline policies: **none.**
- Resource-based policy: exactly one statement — `Principal: "*"`,
  `Action: lambda:InvokeFunctionUrl`, `Condition: lambda:FunctionUrlAuthType ==
  NONE`. **No extra statements, no wildcard actions beyond the URL invoke.**
- Function URL config: `AuthType: NONE`, `InvokeMode: RESPONSE_STREAM` (as
  designed at audit time).
**Note (ADR-012, 2026-06-27):** the post-redeploy state changes —
`AuthType: AWS_IAM` and the `Principal: "*"` resource-based policy is **deleted**.
Access is then governed by the caller's identity policy (the `hexpert-vercel`
IAM user), not a resource-based policy. The execution-role verdict below is
unaffected (still Logs-only).
**Verdict:** SAM did NOT over-permission. The execution role is Logs-only and
the resource policy is the minimal Function URL permission. This directly
answers "did the permissions I created open the Lambda too much?" — no.
**STATUS: RESOLVED (2026-06-27)**

## S9 — Deploy performed with ROOT account credentials [OPEN]
**What:** `aws sts get-caller-identity` returned
`arn:aws:iam::158834069855:root` — the deploy was done with **root account**
credentials. Root keys bypass all IAM restrictions and have unrestricted access
to the entire account; if leaked, they're catastrophic and not revocable per-key
(only by disabling root). SAM auto-created the execution role fine (S4), so root
was not *needed* — any IAM identity with `lambda:*`, `iam:*`, `cloudformation:*`,
`s3:*` would have done.
**Mitigation:** create a dedicated IAM user (or role assumed via SSO) with the
minimum deploy permissions; `aws configure --profile deploy` under that profile;
retire root access keys from the local machine. Delete root access keys entirely
if not strictly required.
**STATUS: OPEN**

## S10 — `ALLOWED_ORIGIN` set to `"*"` (breaks browser CORS) [OPEN]
**What:** The deployed Lambda env has `ALLOWED_ORIGIN = "*"`. But
`apps/agent/src/index.ts` CORS middleware does an **exact match**
(`origin === ALLOWED_ORIGIN`) — it is NOT a wildcard. A real browser `Origin`
header is never literally `*`, so **no browser request ever matches** → no
`Access-Control-Allow-Origin` header is sent → **every browser request to the
Lambda is CORS-blocked.**
**Security impact:** none — this is over-restrictive, not over-permissive. `*`
does not open anything up here. (If the code ever changes to reflect the
`Origin` header, `*` would then become a wildcard; keep the exact-match guard.)
**Functional impact:** the web frontend (`apps/web` on Vercel) cannot call this
Lambda until this is fixed. curl testing is unaffected (curl ignores CORS).
**Fix:** redeploy with `AllowedOrigin` set to the real Vercel URL (preview or
prod), e.g. `sam deploy` and supply `https://<vercel-domain>` at the
`AllowedOrigin` prompt. The `/deploy` skill does not currently pass parameters,
so this must be set via the guided prompt or `samconfig.toml`.
**Fix committed (ADR-012, 2026-06-27):** `AllowedOrigin` template default set to
`https://hexpert.ritvij.dev`; the redeploy supplies it via `samconfig.toml`
override. **Pending redeploy to apply.**
**STATUS: OPEN (pending redeploy)**

## S5 — CORS is correctly locked (no wildcard echo) — RESOLVED
**What:** `apps/agent/src/index.ts` L11–26 sets `Access-Control-Allow-Origin`
**only** when the request `Origin` exactly equals `ALLOWED_ORIGIN`. No `*`, no
reflect-and-echo. `OPTIONS` preflight returns 204. Allowed headers are an
explicit allowlist.
**STATUS: RESOLVED (2026-06-27)** — verified in code; sound.

## S6 — LOCAL_DEV_* keys absent from Lambda env — RESOLVED
**What:** `LOCAL_DEV_API_KEY` / `LOCAL_DEV_SEARCH_KEY` (local-dev BYOK fallback,
PRD §4.3) are not present in the template's environment block (template.yaml
L53–55 comment + absence). They are dead code on Lambda and cannot leak.
**STATUS: RESOLVED (2026-06-27)** — verified in template.

## S7 — BYOK keys never stored as env vars — RESOLVED
**What:** Provider keys arrive per-request in `X-Api-Key` / `X-Search-Key`
headers, are never written to Lambda env, and (per PRD) are never persisted or
logged. Lambda env contains only app config, not user credentials.
**STATUS: RESOLVED (2026-06-27)** — verified in template + index.ts.

## S8 — No VPC — N/A (not a finding)
**What:** The function has no VPC config. Upstash Redis is REST-over-TLS, so no
VPC/private-network path is needed. The Web Adapter streaming limitation "no VPC
for Function URL streaming" is therefore irrelevant. Not a security finding.
**STATUS: N/A**