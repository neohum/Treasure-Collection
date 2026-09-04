// dashboard.ts — the harness's local observability UI (the "studio").
//
// A zero-dependency web dashboard for watching and steering the autonomous loop,
// following the LangGraph-Studio / trace-viewer playbook, implemented on plain
// node:http against the harness's own state stores:
//
//   pipeline view   — the card state graph with the CURRENT node highlighted
//                     (live, from .harness/graph checkpoints)
//   span waterfall  — the nested execution timeline per card (trace.ts): which
//                     node ran, which tool/CLI it invoked, duration, exit status
//   breakpoints     — click a node to arm/disarm a breakpoint; the loop pauses
//                     BEFORE that node and parks the card as 'paused'
//   state editor    — inspect and PATCH a paused card's checkpoint state, then
//                     ▶ resume (sets the card back to 'open')
//   time-travel     — rewind to any earlier step from the history trail
//   screenshots     — the .harness/shots gallery (what the agent's app looked
//                     like at approval time)
//
// State arrives over SSE (`/api/stream`). The loop is a separate process, so
// something has to poll the state stores — but it is the server that does it,
// once for every viewer, and it writes to the stream only when the payload
// actually changed. That is what makes the motion in this page legible: a card
// element survives across ticks, so a status change is a transition on a living
// node rather than a full innerHTML rebuild that has nothing to animate from.
// No LLM is called anywhere in this file; the whole console is free to run.
//
// Run:  node scripts/loop/dashboard.ts            (http://127.0.0.1:4780)
// Env:  HARNESS_DASHBOARD_PORT (default 4780)
//       HARNESS_DASHBOARD_POLL_MS (default 1000) — stream refresh interval
//
// Binds 127.0.0.1 only — this is a local operator console, not a public site.
// For hosted observability, set OTEL_EXPORTER_OTLP_ENDPOINT instead and read the
// same spans in Phoenix / Jaeger / LangSmith (see trace.ts).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve, join } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getBacklog } from "./backlog.ts";
import { activeCooldowns } from "./cooldown.ts";
import { spans, recentTraces } from "./trace.ts";
import { recent as recentEvents } from "./telemetry.ts";
import { RECURRING_JOBS, laneFor } from "./lanes.ts";
import { budgetStatus } from "./budget.ts";
import {
  LIFECYCLE_SCHEMA_VERSION,
  LifecycleStream,
  buildLifecycleView,
  lifecycleStreamTiming,
  type LifecycleView,
} from "./lifecycle.ts";
import {
  loadCheckpoint, listCheckpoints, patchCheckpointState, rewind, clearCheckpoint,
  breakpoints, setBreakpoint, clearBreakpoint,
} from "./graph.ts";

const ROOT = resolve(process.cwd());
const STATE_DIR = resolve(process.env.HARNESS_STATE_DIR || resolve(ROOT, ".harness"));
const SHOTS_DIR = resolve(STATE_DIR, "shots");
const PORT = Number(process.env.HARNESS_DASHBOARD_PORT) || 4780;
const STREAM_TIMING = lifecycleStreamTiming(Number(process.env.HARNESS_DASHBOARD_POLL_MS) || 1000);
const STREAM_POLL_MS = STREAM_TIMING.pollMs;
const PING_EVERY_TICKS = STREAM_TIMING.pingEveryTicks;

// The card pipeline as declared in ralph-loop.ts — kept here for rendering only;
// the live "where is it now" comes from the checkpoint, not from this list.
const PIPELINE = ["prime", "build", "strictHealth", "challenge", "review", "ship"];
const lifecycleFeed = new LifecycleStream<LifecycleView>({
  staleAfterMs: STREAM_TIMING.staleAfterMs,
});

function json(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise<Record<string, any>>((res, rej) => {
    let body = "";
    req.on("data", (d: Buffer) => { body += d; if (body.length > 1_000_000) req.destroy(); });
    req.on("end", () => { try { res(body ? JSON.parse(body) : {}); } catch (e) { rej(e); } });
    req.on("error", rej);
  });
}

/**
 * Where the timer-driven work is pointed right now, and whether that lane can
 * currently take it.
 *
 * This is the operator's cost question answered structurally. The loop records no
 * token counts anywhere — inventing a spend chart would be decoration — but
 * "which lane does each recurring job ask for, and is it cooling down" is real,
 * and it is the knob that actually moves the bill.
 */
function laneReport() {
  const cooling = new Set(Object.keys(activeCooldowns()));
  return RECURRING_JOBS.map((job) => {
    const lane = laneFor(job);
    return {
      job,
      lane,
      // agy is the shipped default; anything else means an env override is in play.
      overridden: lane !== "agy",
      coolingDown: cooling.has(lane) || (lane === "agy" && cooling.has("antigravity")),
    };
  });
}

