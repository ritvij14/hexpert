# Hexpert Agent — AWS Lambda Deployment

> Deploys `apps/agent` (Express + LangGraph) to AWS Lambda with **response
> streaming** via the [AWS Lambda Web Adapter](https://github.com/aws/aws-lambda-web-adapter)
> (ADR-011 / PRD §7). This replaces the earlier `serverless-http` plan —
> `serverless-http` buffers the whole response, which would collapse SSE
> streaming and break ADR-004.

## How it streams

The Express app runs unchanged as a plain HTTP server (`app.listen(PORT)`).
The Web Adapter (a Lambda layer) fronts it:

- Lambda Function URL is configured with `InvokeMode: RESPONSE_STREAM`.
- `AWS_LWA_INVOKE_MODE=response_stream` tells the adapter to stream.
- The adapter proxies each Function URL event to `http://127.0.0.1:${PORT}` and
  pipes the Express `res.write(...)` chunks back to the client using Lambda
  response streaming (HTTP/1.1 chunked). SSE frames from `/api/chat` therefore
  arrive at the browser progressively, not as a buffered batch.

Streaming limitations that matter (all fine for Hexpert): no compression with
streaming (auto-disabled), Function URLs only (not ALB), no VPC (Upstash Redis
is REST, so no VPC is needed), 20MB soft per-response cap, ≥6MB capped at 2MB/s.
Our SSE turns are KB-scale.

## Prerequisites (on your dev machine)

- AWS CLI v2, configured (`aws configure` — needs credentials with
  `lambda:*`, `iam:*`, `cloudformation:*`, `s3:*`).
- AWS SAM CLI: `brew install aws-sam-cli` (macOS) or see
  https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
- Node 20+ (already required for dev).

## Build the deployment package

From the repo root:

```bash
npm -w @hexpert/agent run build:lambda
```

This runs `tsc` (→ `apps/agent/dist/`) then `apps/agent/scripts/pack-lambda.sh`,
which stages `run.sh + dist/ + package.json + production node_modules/` into
`apps/agent/lambda-pkg/` (SAM zips this at deploy) and also writes
`apps/agent/dist-lambda.zip` (for direct `aws lambda update-function-code`).

## Deploy (SAM, first time)

```bash
cd infrastructure
sam build
sam deploy --guided --stack-name hexpert-agent
```

Guided prompts — the template parameters:

| Parameter | Value |
| --- | --- |
| `EtherscanApiKey` | your Etherscan key |
| `AllowedOrigin` | the Vercel web URL (preview or prod); for raw curl testing use `*`-ish — but CORS only affects browsers, curl ignores it |
| `RedisUrl` | Upstash Redis URL (`rediss://...`) — RedisJSON module required (ADR-008) |
| `RedisTtlMinutes` | `60` (default) |
| `EthRpcUrl` | `https://ethereum.publicnode.com` (default; `eth.drpc.org` is an alternative) |

Say yes to "allow SAM CLI IAM role creation" (the function needs an execution
role; the template auto-creates one via `AWS::Serverless::Function`).

After deploy, note the `HexpertAgentUrl` output — that's the streaming Function URL.

## Redeploy after code changes

```bash
npm -w @hexpert/agent run build:lambda
cd infrastructure && sam build && sam deploy   # no --guided after the first time
```

Or, for a quick code-only update without CloudFormation:

```bash
npm -w @hexpert/agent run build:lambda
aws lambda update-function-code \
  --function-name hexpert-agent-HexpertAgentFunction-<suffix> \
  --zip-file fileb://apps/agent/dist-lambda.zip
```

## Verify

```bash
URL=<the HexpertAgentUrl output, e.g. https://abc123.lambda-url.us-east-1.on.aws>

# Health (non-streaming).
curl -s "$URL/health"            # → {"status":"ok"}

# Streamed chat turn — BYOK headers required on Lambda (no local-dev fallback).
curl -N -X POST "$URL/api/chat" \
  -H "Content-Type: application/json" \
  -H "X-Provider: ollama" \
  -H "X-Model: glm-5.2:cloud" \
  -H "X-Api-Key: <your provider key>" \
  -H "X-Search-Key: tvly-<your tavily key>" \
  -d '{"message":"What is a reentrancy attack?","sessionId":"<uuid>"}'
# You should see `data: {"type":"token",...}` frames arrive progressively
# (not all at once at the end) — that confirms streaming works end to end.
```

`-N` disables curl's output buffering so you can see chunks as they arrive.

## Environment variables on Lambda

| Variable | Set by | Purpose |
| --- | --- | --- |
| `AWS_LAMBDA_EXEC_WRAPPER` | template (`/opt/bootstrap`) | Web Adapter exec wrapper |
| `AWS_LWA_INVOKE_MODE` | template (`response_stream`) | Enable response streaming |
| `PORT` | template (`8000`) | Port the Express server listens on; adapter forwards here |
| `RUST_LOG` | template (`info`) | Web Adapter log level |
| `ETHERSCAN_API_KEY` | SAM parameter | Wallet + contract tools |
| `ALLOWED_ORIGIN` | SAM parameter | CORS origin (Vercel URL) |
| `REDIS_URL` | SAM parameter | HITL checkpointer (ADR-008) |
| `REDIS_TTL_MINUTES` | SAM parameter | Checkpoint TTL |
| `ETH_RPC_URL` | SAM parameter | ENS resolution RPC |

**Never set on Lambda:** `LOCAL_DEV_API_KEY`, `LOCAL_DEV_SEARCH_KEY` (local-dev
BYOK fallback only; dead code on Lambda — PRD §4.3). BYOK keys are never
environment variables; they arrive per request in `X-Api-Key` / `X-Search-Key`.

## Cost / free tier

Streaming invokes are normal Lambda invocations — billed against the Always-Free
1M requests/month and 400,000 GB-s/month (duration measured to stream close). A
40s turn at 512MB = 20 GB-s; the free tier covers ~20k such turns/month. Egress
(~100GB/month free for the first 12 months) is trivial for KB-scale SSE.