import { WebSocket } from 'ws';
import fs from 'fs/promises';

interface EnqueueMsg {
  seq: number;
  line: string;
}

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';
const INPUT_PATH = process.env.INPUT || './input.txt';
const ACK_PATH = process.env.ACK || './ack.txt';
const POLL_MS = Number(process.env.POLL_MS || 250);

let inflight: EnqueueMsg[] = [];
let lastAck = -1;

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
  inflight = inflight.filter((i) => i.seq > lastAck);
  await writeInput();
}

async function writeInput() {
  const tmp = INPUT_PATH + '.tmp';
  const data = inflight.map((i) => i.line).join('\n');
  await fs.writeFile(tmp, data + (data ? '\n' : ''));
  await fs.rename(tmp, INPUT_PATH);
}

async function pollAck(ws: WebSocket) {
  try {
    const ackContent = await fs.readFile(ACK_PATH, 'utf8');
    const lines = ackContent.trim().split(/\n+/);
    const last = lines[lines.length - 1];
    const ack = last ? Number(last) : -1;
    if (ack > lastAck) {
      lastAck = ack;
      inflight = inflight.filter((i) => i.seq > lastAck);
      await writeInput();
    }
    ws.send(JSON.stringify({ type: 'drain', payload: { lastAck, inflight: inflight.length } }));
  } catch {
    ws.send(JSON.stringify({ type: 'drain', payload: { lastAck, inflight: inflight.length } }));
  }
}

function connect() {
  let backoff = 500;
  const ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    backoff = 500;
    pollAck(ws);
    setInterval(() => pollAck(ws), POLL_MS);
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'enqueue') {
      if (inflight.length >= 50) return;
      inflight.push({ seq: msg.payload.seq, line: msg.payload.line });
      await writeInput();
    }
  });

  ws.on('close', () => {
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10000);
  });

  ws.on('error', () => ws.close());
}

loadState().then(connect);