async function overviewPayload(): Promise<Record<string, unknown>> {
  const backlog = await getBacklog();
  // Human prompts captured in the knowledge base but not yet triaged into
  // cards (assess-prompts.ts runs only when the backlog empties). Optional:
  // in a repo without knowledge.ts the import fails and the panel stays empty.
  let pendingPrompts: Array<{ id: number; text: string }> = [];
  try {
    const { pendingPrompts: pending } = await import("./assess-prompts.ts");
    pendingPrompts = (await pending(50)).map((e: { id: number; body?: string; title?: string }) => ({
      id: e.id,
      text: String(e.body || e.title || "").slice(0, 160),
    }));
  } catch {}
  // The telemetry trail is the loop's own account of what it did — claims,
  // guards, deploys, rejections. It was reachable only over MCP and the CLI,
  // so the one surface an operator actually watches could not show it.
  let activity: Awaited<ReturnType<typeof recentEvents>> = [];
  try { activity = await recentEvents(40); } catch {}

  // What the loop actually spent. The lane panel below answers "which lane is
  // this pointed at"; this answers "and how much has that cost", which nothing
  // could report until budget.ts started keeping the ledger.
  let budget: Awaited<ReturnType<typeof budgetStatus>> | null = null;
  try { budget = await budgetStatus(); } catch {}

  const base = {
    budget,
    pipeline: PIPELINE,
    cards: backlog.list(),
    pendingPrompts,
    cooldowns: activeCooldowns(),
    checkpoints: listCheckpoints(),
    breakpoints: breakpoints(),
    traces: await recentTraces(30),
    activity,
    lanes: laneReport(),
  };
  const lifecycle = buildLifecycleView({
    cards: base.cards,
    checkpoints: base.checkpoints,
    activity: base.activity,
    budget: base.budget,
    lanes: base.lanes,
  });
  lifecycleFeed.update(lifecycle);
  const current = lifecycleFeed.currentSnapshot();
  return {
    ...base,
    schemaVersion: LIFECYCLE_SCHEMA_VERSION,
    streamId: current.streamId,
    sequence: current.sequence,
    freshness: current.freshness,
    lifecycle,
  };
}

async function cardPayload(card: string): Promise<Record<string, unknown>> {
  const backlog = await getBacklog();
  return {
    row: backlog.get(card),
    checkpoint: loadCheckpoint(card),
    spans: await spans(card),
  };
}

