import {RawData, WebSocket} from 'ws';
import fs from 'fs/promises';
import path from 'path';

interface EnqueueMsg {
  seq: number;
  line: string;
}

interface EnqueueMessage {
  type: 'enqueue';
  payload: EnqueueMsg;
}

type ServerMessage = EnqueueMessage;
type ResetMessage = { type: 'reset' };
type ScanScenesMessage = { type: 'scan.scenes' };
type IncomingServerMessage = ServerMessage | ResetMessage | ScanScenesMessage;
type ClientHello = { type: 'client.hello'; payload?: { version?: string } };
type ClientAlive = { type: 'client.alive'; payload: { ts: number } };
type ClientScenes = { type: 'client.scenes'; payload: { root: string; files: string[] } };

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080/_ws';
const INPUT_PATH = process.env.INPUT || './input.txt';
const ACK_PATH = process.env.ACK || './ack.txt';
const OUTPUT_PATH = process.env.OUTPUT || './output.txt';
const OUTPUT_POS_PATH = process.env.OUTPUT_POS || './output.pos';
const INPUT_LOG_PATH = process.env.INPUT_LOG || '';
const POLL_MS = Number(process.env.POLL_MS || 250);
const RESET_ESCALATE_START = Number(process.env.RESET_ESCALATE_START || 1_000_000);
const RESET_ESCALATE_INTERVAL_MS = Number(process.env.RESET_ESCALATE_INTERVAL_MS || 1000);
const RESET_ESCALATE_MAX = Number(process.env.RESET_ESCALATE_MAX || 1_000_000_000);

let inflight: EnqueueMsg[] = [];
let lastAck = -1;
let isResetting = false;
let resetSeq: number | null = null;
let resetMinSeqSent: number | null = null;
let resetEscalateNext = RESET_ESCALATE_START;
let resetEscalateTimer: NodeJS.Timeout | null = null;
const pending: EnqueueMsg[] = [];
let lastOutputSeq = -1;
let ackPolling = false;
let outPolling = false;
let hbTimer: NodeJS.Timeout | null = null;
let ackTimer: NodeJS.Timeout | null = null;
let outTimer: NodeJS.Timeout | null = null;
let scenesTimer: NodeJS.Timeout | null = null;

async function writeAtomic(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, filePath);
  } catch (e: any) {
    if (e && (e.code === 'ENOENT' || e.code === 'EXDEV')) {
      // Retry once: write temp again then rename
      try {
        await fs.writeFile(tmp, data);
        await fs.rename(tmp, filePath);
      } catch (e2) {
        throw e2;
      }
    } else {
      throw e;
    }
  }
}

async function loadState() {
  try {
    const content = await fs.readFile(INPUT_PATH, 'utf8');
    inflight = content.trim().split(/\n+/).filter(Boolean).map((line) => {
      const [seqStr, cmd, ...rest] = line.split(' ');
      return { seq: Number(seqStr), line };
    });
  } catch {}
  try {
    const ackContent = await fs.readFile(ACK_PATH, 'utf8');
    const lines = ackContent.trim().split(/\n+/);
    const last = lines[lines.length - 1];
    lastAck = last ? Number(last) : -1;
  } catch {}
  try {
    const posContent = await fs.readFile(OUTPUT_POS_PATH, 'utf8');
    const pos = Number((posContent || '').trim());
    if (Number.isFinite(pos)) lastOutputSeq = pos;
  } catch {}
  inflight = inflight.filter((i) => i.seq > lastAck);
  debug('[client] loaded state:', { inflight: inflight.length, lastAck });
  await writeInput();
}

// No external sync: we rely on explicit reset to clear output and position.

let writeInputChain: Promise<void> = Promise.resolve();
async function writeInput() {
  // Serialize writes to avoid race conditions on the same file
  writeInputChain = writeInputChain.then(async () => {
    const effective = isResetting && resetSeq != null
      ? inflight.filter((i) => i.seq === resetSeq)
      : inflight;
    const data = effective.map((i) => i.line).join('\n');
    await writeAtomic(INPUT_PATH, data + (data ? '\n' : ''));
    if (INPUT_LOG_PATH) {
      try {
        const ts = new Date().toISOString();
        const log = `[${ts}] writeInput resetting=${isResetting} lines=${effective.length}\n` + (data ? data + '\n' : '');
        await fs.appendFile(INPUT_LOG_PATH, log);
      } catch {}
    }
    debug('[client] wrote input file:', { path: INPUT_PATH, lines: effective.length, resetting: isResetting, resetSeq });
  }).catch((e) => {
    console.log('[client] writeInput error:', String(e));
  });
  return writeInputChain;
}

