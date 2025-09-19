import {RawData, WebSocket} from 'ws';
import fs from 'fs/promises';

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
type IncomingServerMessage = ServerMessage | ResetMessage;
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

let inflight: EnqueueMsg[] = [];
let lastAck = -1;
let isResetting = false;
let resetSeq: number | null = null;
const pending: EnqueueMsg[] = [];
let lastOutputSeq = -1;

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = path + '.tmp';
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, path);
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

async function writeInput() {
  // If resetting, ensure ONLY the reset line is present in the input file
  const effective = isResetting && resetSeq != null
    ? inflight.filter((i) => i.seq === resetSeq)
    : inflight;
  const data = effective.map((i) => i.line).join('\n');
  await writeAtomic(INPUT_PATH, data + (data ? '\n' : ''));
  // Optional mirror for observability
  if (INPUT_LOG_PATH) {
    try {
      const ts = new Date().toISOString();
      const log = `[${ts}] writeInput resetting=${isResetting} lines=${effective.length}\n` + (data ? data + '\n' : '');
      await fs.appendFile(INPUT_LOG_PATH, log);
    } catch {}
  }
  debug('[client] wrote input file:', { path: INPUT_PATH, lines: effective.length, resetting: isResetting, resetSeq });
}

async function pollAck(ws: WebSocket): Promise<void> {
  try {
    const ackContent = await fs.readFile(ACK_PATH, 'utf8');
    const lines = ackContent.trim().split(/\n+/);
    const last = lines[lines.length - 1];
    const ack = last ? Number(last) : -1;
    if (ack > lastAck) {
      // Log each acked sequence number for transparency
      for (let s = lastAck + 1; s <= ack; s++) console.log('[client] ack:', s);
      lastAck = ack;
      // If we were resetting and the reset has been acknowledged, finish reset.
      if (isResetting && resetSeq != null && ack >= resetSeq) {
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
        // Reset internal state
        isResetting = false;
        resetSeq = null;
        lastAck = -1;
        inflight = [];
        // Move ALL buffered pending enqueues into inflight and write them out
        while (pending.length) inflight.push(pending.shift()!);
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
}

function connect() {
  let backoff = 500;
  const ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    debug('[client] connected to server:', SERVER_URL);
    backoff = 500;
    // announce presence
    const hello: ClientHello = { type: 'client.hello', payload: { version: '0.1.0' } };
    ws.send(JSON.stringify(hello));
    // start heartbeat
    setInterval(() => {
      const alive: ClientAlive = { type: 'client.alive', payload: { ts: Date.now() } };
      ws.send(JSON.stringify(alive));
    }, 3000);
    // scan scenes directory and publish
    scanAndPublishScenes(ws).catch(() => {});
    setInterval(() => scanAndPublishScenes(ws).catch(() => {}), 15000);
    // Initiate RESET handshake: write a new input.txt containing ONLY "<lastAck+1> RESET"
    resetSeq = (lastAck ?? -1) + 1;
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
    setInterval(() => pollAck(ws), POLL_MS);
    setInterval(() => pollOutput(ws), POLL_MS);
  });

  ws.on('message', async (data: RawData) => {
    const msg = JSON.parse(data.toString()) as IncomingServerMessage;
    if (msg.type === 'reset') {
      if (!isResetting) {
        // Start reset handshake initiated by server
        resetSeq = (lastAck ?? -1) + 1;
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
  });

  ws.on('close', () => {
    debug('[client] connection closed; will retry in ms:', backoff);
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
  try {
    if (isResetting) return; // do not process outputs while negotiating RESET
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