function shotsPayload(): Array<{ name: string; mtime: number }> {
  if (!existsSync(SHOTS_DIR)) return [];
  return readdirSync(SHOTS_DIR).filter((f) => f.endsWith(".png"))
    .map((f) => ({ name: f, mtime: statSync(join(SHOTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime).slice(0, 24);
}

async function api(req: IncomingMessage, url: URL): Promise<unknown> {
  const [, , verb, arg] = url.pathname.split("/"); // /api/<verb>/<arg?>
  const backlog = await getBacklog();

  if (req.method === "GET" && verb === "overview") return overviewPayload();
  if (req.method === "GET" && verb === "lifecycle") {
    await overviewPayload();
    return lifecycleFeed.currentSnapshot();
  }
  if (req.method === "GET" && verb === "card" && arg) return cardPayload(arg);
  if (req.method === "GET" && verb === "shots") return shotsPayload();
  if (req.method === "POST" && verb === "breakpoint") {
    const { key, node, on } = await readBody(req);
    if (!key || !node) throw new Error("key and node required");
    return on ? setBreakpoint(key, node) : clearBreakpoint(key, node);
  }
  if (req.method === "POST" && verb === "state" && arg) {
    const patch = await readBody(req);
    const cp = patchCheckpointState(arg, patch);
    if (!cp) throw new Error(`no checkpoint for "${arg}"`);
    return cp;
  }
  if (req.method === "POST" && verb === "rewind" && arg) {
    const { step } = await readBody(req);
    const cp = rewind(arg, Number(step));
    if (!cp) throw new Error(`cannot rewind "${arg}" to step ${step}`);
    return cp;
  }
  if (req.method === "POST" && verb === "resume" && arg) {
    const card = backlog.get(arg);
    if (!card) throw new Error(`no card "${arg}"`);
    if (card.status !== "paused") throw new Error(`card "${arg}" is not paused`);
    backlog.setStatus(arg, "open");
    return { card: arg, status: "open" };
  }
  if (req.method === "POST" && verb === "checkpoint-clear" && arg) {
    clearCheckpoint(arg);
    return { cleared: arg };
  }
  throw new Error(`unknown api: ${req.method} ${url.pathname}`);
}

// --- the live stream -------------------------------------------------------------
//
// One ticker serves every viewer and only exists while someone is watching. Each
// subscriber remembers the last body it was sent per event name, so an idle loop
// costs the browser nothing: the socket stays open and silent until the state
// stores actually differ. `card` is per-subscriber (whatever card that operator
// selected); `overview` and `shots` are shared and computed once per tick.

type Subscriber = {
  res: ServerResponse;
  card: string | null;
  /** last body written per event name — the change gate */
  last: Record<string, string>;
  lifecycleStreamId: string | null;
  lifecycleSequence: number;
};

const subscribers = new Set<Subscriber>();
let ticker: ReturnType<typeof setInterval> | null = null;
let pumping = false;
let ticks = 0;

function send(sub: Subscriber, event: string, data: unknown): void {
  const body = JSON.stringify(data ?? null);
  if (sub.last[event] === body) return;
  sub.last[event] = body;
  // JSON.stringify escapes newlines, so a payload can never break the framing.
  try { sub.res.write(`event: ${event}\ndata: ${body}\n\n`); } catch { drop(sub); }
}

function drop(sub: Subscriber): void {
  if (!subscribers.delete(sub)) return;
  if (!subscribers.size && ticker) { clearInterval(ticker); ticker = null; }
}

async function pump(): Promise<void> {
  if (pumping || !subscribers.size) return;
  pumping = true;
  try {
    const overview = await overviewPayload();
    const shots = shotsPayload();
    const cards = new Map<string, unknown>();
    for (const sub of [...subscribers]) {
      send(sub, "overview", overview);
      const lifecycleItems = lifecycleFeed.resume({
        streamId: sub.lifecycleStreamId,
        sequence: sub.lifecycleSequence,
      });
      for (const item of lifecycleItems) {
        send(sub, `lifecycle-${item.kind}`, item);
        sub.lifecycleStreamId = item.streamId;
        sub.lifecycleSequence = item.sequence;
      }
      send(sub, "shots", shots);
      if (sub.card) {
        if (!cards.has(sub.card)) cards.set(sub.card, await cardPayload(sub.card));
        send(sub, "card", cards.get(sub.card));
      }
    }
    // A silent socket is indistinguishable from a dead one. Ping so the page can
    // tell "nothing is happening" from "the loop host went away".
    if (++ticks % PING_EVERY_TICKS === 0) {
      for (const sub of [...subscribers]) {
        try { sub.res.write(": ping\n\n"); } catch { drop(sub); }
      }
    }
  } catch (e) {
    // A transient read error must surface in the console, not kill it — the
    // operator needs to know the panels went stale rather than see them freeze.
    const detail = String((e as Error)?.message ?? e);
    for (const sub of [...subscribers]) send(sub, "stream-error", { error: detail, at: ticks });
  } finally {
    pumping = false;
  }
}

function subscribe(req: IncomingMessage, res: ServerResponse, url: URL): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  res.write(": open\n\n");

  const sub: Subscriber = {
    res,
    card: url.searchParams.get("card") || null,
    last: {},
    lifecycleStreamId: url.searchParams.get("streamId"),
    lifecycleSequence: Math.max(0, Number(url.searchParams.get("since")) || 0),
  };
  subscribers.add(sub);
  req.on("close", () => drop(sub));
  res.on("close", () => drop(sub));
  // A socket that dies mid-write (browser tab closed, laptop slept) reports it
  // asynchronously, which the try/catch around res.write cannot see. Without a
  // listener that EPIPE is an unhandled 'error' event and takes the whole
  // console down — a long-lived stream makes this ordinary, not exotic.
  res.on("error", () => drop(sub));

  if (!ticker) {
    ticker = setInterval(() => { void pump(); }, STREAM_POLL_MS);
    ticker.unref();
  }
  void pump();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/api/stream") {
      subscribe(req, res, url);
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(res, 200, await api(req, url));
      return;
    }
    if (url.pathname.startsWith("/shots/")) {
      const name = url.pathname.slice("/shots/".length);
      // strict allowlist: a plain .png basename only — no separators, no traversal
      const p = /^[\w.-]+\.png$/.test(name) ? join(SHOTS_DIR, name) : null;
      if (p && existsSync(p)) {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(readFileSync(p));
        return;
      }
      json(res, 404, { error: "not found" });
      return;
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 400, { error: String((e as Error)?.message ?? e) });
  }
});