async function pollAck(ws: WebSocket): Promise<void> {
  if (ackPolling) return;
  ackPolling = true;
  try {
    const ackContent = await fs.readFile(ACK_PATH, 'utf8');
    const lines = ackContent.trim().split(/\n+/);
    const last = lines[lines.length - 1];
    const ack = last ? Number(last) : -1;
    if (ack > lastAck) {
      const delta = ack - lastAck;
      // Verbose per-ack logging only in debug mode; otherwise compact summary
      if (LOG_LEVEL === 'debug' && delta <= 50) {
        for (let s = lastAck + 1; s <= ack; s++) console.log('[client] ack:', s);
      } else {
        console.log('[client] ack-progress:', { to: ack, delta });
      }
      lastAck = ack;
      // If we were resetting and the reset has been acknowledged, finish reset.
      if (isResetting && resetMinSeqSent != null && ack >= resetMinSeqSent) {
        console.log('[client] RESET acknowledged. Completing reset and switching to normal operation.', { resetSeq });
        // Fresh ack.txt: truncate the file so we start clean
        try {
          await writeAtomic(ACK_PATH, '');
          console.log('[client] ack.txt cleared for fresh start:', { path: ACK_PATH });
        } catch (e) {
          console.log('[client] failed clearing ack.txt (continuing):', String(e));
        }
        // Fresh output: clear file and reset position so new seq start at 0 is accepted
        try {
          await writeAtomic(OUTPUT_PATH, '');
          await writeAtomic(OUTPUT_POS_PATH, '-1');
          lastOutputSeq = -1;
          console.log('[client] output cleared after RESET ACK; position reset');
        } catch (e) {
          console.log('[client] failed preparing fresh output after ACK (continuing):', String(e));
        }
        // Reset internal state (fresh start) and DROP any buffered commands per protocol
        isResetting = false;
        const completedResetSeq = resetSeq;
        resetSeq = null;
        resetMinSeqSent = null;
        resetEscalateNext = RESET_ESCALATE_START;
        if (resetEscalateTimer) { clearInterval(resetEscalateTimer); resetEscalateTimer = null; }
        lastAck = -1;
        inflight = [];
        pending.splice(0, pending.length);
        // Clear input so RESET line is not reprocessed
        try { await writeAtomic(INPUT_PATH, ''); } catch {}
        // Inform server we completed RESET so it can clear its queue/seq
        try { ws.send(JSON.stringify({ type: 'reset.ack', payload: { seq: completedResetSeq } })); } catch {}
      } else {
        inflight = inflight.filter((i) => i.seq > lastAck);
      }
      await writeInput();
    }
    ws.send(JSON.stringify({ type: 'drain', payload: { lastAck, inflight: inflight.length } }));
    debug('[client] sent drain:', { lastAck, inflight: inflight.length });
  } catch {
    ws.send(JSON.stringify({ type: 'drain', payload: { lastAck, inflight: inflight.length } }));
    debug('[client] sent drain (no ack file):', { lastAck, inflight: inflight.length });
  }
  ackPolling = false;
}

