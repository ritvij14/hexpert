// Eval report viewer — renders the JSON traces in evals/.runs/ as a presentable
// HTML dashboard served on localhost (default :4321). No dependencies, no
// apps/web changes. Run: `npm run eval:report`.
//
// Each trace (written by evals/lib/run.ts) has shape:
//   { name, provider, model, ranAt, results: [{ id, pass, messages, frames, latencyMs }] }
// where frames is SseFrame[][] (one array per turn). This viewer extracts, per
// case: pass/fail, latency, token usage + cost (meta frame), tool calls (tool
// frames), HITL prompts (hitl frame), the streamed answer (token frames), and
// errors (error frame) — the same fields the graders assert on, made visible.

import { readdir, readFile } from "node:fs/promises";
import { resolve, basename, join } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const RUNS_DIR = resolve("evals/.runs");
const PORT = Number(process.env.EVAL_REPORT_PORT ?? 4321);

type SseFrame =
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "hitl"; question: string; options: string[] }
  | { type: "report"; auditReport: unknown }
  | { type: "meta"; meta: Record<string, unknown> }
  | { type: "error"; error: string }
  | { type: "done" };

type TraceResult = {
  id: string;
  pass: boolean;
  messages: string[];
  frames: SseFrame[][];
  latencyMs: number;
};
type Trace = {
  name: string;
  provider: string;
  model: string;
  ranAt: string;
  results: TraceResult[];
};
type RunFile = { file: string; trace: Trace };

async function loadRuns(): Promise<RunFile[]> {
  let files: string[];
  try {
    files = await readdir(RUNS_DIR);
  } catch {
    return [];
  }
  const jsons = files.filter((f) => f.endsWith(".json"));
  const out: RunFile[] = [];
  for (const f of jsons) {
    try {
      const raw = await readFile(join(RUNS_DIR, f), "utf8");
      out.push({ file: f, trace: JSON.parse(raw) as Trace });
    } catch {
      /* skip corrupt traces */
    }
  }
  // newest first by ranAt, then filename.
  out.sort((a, b) => (b.trace.ranAt ?? "").localeCompare(a.trace.ranAt ?? "") || b.file.localeCompare(a.file));
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Minimal markdown -> HTML (headers, bold, code, line breaks). Tables stay as pre. */
function mdToHtml(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const html: string[] = [];
  let inPre = false;
  const flushPre = () => {
    if (inPre) {
      html.push("</pre>");
      inPre = false;
    }
  };
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPre();
      const level = h[1].length;
      html.push(`<h${level}>${h[2]}</h${level}>`);
      continue;
    }
    // table-ish or list-ish or non-empty prose -> pre block for fidelity
    if (line.trim() === "") {
      flushPre();
      continue;
    }
    if (!inPre) {
      html.push("<pre>");
      inPre = true;
    }
    const rendered = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    html.push(rendered);
  }
  flushPre();
  return html.join("\n");
}

function summarize(trace: Trace) {
  const passed = trace.results.filter((r) => r.pass).length;
  return { passed, total: trace.results.length };
}