// --- the single-page UI (inline, no CDN — works fully offline) --------------------

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>harness studio</title>
<style>
  :root { --bg:#0e1116; --panel:#161b22; --line:#2d333b; --fg:#c9d1d9; --dim:#768390;
          --ok:#3fb950; --err:#f85149; --run:#d29922; --acc:#539bf5; --bp:#e5534b;
          --runq:rgba(210,153,34,.45); --accq:rgba(83,155,245,.30); }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; }
  header { padding:10px 16px; border-bottom:1px solid var(--line); display:flex; gap:16px; align-items:baseline; }
  header h1 { font-size:14px; margin:0; color:var(--acc); }
  header .dim { color:var(--dim); }
  main { display:grid; grid-template-columns:270px 1fr; min-height:calc(100vh - 41px); }
  #side { border-right:1px solid var(--line); padding:12px; overflow-y:auto; }
  #main { padding:16px; overflow-x:auto; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); margin:18px 0 8px; }
  h2:first-child { margin-top:0; }
  .muted { color:var(--dim); }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .flash { color:var(--ok); }
  /* one row per lane, with the share drawn behind the text */
  .lane { position:relative; display:flex; justify-content:space-between; gap:8px; padding:1px 4px; }
  .lane i { position:absolute; left:0; bottom:0; height:2px; background:var(--acc); opacity:.5;
            transition:width .4s ease; }
  [hidden] { display:none !important; }
  .list:empty::after { content:attr(data-empty); color:var(--dim); }

  /* --- stream health --------------------------------------------------- */
  .live { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--dim);
          transition:background-color .3s ease; }
  .live.on { background:var(--ok); animation:beat 2.4s ease-in-out infinite; }
  .live.off { background:var(--err); animation:beat .9s ease-in-out infinite; }
  @keyframes beat { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.35; transform:scale(.75); } }

  /* --- enter / exit ----------------------------------------------------- */
  /* The stream only writes on change, so these fire when the loop actually
     moved — an animation here is information, not decoration. */
  .enter { animation:enter .38s cubic-bezier(.2,.8,.3,1) both; }
  .exit  { animation:exit .22s ease-in both; pointer-events:none; }
  @keyframes enter { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
  @keyframes exit  { to { opacity:0; transform:translateX(10px); } }
  .bump { animation:bump .7s ease-out; }
  @keyframes bump { 0% { box-shadow:0 0 0 0 var(--accq); } 30% { box-shadow:0 0 0 4px var(--accq); }
                    100% { box-shadow:0 0 0 0 transparent; } }

  /* --- backlog ---------------------------------------------------------- */
  .card { padding:6px 8px; border:1px solid var(--line); border-radius:6px; margin-bottom:6px; cursor:pointer;
          display:flex; justify-content:space-between; gap:8px;
          transition:border-color .25s ease, background-color .25s ease; }
  .card:hover, .card.sel { border-color:var(--acc); }
  .card.sel { background:var(--panel); }
  .pill { font-size:11px; padding:0 7px; border-radius:9px; border:1px solid var(--line); white-space:nowrap;
          transition:color .35s ease, border-color .35s ease; }
  .src { font-size:10px; color:var(--dim); border:1px solid var(--line); border-radius:4px; padding:0 4px; white-space:nowrap; }
  .src-prompt { color:var(--acc); } .src-spec { color:var(--ok); }
  .st-open { color:var(--acc); } .st-claimed { color:var(--run); } .st-review { color:var(--run); }
  .st-done { color:var(--ok); } .st-failed { color:var(--err); } .st-paused { color:var(--bp); }

  /* --- pipeline --------------------------------------------------------- */
  #pipe { display:flex; align-items:center; flex-wrap:wrap; margin:8px 0 4px; }
  .step { display:inline-flex; align-items:center; }
  .step.last .arrow { display:none; }
  .node { position:relative; border:1px solid var(--line); border-radius:8px; padding:8px 14px; background:var(--panel);
          transition:border-color .4s ease, color .4s ease, background-color .4s ease, opacity .4s ease; }
  .step.past .node { color:var(--dim); opacity:.65; border-color:var(--line); }
  .step.cur .node { border-color:var(--run); color:var(--run); animation:pulse 1.9s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { box-shadow:0 0 0 1px var(--run), 0 0 0 0 var(--runq); }
                     50%     { box-shadow:0 0 0 1px var(--run), 0 0 0 9px transparent; } }
  .node .bp { position:absolute; top:-6px; right:-6px; width:12px; height:12px; border-radius:50%;
              border:1px solid var(--line); background:var(--bg); cursor:pointer;
              transition:background-color .2s ease, border-color .2s ease, transform .2s ease; }
  .node .bp:hover { transform:scale(1.35); }
  .node .bp.on { background:var(--bp); border-color:var(--bp); }
  .arrow { color:var(--dim); padding:0 8px; transition:color .4s ease; }
  .step.past .arrow { color:var(--dim); opacity:.5; }
  /* the beam only runs on the edge leaving the node the loop is standing on */
  .step.cur .arrow { color:transparent; background-image:linear-gradient(90deg,var(--dim) 0 35%,var(--run) 50%,var(--dim) 65% 100%);
                     background-size:250% 100%; -webkit-background-clip:text; background-clip:text;
                     animation:beam 1.5s linear infinite; }
  @keyframes beam { from { background-position:150% 0; } to { background-position:-100% 0; } }

  /* --- tables / waterfall ----------------------------------------------- */
  table { border-collapse:collapse; width:100%; }
  td, th { padding:3px 8px; text-align:left; border-bottom:1px solid var(--line); vertical-align:top; }
  .bar-wrap { position:relative; background:var(--panel); height:14px; border-radius:3px; min-width:260px; overflow:hidden; }
  .bar { position:absolute; top:2px; height:10px; border-radius:2px; background:var(--acc); opacity:.85;
         transform-origin:left center; transition:left .35s ease, width .35s ease, background-color .3s ease; }
  .bar.err { background:var(--err); } .bar.node-k { background:var(--run); }
  tr.enter .bar { animation:grow .45s cubic-bezier(.2,.8,.3,1) both; }
  @keyframes grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
  /* a span with no end_ms is still running — say so, don't draw a finished bar */
  .bar.live::after { content:""; position:absolute; inset:0; border-radius:2px;
                     background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);
                     animation:sweep 1.2s linear infinite; }
  @keyframes sweep { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
  #activity tr.enter td { animation:hit 1.1s ease-out both; }
  @keyframes hit { 0% { background:var(--accq); } 100% { background:transparent; } }

  button { background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:6px;
           padding:4px 10px; cursor:pointer; font:inherit; transition:border-color .2s ease; }
  button:hover { border-color:var(--acc); }
  button.warn { color:var(--bp); }
  textarea { width:100%; min-height:140px; background:var(--panel); color:var(--fg);
             border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; }
  #shots { display:flex; gap:10px; flex-wrap:wrap; }
  #shots img { width:180px; border:1px solid var(--line); border-radius:6px;
               transition:transform .2s ease, border-color .2s ease; }
  #shots img:hover { transform:scale(1.03); border-color:var(--acc); }

  @media (prefers-reduced-motion:reduce) {
    *, *::before, *::after { animation:none !important; transition:none !important; }
  }