function connect() {
  let backoff = 500;
  const ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    debug('[client] connected to server:', SERVER_URL);
    backoff = 500;
    // Clear any previous timers from a prior connection
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (ackTimer) { clearInterval(ackTimer); ackTimer = null; }
    if (outTimer) { clearInterval(outTimer); outTimer = null; }
    if (scenesTimer) { clearInterval(scenesTimer); scenesTimer = null; }
    // announce presence
    const hello: ClientHello = { type: 'client.hello', payload: { version: '0.1.0' } };
    ws.send(JSON.stringify(hello));
    // start heartbeat
    hbTimer = setInterval(() => {
      const alive: ClientAlive = { type: 'client.alive', payload: { ts: Date.now() } };
      ws.send(JSON.stringify(alive));
    }, 3000);
    // Initial scenes publish and periodic refresh to avoid drift
    scanAndPublishScenes(ws).catch(() => {});
    scenesTimer = setInterval(() => scanAndPublishScenes(ws).catch(() => {}), 30000);
    // Initiate RESET handshake: write a new input.txt containing ONLY "<lastAck+1> RESET"
    resetSeq = (lastAck ?? -1) + 1;
    resetMinSeqSent = resetSeq;
    resetEscalateNext = RESET_ESCALATE_START;
    isResetting = true;
    // Proactively clear output so stale lines don't leak through during reset
    (async () => {
      try {
        await writeAtomic(OUTPUT_PATH, '');
        await writeAtomic(OUTPUT_POS_PATH, '-1');
        lastOutputSeq = -1;
        console.log('[client] output cleared at RESET start; position reset');
      } catch (e) {
        console.log('[client] failed clearing output at RESET start (continuing):', String(e));
      }
    })().catch(() => {});
    // Preserve any existing inflight items by buffering them first
    while (inflight.length) pending.push(inflight.shift()!);
    inflight = [ { seq: resetSeq, line: `${resetSeq} RESET` } ];
    console.log('[client] reset-start:', { resetSeq });
    // Do NOT clear output.txt at reset start; keep lastOutputSeq so events aren't lost
    writeInput().catch(() => {});
    pollAck(ws);
    ackTimer = setInterval(() => pollAck(ws), POLL_MS);
    outTimer = setInterval(() => pollOutput(ws), POLL_MS);
    // Start exponential RESET escalation if not acknowledged
    if (resetEscalateTimer) { clearInterval(resetEscalateTimer); }
    resetEscalateTimer = setInterval(() => {
      if (!isResetting) return;
      if (resetMinSeqSent == null) return;
      // If already acknowledged, do nothing (pollAck will flip isResetting)
      if (lastAck >= resetMinSeqSent) return;
      // Escalate the RESET seq: 1e6, 2e6, 4e6, ...
      const next = Math.min(resetEscalateNext, RESET_ESCALATE_MAX);
      if (resetSeq !== next) {
        resetSeq = next;
        // Keep min as the smallest attempt so ack of any earlier attempt completes reset
        resetMinSeqSent = Math.min(resetMinSeqSent, resetSeq);
        inflight = [ { seq: resetSeq, line: `${resetSeq} RESET` } ];
        console.log('[client] reset-escalate:', { resetSeq });
        writeInput().catch(() => {});
      }
      // Prepare next exponential step
      resetEscalateNext = Math.min(next * 2, RESET_ESCALATE_MAX);
    }, RESET_ESCALATE_INTERVAL_MS);
  });

  ws.on('message', async (data: RawData) => {
    const msg = JSON.parse(data.toString()) as IncomingServerMessage;
    if (msg.type === 'reset') {
      if (!isResetting) {
        // Start reset handshake initiated by server
        resetSeq = (lastAck ?? -1) + 1;
        resetMinSeqSent = resetSeq;
        resetEscalateNext = RESET_ESCALATE_START;
        isResetting = true;
        // Preserve any in-flight commands by buffering them before we keep input.txt with only RESET
        while (inflight.length) pending.push(inflight.shift()!);
        inflight = [ { seq: resetSeq, line: `${resetSeq} RESET` } ];
        // Clear output and position to accept fresh seq 0
        try {
          await writeAtomic(OUTPUT_PATH, '');
          await writeAtomic(OUTPUT_POS_PATH, '-1');
          lastOutputSeq = -1;
          console.log('[client] reset-start (server):', { resetSeq });
          await writeInput();
        } catch (e) {
          console.log('[client] reset-start (server) failed preparing files:', String(e));
        }
        // Start/reset escalation timer for server-initiated reset
        if (resetEscalateTimer) { clearInterval(resetEscalateTimer); }
        resetEscalateTimer = setInterval(() => {
          if (!isResetting) return;
          if (resetMinSeqSent == null) return;
          if (lastAck >= resetMinSeqSent) return;
          const next = Math.min(resetEscalateNext, RESET_ESCALATE_MAX);
          if (resetSeq !== next) {
            resetSeq = next;
            resetMinSeqSent = Math.min(resetMinSeqSent, resetSeq);
            inflight = [ { seq: resetSeq, line: `${resetSeq} RESET` } ];
            console.log('[client] reset-escalate:', { resetSeq });
            writeInput().catch(() => {});
          }
          resetEscalateNext = Math.min(next * 2, RESET_ESCALATE_MAX);
        }, RESET_ESCALATE_INTERVAL_MS);
      }
      return;
    }
    if (msg.type === 'enqueue') {
      if (inflight.length >= 50) return;
      const item = { seq: msg.payload.seq, line: msg.payload.line };
      if (isResetting) {
        // Buffer until RESET completes to keep input.txt containing only RESET line
        pending.push(item);
        debug('[client] buffered enqueue (during reset):', { seq: item.seq });
      } else {
        inflight.push(item);
        console.log('[client] command-received:', { seq: item.seq });
        await writeInput();
      }
    }
    if (msg.type === 'scan.scenes') {
      try { await scanAndPublishScenes(ws); } catch {}
      return;
    }
  });

  ws.on('close', () => {
    debug('[client] connection closed; will retry in ms:', backoff);
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (ackTimer) { clearInterval(ackTimer); ackTimer = null; }
    if (outTimer) { clearInterval(outTimer); outTimer = null; }
    if (scenesTimer) { clearInterval(scenesTimer); scenesTimer = null; }
    if (resetEscalateTimer) { clearInterval(resetEscalateTimer); resetEscalateTimer = null; }
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10000);
  });

  ws.on('error', (err) => {
    debug('[client] ws error:', String(err));
    ws.close();
  });
}

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const debug = (...args: unknown[]) => {
  if (LOG_LEVEL === 'debug') console.log(...args);
};

