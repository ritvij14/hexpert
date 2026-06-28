#!/bin/bash
# Lambda bootstrap — AWS Lambda Web Adapter zip pattern (ADR-011).
# The Web Adapter's /opt/bootstrap exec wrapper (AWS_LAMBDA_EXEC_WRAPPER) runs
# this script as the handler. It starts the Express server (app.listen on PORT,
# default 8000 on Lambda). The adapter proxies Lambda Function URL events to
# http://127.0.0.1:${PORT} and streams the SSE response back to the client via
# Lambda response streaming (AWS_LWA_INVOKE_MODE=response_stream + Function URL
# InvokeMode RESPONSE_STREAM). No serverless-http — the app is a plain HTTP
# server the adapter fronts.
node dist/index.js