</style>
</head>
<body>
<header>
  <h1>harness studio</h1>
  <span class="live off" id="live" title="connecting…"></span>
  <span class="dim" id="meta">connecting…</span>
  <span class="dim" style="margin-left:auto">breakpoint = red dot on a node · paused cards need ▶ resume</span>
</header>
<main>
  <div id="side">
    <h2>Backlog</h2>
    <div id="cards" class="list" data-empty="(empty)"></div>
    <h2>Prompts awaiting triage</h2>
    <div id="pending" class="list" data-empty="(none — every captured prompt is triaged)"></div>
    <h2>Spend (24h)</h2>
    <div id="budget" class="list" data-empty="(no agent calls recorded)"></div>
    <h2>Cooldowns</h2>
    <div id="cooldowns" class="list" data-empty="none — all agents available"></div>
    <h2>Recurring lanes</h2>
    <div id="lanes" class="list" data-empty="(none)"></div>
    <h2>Recent traces</h2>
    <div id="traces" class="list" data-empty="(none yet)"></div>
  </div>
  <div id="main">
    <h2>Pipeline <span class="muted" id="pipecard">select a card</span></h2>
    <div id="pipe"></div>
    <div id="ctrl" class="row"></div>
    <h2>Span waterfall</h2>
    <div id="waterHint" class="muted">no spans yet</div>
    <table><tbody id="water"></tbody></table>
    <h2>Checkpoint history (click a step to rewind)</h2>
    <div id="hist" class="muted">—</div>
    <h2>State editor <span class="muted">(patch merges into the checkpoint state)</span></h2>
    <textarea id="state" spellcheck="false" placeholder='{"feedback": ""}'></textarea>
    <div class="row" style="margin-top:6px">
      <button id="saveState">save state patch</button>
      <span id="stateMsg"></span>
    </div>
    <h2>Activity <span class="muted">(the loop's own trail — claims, guards, deploys, rejections)</span></h2>
    <div id="activityHint" class="muted">(no events yet)</div>
    <table>
      <thead id="activityHead" hidden><tr><th>when</th><th>kind</th><th>card</th><th>actor</th><th>detail</th></tr></thead>
      <tbody id="activity"></tbody>
    </table>
    <h2>Screenshots (.harness/shots)</h2>
    <div id="shots" class="list" data-empty="(none)"></div>
  </div>
</main>
<script>
var sel = null, overview = null, cardData = null, es = null;
/* breakpoint toggles the server has not confirmed yet — without this the next
   push (up to a tick away) would visibly snap the dot back under the cursor. */
var pendingBp = {};

function el(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
  return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
function api(path, body) {
  var opts = body ? { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body) } : {};
  return fetch(path, opts).then(function (r) { return r.json(); });
}

/* --- DOM primitives ---------------------------------------------------------
   The stream writes only when state changed, so the page must *update* nodes
   rather than rebuild them: a transition needs the element it started on to
   still be there. setHTML also stops the screenshot gallery from re-requesting
   every image on every tick. */
function tpl(html) {
  var t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function setHTML(box, html) { if (box.__html !== html) { box.__html = html; box.innerHTML = html; } }
function setText(box, s) { if (box.textContent !== s) box.textContent = s; }
function setClass(box, cls) { if (box.className !== cls) box.className = cls; }
function bump(n) {
  n.classList.remove("bump");
  void n.offsetWidth; /* restart the keyframe on a node that is already mounted */
  n.classList.add("bump");
  setTimeout(function () { n.classList.remove("bump"); }, 720);
}

/* Keyed reconciliation: a row that survives a push is the same DOM node, so only
   what actually moved animates. Departing rows hold their slot while they fade
   so the rows around them do not jump. */
function syncList(box, items, keyOf, create, update) {
  var live = box.__live || (box.__live = {});
  var dying = box.__dying || (box.__dying = {});
  var next = {};
  var cursor = box.firstChild;
  items.forEach(function (item) {
    var k = String(keyOf(item));
    var n = live[k] || null;
    if (!n && dying[k]) {
      n = dying[k];
      clearTimeout(n.__timer); n.__dying = false; n.classList.remove("exit"); delete dying[k];
    }
    if (!n) {
      n = create(item);
      n.classList.add("enter");
      n.__timer = setTimeout(function () { n.classList.remove("enter"); }, 420);
    }
    update(n, item);
    next[k] = n;
    while (cursor && cursor.__dying) cursor = cursor.nextSibling;
    if (cursor === n) cursor = cursor.nextSibling;
    else box.insertBefore(n, cursor);
  });
  Object.keys(live).forEach(function (k) {
    if (next[k]) return;
    var n = live[k];
    n.__dying = true;
    n.classList.remove("enter");
    n.classList.add("exit");
    dying[k] = n;
    clearTimeout(n.__timer);
    n.__timer = setTimeout(function () {
      delete dying[k];
      if (n.parentNode) n.parentNode.removeChild(n);
    }, 240);
  });
  box.__live = next;
}

/* --- panels ------------------------------------------------------------- */
function renderOverview(o) {
  overview = o;
  setText(el("meta"), o.cards.length + " cards · " + o.checkpoints.length + " live checkpoints");
  renderCards(o.cards);

  setHTML(el("pending"), (o.pendingPrompts || []).map(function (p) {
    return '<div class="card" title="kb#' + esc(p.id) + '"><span>' + esc(p.text) + '</span></div>';
  }).join(""));

  renderBudget(o.budget);

  setHTML(el("cooldowns"), Object.keys(o.cooldowns || {}).map(function (a) {
    return '<div>' + esc(a) + ' → ' + esc(new Date(o.cooldowns[a].until).toLocaleTimeString()) + '</div>';
  }).join(""));

  // Where the timer-driven work is pointed. No token counts are recorded anywhere
  // in the loop, so this answers the cost question with the knob that moves it
  // rather than with a spend chart nothing could populate honestly.
  setHTML(el("lanes"), (o.lanes || []).map(function (l) {
    var cls = l.coolingDown ? "st-failed" : (l.overridden ? "st-claimed" : "st-done");
    var note = l.coolingDown ? " (cooling down)" : (l.overridden ? " (override)" : "");
    return '<div>' + esc(l.job) + ' <span class="' + cls + '">→ ' + esc(l.lane) + esc(note) + '</span></div>';
  }).join(""));

  setHTML(el("traces"), (o.traces || []).map(function (t) {
    return '<div class="card" data-trace="' + esc(t.trace_id) + '"><span>' + esc(t.trace_id) +
      '</span><span class="pill">' + esc(t.n) + ' spans</span></div>';
  }).join(""));

  renderActivity(o.activity || []);
  renderPipe(cardData && cardData.checkpoint, o.breakpoints);
}

/* Spend, stated as precisely as the ledger can honestly state it: calls and
   wall-clock are true of every lane, token counts only of the lanes that
   reported them — so the panel names that denominator instead of printing a
   confident 0 for a lane that simply never said. */
function renderBudget(b) {
  if (!b || !b.today || !b.today.calls) { setHTML(el("budget"), ""); return; }
  var t = b.today, rows = [];
  rows.push('<div>' + t.calls + ' calls · ' + Math.round(t.ms / 1000) + 's agent time</div>');
  rows.push('<div>' + (t.tokens ? t.tokens + ' tokens' : 'tokens not reported') +
    ' <span class="muted">(' + t.reportedCalls + '/' + t.calls + ' lanes reporting)</span></div>');
  /* By lane, not just in total: the un-rationed lane SHOULD dominate this — that
     is what routing verification to it means — and a metered lane climbing the
     list is the thing worth noticing. */
  (b.todayByAgent || []).forEach(function (lane) {
    var share = t.calls ? Math.round((lane.calls / t.calls) * 100) : 0;
    rows.push('<div class="lane"><span>' + esc(lane.agent) + '</span>'
      + '<span class="muted">' + lane.calls + ' · ' + share + '%</span>'
      + '<i style="width:' + share + '%"></i></div>');
  });
  var caps = Object.keys(b.limits || {}).filter(function (k) { return b.limits[k] != null; });
  rows.push(caps.length
    ? '<div class="muted">caps: ' + caps.map(function (k) { return esc(k) + '=' + esc(b.limits[k]); }).join(", ") + '</div>'
    : '<div class="st-failed">no cap set — nothing bounds the spend</div>');
  if (b.tokenCapBlind) rows.push('<div class="st-paused">token cap set but no lane reports counts — it cannot bite</div>');
  (b.exceeded || []).forEach(function (r) { rows.push('<div class="st-failed">OVER: ' + esc(r) + '</div>'); });
  setHTML(el("budget"), rows.join(""));
}

function renderCards(list) {
  syncList(el("cards"), list, function (c) { return c.card; },
    function (c) {
      var n = tpl('<div class="card"><span class="nm"></span><span class="pill"></span></div>');
      n.addEventListener("click", function () { pick(c.card); });
      return n;
    },
    function (n, c) {
      var nm = n.querySelector(".nm"), pill = n.querySelector(".pill");
      setHTML(nm, esc(c.card) +
        (c.source ? ' <span class="src src-' + esc(c.source) + '">' + esc(c.source) + '</span>' : ""));
      if (n.__status && n.__status !== c.status) bump(n); /* the card really moved */
      n.__status = c.status;
      setText(pill, c.status);
      pill.className = "pill st-" + c.status;
      n.classList.toggle("sel", sel === c.card);
    });
}

function renderActivity(rows) {
  el("activityHint").hidden = rows.length > 0;
  el("activityHead").hidden = rows.length === 0;
  /* trail rows come from SQLite or not at all, so the row id is the key — a
     composite fallback could collide, and a duplicate key orphans a node in the
     DOM on every push. */
  syncList(el("activity"), rows, function (e) { return e.id; },
    function () {
      return tpl('<tr><td class="muted when"></td><td class="kind"></td><td class="who"></td>' +
                 '<td class="actor"></td><td class="detail"></td></tr>');
    },
    function (n, e) {
      setText(n.querySelector(".when"), String(e.ts || "").replace("T", " ").slice(0, 19));
      var k = n.querySelector(".kind");
      setText(k, e.kind);
      setClass(k, "kind " + (e.kind === "error" || e.kind === "reject" ? "st-failed"
        : e.kind === "guard" ? "st-paused"
        : e.kind === "deploy" || e.kind === "approve" ? "st-done" : ""));
      setText(n.querySelector(".who"), e.card || "");
      setText(n.querySelector(".actor"), e.actor || "");
      setText(n.querySelector(".detail"), String(e.detail || "").slice(0, 200));
    });
}

function renderPipe(cp, bps) {
  if (!overview) return;
  var armed = ((bps && bps[sel]) || []).concat((bps && bps["*"]) || []);
  var cur = cp && cp.node;
  var steps = overview.pipeline || [];
  var curIx = steps.indexOf(cur);
  syncList(el("pipe"), steps, function (name) { return name; },
    function (name) {
      var n = tpl('<span class="step"><span class="node"><span class="lbl"></span>' +
                  '<span class="bp" title="toggle breakpoint"></span></span><span class="arrow">──▶</span></span>');
      n.querySelector(".bp").addEventListener("click", function (ev) {
        ev.stopPropagation();
        var dot = n.querySelector(".bp");
        var on = !dot.classList.contains("on");
        pendingBp[name] = on;
        dot.classList.toggle("on", on);
        toggleBp(name, on);
      });
      return n;
    },
    function (n, name) {
      var ix = steps.indexOf(name);
      var on = armed.indexOf(name) >= 0;
      if (pendingBp[name] != null) {
        if (pendingBp[name] === on) delete pendingBp[name]; else on = pendingBp[name];
      }
      setText(n.querySelector(".lbl"), name);
      n.querySelector(".bp").classList.toggle("on", on);
      n.classList.toggle("cur", name === cur);
      n.classList.toggle("past", curIx >= 0 && ix < curIx);
      n.classList.toggle("last", ix === steps.length - 1);
    });
  setText(el("pipecard"), sel
    ? "· " + sel + (cur ? " @ " + cur + " (step " + cp.step + ")" : " (no live checkpoint)")
    : "select a card");
}

function renderWater(rows) {
  el("waterHint").hidden = rows.length > 0;
  /* An open span has not ended, so it runs to *now* — measuring it to its own
     start draws a 1px sliver for work that may have been going for minutes, and
     leaves the running shimmer nothing to live on. Clamping to start_ms keeps a
     browser clock behind the loop host's from producing a negative width. */
  var now = Date.now();
  function endOf(r) { return r.end_ms || Math.max(r.start_ms, now); }
  var t0 = 0, span = 1, depth = {};
  if (rows.length) {
    t0 = Math.min.apply(null, rows.map(function (r) { return r.start_ms; }));
    var t1 = Math.max.apply(null, rows.map(endOf));
    span = Math.max(1, t1 - t0);
    rows.forEach(function (r) {
      depth[r.span_id] = r.parent_id && depth[r.parent_id] != null ? depth[r.parent_id] + 1 : 0;
    });
  }
  syncList(el("water"), rows, function (r) { return r.span_id; },
    function () {
      return tpl('<tr><td class="nm" style="white-space:nowrap"></td><td class="muted kind"></td>' +
                 '<td class="muted ms"></td><td><div class="bar-wrap"><div class="bar"></div></div></td></tr>');
    },
    function (n, r) {
      var l = ((r.start_ms - t0) / span) * 100;
      var w = Math.max(0.6, ((endOf(r) - r.start_ms) / span) * 100);
      var nm = n.querySelector(".nm");
      setText(nm, (r.status === "error" ? "✗ " : "") + r.name);
      nm.style.paddingLeft = (depth[r.span_id] * 16 + 8) + "px";
      setText(n.querySelector(".kind"), r.kind);
      setText(n.querySelector(".ms"), r.end_ms ? (r.end_ms - r.start_ms) + "ms" : "…");
      var bar = n.querySelector(".bar");
      /* no end_ms means the span is still open — draw it as running, not finished */
      setClass(bar, "bar" + (r.status === "error" ? " err" : r.kind === "node" ? " node-k" : "") +
        (r.end_ms ? "" : " live"));
      bar.style.left = l + "%";
      bar.style.width = w + "%";
    });
}

function renderHist(cp) {
  setHTML(el("hist"), cp && cp.history && cp.history.length
    ? "<table>" + cp.history.map(function (h) {
        return '<tr><td><button data-rewind="' + esc(h.step) + '">⏪ ' + esc(h.step) + '</button></td><td>' +
          esc(h.node) + " → " + esc(h.next) + '</td><td class="muted">' + esc(h.at) + "</td></tr>";
      }).join("") + "</table>"
    : '<span class="muted">no checkpoint</span>');
}

function renderCtrl(row, cp) {
  var b = [];
  if (row && row.status === "paused") b.push('<button data-act="resume">▶ resume (set open)</button>');
  if (cp) b.push('<button class="warn" data-act="clearcp">discard checkpoint (restart card)</button>');
  setHTML(el("ctrl"), b.join(" "));
}

function renderShots(list) {
  setHTML(el("shots"), (list || []).map(function (s) {
    return '<a href="/shots/' + esc(s.name) + '" target="_blank">' +
      '<img src="/shots/' + esc(s.name) + '" title="' + esc(s.name) + '"></a>';
  }).join(""));
}

function renderCard(d) {
  cardData = d;
  renderPipe(d.checkpoint, overview && overview.breakpoints);
  renderWater(d.spans || []);
  renderHist(d.checkpoint);
  renderCtrl(d.row, d.checkpoint);
  if (document.activeElement !== el("state")) {
    var v = d.checkpoint ? JSON.stringify(d.checkpoint.state, null, 2) : "";
    if (el("state").value !== v) el("state").value = v;
  }
}

/* --- actions ------------------------------------------------------------- */
function pick(card) {
  if (sel === card) return;
  sel = card;
  cardData = null;
  pendingBp = {};
  if (overview) renderCards(overview.cards);
  connect(); /* resubscribe so the server streams this card's spans */
}
function toggleBp(node, on) {
  if (!sel) return;
  /* the optimistic dot has to be surrendered if the server never took the
     toggle, or it disagrees with the loop for as long as the page is open */
  api("/api/breakpoint", { key: sel, node: node, on: on })
    .then(function (r) { if (r && r.error) throw new Error(r.error); })
    .catch(function (e) {
      delete pendingBp[node];
      setText(el("meta"), "breakpoint failed: " + (e && e.message ? e.message : e));
    });
}
function saveState() {
  if (!sel) return;
  var patch;
  try { patch = JSON.parse(el("state").value); }
  catch (e) { setText(el("stateMsg"), "invalid JSON"); return; }
  api("/api/state/" + encodeURIComponent(sel), patch).then(function () {
    el("stateMsg").innerHTML = '<span class="flash">saved</span>';
    setTimeout(function () { el("stateMsg").textContent = ""; }, 1500);
  });
}

el("saveState").addEventListener("click", saveState);
el("traces").addEventListener("click", function (ev) {
  var t = ev.target.closest("[data-trace]");
  if (t) pick(t.getAttribute("data-trace"));
});
el("hist").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-rewind]");
  if (b && sel) api("/api/rewind/" + encodeURIComponent(sel), { step: Number(b.getAttribute("data-rewind")) });
});
el("ctrl").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-act]");
  if (!b || !sel) return;
  if (b.getAttribute("data-act") === "resume") api("/api/resume/" + encodeURIComponent(sel), {});
  else api("/api/checkpoint-clear/" + encodeURIComponent(sel), {});
});

