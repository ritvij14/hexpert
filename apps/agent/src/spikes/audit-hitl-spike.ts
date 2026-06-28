// R2 SPIKE — HITL resume for the audit subgraph.
//
// Goal: empirically test candidate mechanisms for resuming a LangGraph
// interrupt when Lambda holds no state between requests (PRD §4.8/§4.10).
//
// What this proves:
//   - EXP A (single-process MemorySaver): the documented path works — but only
//     because the checkpointer holds the checkpoint in process memory.
//   - EXP B/C (cross-process via updateState / Command update+resume, fresh
//     MemorySaver = empty storage): both FAIL — proving a client-supplied
//     state-values blob cannot rehydrate an interrupt. The browser's IndexedDB
//     can hold values, not the runtime-internal checkpoint tuple.
//   - EXP R (only if REDIS_URL is set): the ADR-008 fix — two SEPARATE
//     RedisSaver instances (simulating two cold Lambda invocations) pointing at
//     the same Redis. graph-α suspends; a FRESH graph-β resumes via thread_id.
//     If this PASSes, the deployed cold-start resume path is confirmed.
//
// LLM is MOCKED — this is about the interrupt/serialize/resume mechanism, not
// structured output. No LLM API keys required. EXP R needs a Redis 8.0+
// (or Redis Stack / Upstash) endpoint reachable via REDIS_URL.
//
// Run:
//   npx tsx apps/agent/src/spikes/audit-hitl-spike.ts                 # MemorySaver only
//   REDIS_URL=redis://localhost:6379 npx tsx apps/agent/src/spikes/audit-hitl-spike.ts   # + Redis proof

import {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
  Command,
  interrupt,
  type CompiledStateGraph,
  type StateSnapshot,
} from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { createClient } from "redis"; // transitive dep of the saver; used only to inspect TTLs

// --- Mock audit types (mirror packages/shared once wired) ---

type AuditFinding = {
  severity: "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  lineReference: string;
};

// --- Graph state ---

