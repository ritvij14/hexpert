---
name: deploy
description: Build and deploy the Hexpert agent to AWS Lambda (Web Adapter, response streaming) via SAM, then verify health and report the streaming Function URL. Stops on any failure.
allowed-tools: Bash(npm:*), Bash(sam:*), Bash(aws:*), Bash(curl:*), Read
---

Re-deploys `apps/agent` to the existing `hexpert-agent` CloudFormation stack.
The stack was first created with `sam deploy --guided`; subsequent deploys
reuse the saved `samconfig.toml`, so no `--guided` here.

1. From the repo root, build the Lambda package:
   `npm -w @hexpert/agent run build:lambda`
   If it fails, stop and report the error. Do not retry.

2. Build the SAM artifact:
   `cd infrastructure && sam build`
   Stop and report on failure.

3. Deploy (no `--guided` — stack already exists):
   `sam deploy --no-confirm-changeset --no-disable-rollback`
   Stop and report on failure. Do NOT pass `--guided`.

4. Fetch the streaming Function URL from stack outputs:
   `aws cloudformation describe-stacks --stack-name hexpert-agent --query "Stacks[0].Outputs[?OutputKey=='HexpertAgentUrl'].OutputValue" --output text`

5. Health check (non-streaming):
   `curl -s "<URL>/health"` — expect `{"status":"ok"}`.
   If it doesn't return ok, report the response and stop.

6. Report the Function URL to the user and offer the streaming verification
   curl. The streaming test needs BYOK headers (`X-Provider`, `X-Model`,
   `X-Api-Key`, `X-Search-Key`); if the user provides them, run:
   `curl -N -X POST "<URL>/api/chat" -H "Content-Type: application/json" -H "X-Provider: <provider>" -H "X-Model: <model>" -H "X-Api-Key: <key>" -H "X-Search-Key: <key>" -d '{"message":"What is a reentrancy attack?","sessionId":"<uuid>"}'`
   Progressive `data: {"type":"token",...}` frames = streaming works end to end.
   If the user does not provide BYOK headers, skip the streaming test and say so.