function renderHtml(runs: RunFile[]): string {
  // Group by suite name; pick latest per suite for the summary.
  const latestBySuite = new Map<string, RunFile>();
  for (const r of runs) {
    if (!latestBySuite.has(r.trace.name)) latestBySuite.set(r.trace.name, r);
  }
  const suites = [...latestBySuite.values()];
  const overallPass = suites.filter((r) => {
    const s = summarize(r.trace);
    return s.passed === s.total;
  }).length;
  const totalCases = suites.reduce((n, r) => n + r.trace.results.length, 0);
  const totalPassed = suites.reduce((n, r) => n + summarize(r.trace).passed, 0);

  const payload = JSON.stringify(runs);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Hexpert Eval Report</title>
<style>
  :root { --bg:#0e1116; --panel:#161b22; --panel2:#1c232c; --border:#262d36; --txt:#d7dde3; --muted:#8a94a3; --ok:#3fb950; --bad:#f85149; --warn:#d29922; --accent:#58a6ff; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:18px 24px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg); z-index:1; }
  header h1 { margin:0 0 6px; font-size:18px; font-weight:600; }
  header .stats { font-size:13px; color:var(--muted); }
  header .stats b { color:var(--txt); }
  .layout { display:flex; min-height:calc(100vh - 70px); }
  aside { width:280px; border-right:1px solid var(--border); padding:16px; overflow-y:auto; }
  aside h2 { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:16px 0 8px; font-weight:600; }
  aside .run { display:block; width:100%; text-align:left; background:var(--panel); border:1px solid var(--border); color:var(--txt); padding:10px 12px; border-radius:8px; margin-bottom:8px; cursor:pointer; font-size:13px; }
  aside .run:hover { border-color:var(--accent); }
  aside .run.active { border-color:var(--accent); background:var(--panel2); }
  aside .run .name { font-weight:600; }
  aside .run .meta { color:var(--muted); font-size:11px; margin-top:3px; }
  aside .run .pill { font-size:11px; }
  main { flex:1; padding:24px 28px; max-width:1100px; overflow-y:auto; }
  .runHead { margin-bottom:16px; }
  .runHead h2 { margin:0 0 4px; font-size:22px; }
  .runHead .sub { color:var(--muted); font-size:13px; }
  .pill { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
  .pill.ok { background:rgba(63,185,80,.15); color:var(--ok); }
  .pill.bad { background:rgba(248,81,73,.15); color:var(--bad); }
  .case { background:var(--panel); border:1px solid var(--border); border-radius:10px; margin-bottom:14px; overflow:hidden; }
  .caseHead { display:flex; align-items:center; gap:10px; padding:12px 16px; cursor:pointer; user-select:none; }
  .caseHead:hover { background:var(--panel2); }
  .caseHead .id { font-weight:600; font-size:14px; }
  .caseHead .lat { color:var(--muted); font-size:12px; margin-left:auto; }
  .caseBody { padding:0 16px 16px; border-top:1px solid var(--border); }
  .row { display:flex; gap:24px; flex-wrap:wrap; margin:12px 0; font-size:12px; color:var(--muted); }
  .row span b { color:var(--txt); }
  .messages { margin:8px 0; }
  .messages div { font-size:12px; padding:4px 8px; border-radius:6px; margin-bottom:4px; background:var(--panel2); }
  .messages div.fail { color:var(--bad); }
  .messages div.ok { color:var(--muted); }
  pre { background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:12px; overflow-x:auto; white-space:pre-wrap; word-wrap:break-word; font-size:12.5px; line-height:1.55; margin:8px 0; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  pre h1,pre h2,pre h3 { margin:8px 0 4px; color:var(--accent); font-size:14px; font-family:inherit; }
  strong { color:var(--txt); font-weight:600; }
  code { background:var(--bg); padding:1px 5px; border-radius:4px; font-size:12px; }
  .turnLabel { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:14px 0 4px; }
  .tools { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0; }
  .tools .t { font-size:11px; background:var(--panel2); border:1px solid var(--border); padding:2px 8px; border-radius:6px; color:var(--accent); }
  .empty { color:var(--muted); padding:40px; text-align:center; }
  details summary { cursor:pointer; color:var(--muted); font-size:12px; padding:6px 0; }
</style>
</head>
<body>
<header>
  <h1>Hexpert Eval Report</h1>
  <div class="stats">
    <b id="suitesPass">${suites.length ? `${overallPass}/${suites.length}` : "0/0"}</b> suites fully passing ·
    <b id="casesPass">${totalPassed}/${totalCases}</b> cases ·
    ${runs.length} trace file(s) in <code>evals/.runs/</code>
  </div>
</header>
<div class="layout">
  <aside id="sidebar"><h2>Runs</h2><div id="runList"></div></aside>
  <main id="main"><div class="empty">Select a run on the left.</div></main>
</div>
<script>
const RUNS = ${payload};
const el = (id) => document.getElementById(id);
function pill(passed, total) {
  const ok = passed === total;
  return '<span class="pill ' + (ok ? 'ok' : 'bad') + '">' + passed + '/' + total + '</span>';
}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function md(s){
  const lines = esc(s).split('\\n'); const out=[]; let inPre=false;
  const flush=()=>{if(inPre){out.push('</pre>');inPre=false;}};
  for(const line of lines){
    const h=/^(#{1,6})\\s+(.*)$/.exec(line);
    if(h){flush();const lvl=h[1].length;out.push('<h'+lvl+'>'+h[2]+'</h'+lvl+'>');continue;}
    if(line.trim()===''){flush();continue;}
    if(!inPre){out.push('<pre>');inPre=true;}
    out.push(line.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>').replace(/\`([^\`]+)\`/g,'<code>$1</code>'));
  }
  flush(); return out.join('\\n');
}
function framesForTurn(frames){
  const tokens = frames.filter(f=>f.type==='token').map(f=>f.text).join('');
  const tools = frames.filter(f=>f.type==='tool').map(f=>f.name);
  const meta = frames.find(f=>f.type==='meta');
  const errs = frames.filter(f=>f.type==='error').map(f=>f.error);
  const hitl = frames.find(f=>f.type==='hitl');
  let html = '';
  if(meta){
    const m=meta.meta;
    html += '<div class="row"><span>intent: <b>'+esc(m.intent)+'</b></span><span>subgraph: <b>'+esc(m.subgraphRan)+'</b></span>'
      + '<span>tokens: <b>'+(m.tokensUsed? m.tokensUsed.input+' in / '+m.tokensUsed.output+' out':'?')+'</b></span>'
      + '<span>cost: <b>$'+(m.estimatedCostUsd??0).toFixed(5)+'</b></span>'
      + '<span>tool calls: <b>'+(m.toolCallCount??0)+'</b></span></div>';
  }
  if(hitl){
    html += '<div class="turnLabel">HITL prompt</div><pre>'+esc(hitl.question)+'\\nOptions: '+(hitl.options||[]).join(', ')+'</pre>';
  }
  if(tools.length){
    html += '<div class="turnLabel">Tools</div><div class="tools">'+tools.map(t=>'<span class="t">'+esc(t)+'</span>').join('')+'</div>';
  }
  if(errs.length){
    html += '<div class="turnLabel">Errors</div>'+errs.map(e=>'<pre style="color:var(--bad)">'+esc(e)+'</pre>').join('');
  }
  if(tokens){
    html += '<div class="turnLabel">Streamed answer</div>'+md(tokens);
  }
  return html;
}
function renderRun(rf){
  const t = rf.trace;
  const passed = t.results.filter(r=>r.pass).length;
  let html = '<div class="runHead"><h2>'+esc(t.name)+' '+pill(passed,t.results.length)+'</h2>'
    + '<div class="sub">'+esc(t.ranAt)+' · provider '+esc(t.provider)+' · model '+esc(t.model)+' · file <code>'+esc(rf.file)+'</code></div></div>';
  for(const c of t.results){
    html += '<div class="case"><div class="caseHead"><span class="pill '+(c.pass?'ok':'bad')+'">'+(c.pass?'PASS':'FAIL')+'</span>'
      + '<span class="id">'+esc(c.id)+'</span><span class="lat">'+c.latencyMs+'ms · '+(c.frames.length)+' turn(s)</span></div>'
      + '<div class="caseBody">'
      + '<div class="messages">'+c.messages.map(m=>'<div class="'+(/^(turn|error|runner)/.test(m)?'fail':'ok')+'">'+esc(m)+'</div>').join('')+'</div>';
    c.frames.forEach((fr,i)=>{ html += '<div class="turnLabel">Turn '+(i+1)+'</div>'+framesForTurn(fr); });
    html += '</div></div>';
  }
  el('main').innerHTML = html;
}
let active = null;
function buildSidebar(){
  const list = el('runList');
  if(RUNS.length===0){ list.innerHTML='<div class="empty">No traces yet. Run <code>npm run eval</code> first.</div>'; return; }
  list.innerHTML = RUNS.map((rf,i)=>{
    const t=rf.trace; const passed=t.results.filter(r=>r.pass).length;
    return '<button class="run" data-i="'+i+'"><div class="name">'+esc(t.name)+' '+pill(passed,t.results.length)+'</div>'
      + '<div class="meta">'+esc(t.ranAt).slice(0,19).replace('T',' ')+' · '+t.provider+'</div></button>';
  }).join('');
  list.querySelectorAll('.run').forEach(b=>{
    b.onclick=()=>{
      if(active) active.classList.remove('active');
      b.classList.add('active'); active=b;
      renderRun(RUNS[+b.dataset.i]);
    };
  });
  // auto-open the latest run of each suite? open the very latest.
  const first = list.querySelector('.run');
  if(first){ first.click(); }
}
buildSidebar();
</script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const runs = await loadRuns();
  const html = renderHtml(runs);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`eval report → ${url}`);
    if (runs.length === 0) {
      console.log("  (no traces found in evals/.runs — run `npm run eval` first)");
    } else {
      const suites = new Set(runs.map((r) => r.trace.name));
      console.log(`  ${runs.length} trace(s) across ${suites.size} suite(s): ${[...suites].join(", ")}`);
    }
    console.log("  Ctrl-C to stop.");
  });
  // keep the process alive for the server; graceful on signal.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      server.close();
      process.exit(0);
    });
  }
}

// Avoid tsx double-run on import by HMR-style loaders.
if (import.meta.url === `file://${process.argv[1]}` || fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}