/* --- the stream ----------------------------------------------------------
   EventSource reconnects on its own, so there is no retry loop here; the dot in
   the header is the only thing that has to know the link went down. */
function connect() {
  if (es) es.close();
  es = new EventSource("/api/stream" + (sel ? "?card=" + encodeURIComponent(sel) : ""));
  es.addEventListener("overview", function (e) { renderOverview(JSON.parse(e.data)); });
  es.addEventListener("card", function (e) { renderCard(JSON.parse(e.data)); });
  es.addEventListener("shots", function (e) { renderShots(JSON.parse(e.data)); });
  /* named so it cannot collide with EventSource's own transport "error" event */
  es.addEventListener("stream-error", function (e) {
    setText(el("meta"), "stream error: " + JSON.parse(e.data).error);
  });
  es.onopen = function () { setClass(el("live"), "live on"); el("live").title = "live"; };
  es.onerror = function () { setClass(el("live"), "live off"); el("live").title = "reconnecting…"; };
}
connect();
</script>
</body>
</html>`;

// `import.meta.url` is realpath-resolved by the loader, while `process.argv[1]` is
// the raw path the caller typed. On a symlinked path (macOS /tmp -> /private/tmp,
// /var -> /private/var, linked checkouts) the two differ and a naive comparison
// makes this CLI silently no-op with exit 0. Compare both through realpath.
const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`harness studio → http://127.0.0.1:${PORT}  (state: ${STATE_DIR})`);
  });
}

export { server, api, PORT };