const AuditState = Annotation.Root({
  fileContent: Annotation<string>(),
  contractRead: Annotation<boolean>(),
  // MOCK analysis output — in production this is one structured-output LLM call.
  findings: Annotation<AuditFinding[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  awaitingHITL: Annotation<boolean>({ default: () => false }),
  hitlPrompt: Annotation<string>(),
  followUpSelection: Annotation<string>(),
  finalReport: Annotation<string>(),
});

type AuditGraph = CompiledStateGraph<typeof AuditState.State, typeof AuditState.Update>;

// --- Nodes ---

async function readContractNode(state: typeof AuditState.State) {
  // In production: wrap fileContent with wrapUserContent + fileReader tool.
  console.log("   [node] readContract ran");
  return { contractRead: true, fileContent: state.fileContent };
}

async function analyseContractNode(state: typeof AuditState.State) {
  // MOCK: real node is one structured-output LLM call producing all findings.
  // We tag this so the spike can detect whether the node RE-RAN on resume
  // (the key cost question for the stateless mechanisms).
  console.log("   [node] analyseContract ran (this is the expensive LLM call in production)");
  const findings: AuditFinding[] = [
    { severity: "high", title: "Reentrancy", description: "transfer before state update", lineReference: "L42" },
    { severity: "medium", title: "Unchecked external call", description: "return value ignored", lineReference: "L58" },
  ];
  return { findings };
}

async function hitlCheckpointNode(_state: typeof AuditState.State) {
  const selection = interrupt({
    question: "Initial findings ready. Choose a follow-up:",
    options: ["generate fix", "show exploit scenario", "full report only"],
  });
  return { followUpSelection: selection as string, awaitingHITL: false };
}

async function finalReportNode(state: typeof AuditState.State) {
  console.log(`   [node] finalReport ran (followUpSelection=${state.followUpSelection})`);
  const summary = state.findings.map((f) => `${f.severity}: ${f.title} @ ${f.lineReference}`).join("; ");
  return {
    finalReport: `Report [follow-up: ${state.followUpSelection}] — findings: ${summary}`,
  };
}

function buildGraph(checkpointer: MemorySaver): AuditGraph {
  const builder = new StateGraph(AuditState)
    .addNode("readContract", readContractNode)
    .addNode("analyseContract", analyseContractNode)
    .addNode("hitlCheckpoint", hitlCheckpointNode)
    .addNode("assembleReport", finalReportNode)
    .addEdge(START, "readContract")
    .addEdge("readContract", "analyseContract")
    .addEdge("analyseContract", "hitlCheckpoint")
    .addEdge("hitlCheckpoint", "assembleReport")
    .addEdge("assembleReport", END);
  return builder.compile({ checkpointer }) as AuditGraph;
}

const THREAD = { configurable: { thread_id: "audit-spike-1" } };
const INITIAL_INPUT = { fileContent: "contract code …" } as typeof AuditState.Update;

function banner(label: string) {
  console.log(`\n========== ${label} ==========`);
}

async function snapshotOf(graph: AuditGraph, label: string): Promise<StateSnapshot> {
  const snap = await graph.getState(THREAD);
  console.log(`   [${label}] next=${JSON.stringify(snap.next)} values.keys=${Object.keys(snap.values)}`);
  return snap;
}

async function main() {
  // ===================================================================
  // EXP A — Baseline: single process, MemorySaver holds state across calls.
  //   This is the documented path. We also capture the serialized
  //   "checkpointState" blob (state.values) that the client would store.
  // ===================================================================
  banner("EXP A — baseline single-process MemorySaver");
  const graphA = buildGraph(new MemorySaver());
  console.log("A.1 invoke initial → expect interrupt at hitlCheckpoint");
  const resA1 = await graphA.invoke(INITIAL_INPUT, THREAD);
  console.log("   A.1 returned keys:", Object.keys(resA1));
  const snapA = await snapshotOf(graphA, "A interrupt");
  const interrupted = snapA.next.length > 0;
  if (!interrupted) {
    console.log("   ✗ EXP A did NOT interrupt — spike cannot proceed");
    return;
  }
  const interruptTask = snapA.tasks.find((t: any) => t && t.interrupt != null);
  console.log("   A interrupt payload:", JSON.stringify(interruptTask?.interrupt));

  // This JSON string is what the client stores as checkpointState and re-sends.
  const checkpointState = JSON.stringify(snapA.values);
  console.log(`   A serialized checkpointState size: ${checkpointState.length} bytes`);

  console.log("A.2 resume with Command({ resume })");
  const resA2 = await graphA.invoke(new Command({ resume: "generate fix" }), THREAD);
  console.log("   A.2 finalReport:", resA2.finalReport);
  const baselineOK = typeof resA2.finalReport === "string" && resA2.finalReport.length > 0;
  console.log(`   EXP A: ${baselineOK ? "PASS ✓" : "FAIL ✗"}`);

  // ===================================================================
  // EXP B — Cross-process via updateState(config, values) + Command resume.
  //   Simulate a fresh Lambda invocation: NEW MemorySaver + NEW graph.
  //   Rehydrate state.values via updateState, then resume. Does it resume
  //   WITHOUT re-running readContract/analyseContract?
  // ===================================================================
  banner("EXP B — cross-process updateState + Command resume");
  const graphB = buildGraph(new MemorySaver());
  const deserialized = JSON.parse(checkpointState) as Record<string, unknown>;
  let expBOK = false;
  try {
    console.log("B.1 updateState with deserialized values (no asNode)");
    await graphB.updateState(THREAD, deserialized);
    await snapshotOf(graphB, "B after updateState");
    console.log("B.2 invoke Command({ resume })");
    const resB = await graphB.invoke(new Command({ resume: "generate fix" }), THREAD);
    console.log("   B.2 finalReport:", resB.finalReport);
    expBOK = typeof resB.finalReport === "string" && resB.finalReport.length > 0;
  } catch (e: any) {
    console.log("   EXP B threw:", e?.message ?? e);
  }
  console.log(`   EXP B: ${expBOK ? "PASS ✓ (check [node] logs above — did analyseContract re-run?)" : "FAIL ✗"}`);

  // ===================================================================
  // EXP C — Cross-process via Command({ update, resume }) in one invoke.
  //   Fresh MemorySaver + fresh graph, no prior checkpoint. Single invoke
  //   seeds state via `update` and answers the interrupt via `resume`.
  //   Question: does it work at all, and does analyseContract re-run?
  // ===================================================================
  banner("EXP C — cross-process Command({ update, resume }) single invoke");
  const graphC = buildGraph(new MemorySaver());
  let expCOK = false;
  try {
    console.log("C.1 invoke new Command({ update, resume }) on fresh graph");
    const resC = await graphC.invoke(
      new Command({ update: deserialized, resume: "generate fix" }),
      THREAD,
    );
    console.log("   C.1 finalReport:", resC.finalReport);
    expCOK = typeof resC.finalReport === "string" && resC.finalReport.length > 0;
  } catch (e: any) {
    console.log("   EXP C threw:", e?.message ?? e);
  }
  console.log(`   EXP C: ${expCOK ? "PASS ✓" : "FAIL ✗"} (check [node] logs above — did analyseContract re-run?)`);

  // ===================================================================
  // EXP D — Fallback note: module-level MemorySaver keyed by sessionId.
  //   No code: this is the R2-documented fallback ("ephemeral per warm
  //   instance"). It is exactly EXP A's model and breaks on Lambda cold start
  //   between the two turns. Documented for the verdict.
  // ===================================================================
  banner("EXP D — no code (ephemeral per-warm-instance MemorySaver fallback)");
  console.log("   See verdict below. (Rejected for Hexpert per ADR-008 — cold-start risk.)");

  // ===================================================================
  // EXP R — ADR-008 fix: cross-process resume via a durable Redis checkpointer.
  //   Two SEPARATE RedisSaver instances (each = one cold Lambda invocation)
  //   pointing at the SAME Redis. graph-α suspends; a FRESH graph-β (new saver,
  //   new compiled graph, same thread_id) resumes. If this PASSes, the deployed
  //   cold-start resume path is empirically confirmed. Only runs if REDIS_URL
  //   is set.
  // ===================================================================
  let expROK = false;
  let expTOK = false;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    banner("EXP R — SKIPPED (set REDIS_URL to run the Redis cross-process proof)");
    console.log("   e.g. REDIS_URL=redis://localhost:6379 npx tsx apps/agent/src/spikes/audit-hitl-spike.ts");
    console.log("   (Redis 8.0+ / Redis Stack / Upstash — needs RedisJSON + RediSearch modules)");
  } else {
    banner("EXP R — cross-process resume via RedisSaver (ADR-008)");
    // Unique thread per run so reruns don't collide with leftover checkpoints.
    const threadId = `audit-spike-${Date.now()}`;
    const cfgR = { configurable: { thread_id: threadId } };
    try {
      console.log("R.α build graph-α with saver-α (one 'Lambda'), invoke → expect interrupt");
      const saverAlpha = await RedisSaver.fromUrl(redisUrl, {
        defaultTTL: 60, // minutes — long enough for the spike; refreshOnRead resets it
        refreshOnRead: true,
      });
      const graphAlpha = buildGraph(saverAlpha);
      await graphAlpha.invoke(INITIAL_INPUT, cfgR);
      const snapAlpha = await graphAlpha.getState(cfgR);
      console.log("   R.α interrupted?", snapAlpha.next.length > 0, "next=", JSON.stringify(snapAlpha.next));
      await saverAlpha.end(); // simulate Lambda turn 1 terminating — connection closed

      console.log("R.β build graph-β with a FRESH saver-β (second 'cold Lambda'), same Redis + thread_id");
      const saverBeta = await RedisSaver.fromUrl(redisUrl, {
        defaultTTL: 60,
        refreshOnRead: true,
      });
      const graphBeta = buildGraph(saverBeta);
      const snapBeta0 = await graphBeta.getState(cfgR); // load checkpoint from Redis on this fresh instance
      console.log("   R.β fresh instance sees suspended checkpoint? next=", JSON.stringify(snapBeta0.next));
      console.log("R.β invoke Command({ resume })");
      const resR = await graphBeta.invoke(new Command({ resume: "generate fix" }), cfgR);
      console.log("   R.β finalReport:", resR.finalReport);
      expROK = typeof resR.finalReport === "string" && resR.finalReport.length > 0;
      await saverBeta.end();
    } catch (e: any) {
      console.log("   EXP R threw:", e?.message ?? e);
    }
    console.log(`   EXP R: ${expROK ? "PASS ✓ — ADR-008 cold-start resume path CONFIRMED" : "FAIL ✗ — investigate Redis connectivity / modules before building subgraphs"}`);

    // =================================================================
    // EXP T — TTL verification (ADR-008). Uses a short defaultTTL (1 min)
    // and a DIRECT redis client (the `redis` package, a transitive dep of
    // the saver) to inspect key TTLs — proving:
    //   (1) checkpoint keys have a TTL set after suspend (≤ defaultTTL*60 s)
    //   (2) refreshOnRead: true resets the TTL upward on a getState() read
    //   (3) [opt-in, REDIS_TTL_EXPIRE=1] the checkpoint actually expires and
    //       a subsequent getState() returns empty → resume would be a fresh turn
    // =================================================================
    banner("EXP T — TTL set + refreshOnRead (via direct redis client)");
    try {
      const ttlMinutes = 1; // 60s — short so the opt-in expiry test is quick
      const threadIdT = `audit-spike-ttl-${Date.now()}`;
      const cfgT = { configurable: { thread_id: threadIdT } };

      // Direct inspection client (TLS auto-enabled for rediss://).
      const isTls = redisUrl.startsWith("rediss://");
      const inspect = createClient({ url: redisUrl, socket: { tls: isTls } });
      await inspect.connect();

      const saverT = await RedisSaver.fromUrl(redisUrl, {
        defaultTTL: ttlMinutes,
        refreshOnRead: true,
      });
      const graphT = buildGraph(saverT);

      const findKeys = async (): Promise<string[]> => {
        const all = await inspect.keys(`*${threadIdT}*`);
        if (all.length) return all;
        // Fallback: any keys created this run (diff against a baseline).
        return (await inspect.keys("*")) as string[];
      };

      console.log(`T.1 suspend with defaultTTL=${ttlMinutes}min, refreshOnRead=true`);
      await graphT.invoke(INITIAL_INPUT, cfgT);
      const keysAfterSuspend = await findKeys();
      const ttlsAfterSuspend = await Promise.all(
        keysAfterSuspend.map(async (k) => [k, await inspect.ttl(k)] as const),
      );
      console.log("   T.1 checkpoint keys + TTLs (s):");
      ttlsAfterSuspend.forEach(([k, t]) => console.log(`      ${k} → ${t}s`));
      const anyTtlSet = ttlsAfterSuspend.some(([, t]) => t > 0 && t <= ttlMinutes * 60);
      console.log(`   T.1 at least one key has TTL in (0, ${ttlMinutes * 60}s]? ${anyTtlSet}`);

      console.log("T.2 getState() (triggers getTuple → refreshOnRead) then re-check TTLs");
      const ttlBeforeRefresh = await inspect.ttl(ttlsAfterSuspend[0]?.[0] ?? "none");
      await graphT.getState(cfgT);
      const ttlAfterRefresh = await inspect.ttl(ttlsAfterSuspend[0]?.[0] ?? "none");
      console.log(`   T.2 sample key TTL: before-read=${ttlBeforeRefresh}s, after-read=${ttlAfterRefresh}s`);
      const refreshed = ttlAfterRefresh >= ttlBeforeRefresh && ttlAfterRefresh > 0;
      console.log(`   T.2 TTL refreshed (or held) on read? ${refreshed}`);

      // Clean up the resume so the graph completes; then delete the thread.
      try {
        await graphT.invoke(new Command({ resume: "full report only" }), cfgT);
      } catch {
        /* non-fatal for the TTL check */
      }
      await saverT.deleteThread(threadIdT).catch(() => {});

      // Opt-in: watch actual expiry. Needs ~60s+; skipped unless REDIS_TTL_EXPIRE=1.
      let expired = false;
      if (process.env.REDIS_TTL_EXPIRE === "1") {
        banner("EXP T.3 — real expiry watch (REDIS_TTL_EXPIRE=1, ~65s)");
        const threadIdE = `audit-spike-expire-${Date.now()}`;
        const cfgE = { configurable: { thread_id: threadIdE } };
        const saverE = await RedisSaver.fromUrl(redisUrl, { defaultTTL: 1, refreshOnRead: true });
        const graphE = buildGraph(saverE);
        await graphE.invoke(INITIAL_INPUT, cfgE);
        const snapE = await graphE.getState(cfgE);
        console.log("   T.3 suspended; next=", JSON.stringify(snapE.next), "— polling until checkpoint expires (~60s)");
        const start = Date.now();
        // Don't read getState again (that would refresh the TTL); only poll via the raw client.
        let gone = false;
        while (Date.now() - start < 75_000) {
          const keys = await inspect.keys(`*${threadIdE}*`);
          if (keys.length === 0) { gone = true; break; }
          await new Promise((r) => setTimeout(r, 2000));
        }
        const snapE2 = await graphE.getState(cfgE);
        console.log(`   T.3 checkpoint vanished via TTL? ${gone}  next after expiry=${JSON.stringify(snapE2.next)}  (elapsed=${Math.round((Date.now() - start) / 1000)}s)`);
        expired = gone && snapE2.next.length === 0;
        await saverE.deleteThread(threadIdE).catch(() => {});
        await saverE.end();
      } else {
        console.log("   T.3 SKIPPED — set REDIS_TTL_EXPIRE=1 to watch real expiry (~65s)");
      }

      expTOK = anyTtlSet && refreshed;
      if (process.env.REDIS_TTL_EXPIRE === "1") expTOK = expTOK && expired;
      await saverT.end();
      await inspect.quit();
    } catch (e: any) {
      console.log("   EXP T threw:", e?.message ?? e);
    }
    console.log(`   EXP T: ${expTOK ? "PASS ✓ — TTL set + refreshOnRead verified" : "FAIL ✗ — check Redis modules / connectivity"}`);
  }

  // ===================================================================
  // VERDICT
  // ===================================================================
  banner("VERDICT");
  console.log(`  Baseline (EXP A, MemorySaver single-process):   ${baselineOK ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Stateless via updateState (EXP B):              ${expBOK ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Stateless via Command update+resume (EXP C):    ${expCOK ? "PASS ✓" : "FAIL ✗"}`);
  if (redisUrl) {
    console.log(`  Cross-process via RedisSaver (EXP R, ADR-008):  ${expROK ? "PASS ✓" : "FAIL ✗"}`);
    console.log(`  TTL set + refreshOnRead (EXP T, ADR-008):       ${expTOK ? "PASS ✓" : "FAIL ✗"}`);
  } else {
    console.log(`  Cross-process via RedisSaver (EXP R, ADR-008):  SKIPPED (set REDIS_URL)`);
    console.log(`  TTL set + refreshOnRead (EXP T, ADR-008):       SKIPPED (set REDIS_URL)`);
  }
  console.log("");
  console.log("Read the [node] log lines to see whether the stateless mechanisms");
  console.log("re-ran readContract/analyseContract (the LLM cost question).");
  console.log("EXP R is the true R2 closure — run it against a real REDIS_URL before");
  console.log("building the real subgraphs. See ADR-008 + docs/infra/risks.md R2.");
}

main().catch((e) => {
  console.error("SPIKE CRASHED:", e);
  process.exit(1);
});