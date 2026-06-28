// Single shared TTL-evicted Redis checkpointer for HITL state (ADR-008).
// Lambda holds no checkpoint state itself; Redis bridges two requests and
// self-cleans. Keyed by thread_id = sessionId at invoke time.

import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

// Silence the saver's best-effort RediSearch index-creation warnings.
// RedisSaver.ensureIndexes() runs on every put/putWrites and tries FT.CREATE
// for the checkpoints/checkpoint_blobs/checkpoint_writes indexes. Upstash has
// no RediSearch (FT.*), so each attempt errors and the saver logs
// `Failed to create index <name>: ...` — pure noise: HITL works via RedisJSON,
// not the search index (R2). The saver has no disable flag, so we filter
// console.error globally for exactly these three lines; all other errors pass
// through untouched.
const SUPPRESSED_INDEX_RE =
  /^Failed to create index (checkpoints|checkpoint_blobs|checkpoint_writes):/;
const _origConsoleError = console.error;
console.error = (...args: unknown[]): void => {
  if (typeof args[0] === "string" && SUPPRESSED_INDEX_RE.test(args[0])) return;
  _origConsoleError(...args);
};

let saver: RedisSaver | null = null;

/**
 * Build the singleton RedisSaver at startup if REDIS_URL is set.
 * Safe to call when REDIS_URL is absent — the chat route will surface a
 * 503 if it needs a checkpoint and none is available.
 */
export async function initCheckpointer(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url || saver) return;
  saver = await RedisSaver.fromUrl(url, {
    defaultTTL: Number(process.env.REDIS_TTL_MINUTES ?? 60),
    refreshOnRead: true,
  });
}

/** Returns the shared saver. Throws if initCheckpointer() did not run / failed. */
export function getCheckpointer(): RedisSaver {
  if (!saver) {
    throw new Error("HITL checkpointer not initialized — is REDIS_URL set?");
  }
  return saver;
}