// Parse params of the form: [1, true, IAmAString]
function parseParams(raw: string): unknown[] {
  const s = raw.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return [];
  const inner = s.slice(1, -1);
  if (!inner.trim()) return [];
  return inner.split(',').map((t) => {
    const v = t.trim();
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
    return v; // treat as string without quotes
  });
}

async function pollOutput(ws: WebSocket): Promise<void> {
  // If resetting, skip without toggling the polling lock
  if (isResetting) return;
  if (outPolling) return;
  outPolling = true;
  try {
    const out = await fs.readFile(OUTPUT_PATH, 'utf8');
    const lines = out.split(/\n+/).filter(Boolean);
    for (const line of lines) {
      const firstSpace = line.indexOf(' ');
      if (firstSpace === -1) continue;
      const seqStr = line.slice(0, firstSpace);
      const rest1 = line.slice(firstSpace + 1);
      const secondSpace = rest1.indexOf(' ');
      if (secondSpace === -1) continue;
      const cmd = rest1.slice(0, secondSpace);
      const paramsRaw = rest1.slice(secondSpace + 1);
      const seq = Number(seqStr);
      if (!Number.isFinite(seq)) continue;
      // Skip stale or duplicate lines; if seq goes backwards, treat as out-of-order and skip
      if (seq <= lastOutputSeq) continue;
      const params = parseParams(paramsRaw);
      ws.send(JSON.stringify({ type: 'output', payload: { seq, cmd, params } }));
      console.log('[client] output-received:', { seq, cmd });
      lastOutputSeq = seq;
      try { await writeAtomic(OUTPUT_POS_PATH, String(lastOutputSeq)); } catch {}
    }
  } catch {
    // ignore missing output file
  }
  outPolling = false;
}

async function scanAndPublishScenes(ws: WebSocket): Promise<void> {
  const root = process.env.SCENES_DIR || './scenes';
  const files: string[] = [];
  async function walk(dir: string, rel = ''): Promise<void> {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true }) as any;
    } catch {
      return;
    }
    for (const ent of entries) {
      const name = ent.name as string;
      const full = dir + '/' + name;
      const relPath = rel ? rel + '/' + name : name;
      if ((ent as any).isDirectory?.()) {
        await walk(full, relPath);
      } else if (name.endsWith('.phn') || name.endsWith('.phz')) {
        files.push(relPath);
      }
    }
  }
  await walk(root);
  const msg: ClientScenes = { type: 'client.scenes', payload: { root, files } };
  ws.send(JSON.stringify(msg));
  debug('[client] published scenes:', { count: files.length });
}

loadState().then(connect);
