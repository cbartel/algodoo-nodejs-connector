import { WebSocket } from 'ws';
import { createReadStream, existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import type {
  ServerPlugin,
  PluginContext,
  ClientMessage,
} from 'algodoo-server';
import type { IncomingMessage, ServerResponse } from 'http';

export interface SubmitPayload {
  cmd: 'EVAL';
  params: string;
}

export interface DrainPayload {
  lastAck: number;
}

export class SeqCounter {
  private n = 0;
  next(): number {
    return this.n++;
  }
}

export function serializeParams(p: string): string {
  return p.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

interface EnqueueItem {
  seq: number;
  line: string;
}

const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 10000);

let lastAck = -1;
const inflight: EnqueueItem[] = [];
const uiClients = new Set<WebSocket>();
let algodooClient: WebSocket | null = null;

function handleSubmit(ws: WebSocket, payload: SubmitPayload, ctx: PluginContext): void {
  if (!algodooClient) {
    debug('[server:cmd] submit rejected: no algodoo client connected');
    ctx.send(ws, { type: 'rejected', payload: { reason: 'no-client' } });
    return;
  }
  if (inflight.length >= 50) {
    debug('[server:cmd] submit rejected: backpressure');
    ctx.send(ws, { type: 'rejected', payload: { reason: 'backpressure' } });
    return;
  }
  const seq = seqCounter.next();
  const line = `${seq} ${payload.cmd} ${serializeParams(payload.params)}`;
  inflight.push({ seq, line });
  console.log('[server:cmd] command-received:', { seq, cmd: payload.cmd });
  ctx.send(ws, { type: 'accepted', payload: { seq, cmd: payload.cmd } });
  for (const other of uiClients) {
    if (other !== ws) ctx.send(other, { type: 'accepted', payload: { seq, cmd: payload.cmd } });
  }
  if (algodooClient && algodooClient.readyState === WebSocket.OPEN) {
    debug('[server:cmd] enqueue to algodoo-client:', { seq });
    ctx.send(algodooClient, { type: 'enqueue', payload: { seq, line } });
  }
}

function handleDrain(ws: WebSocket, payload: DrainPayload, ctx: PluginContext): void {
  if (algodooClient !== ws) {
    algodooClient = ws;
  }
  const { lastAck: ack } = payload;
  if (ack > lastAck) {
    let removed = 0;
    for (const item of [...inflight]) {
      if (item.seq <= ack) {
        inflight.shift();
        ctx.broadcast({ type: 'acked', payload: { seq: item.seq } });
        console.log('[server:cmd] command-acked:', { seq: item.seq });
        removed++;
      } else break;
    }
    debug('[server:cmd] ack received:', { ack, removed, remaining: inflight.length });
    lastAck = ack;
  }
}

export const seqCounter = new SeqCounter();
const __dirname = dirname(fileURLToPath(import.meta.url));
const uiDir = join(__dirname, 'ui');

export const cmdDispatcherPlugin: ServerPlugin = {
  name: 'cmd-dispatcher',
  path: 'cmd',
  handleHttp(req: IncomingMessage, res: ServerResponse) {
    let urlPath = req.url ?? '/cmd';
    urlPath = urlPath.replace(/^\/?cmd\/?/, '');
    const filePath = join(uiDir, urlPath || 'index.html');
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      if (ext === '.js') res.setHeader('Content-Type', 'text/javascript');
      else if (ext === '.html') res.setHeader('Content-Type', 'text/html');
      debug('[server:cmd] serve ui:', { urlPath, filePath });
      createReadStream(filePath).pipe(res);
    } else {
      debug('[server:cmd] 404 ui:', { urlPath, filePath });
      res.statusCode = 404;
      res.end('not found');
    }
  },
  init(ctx) {
    setInterval(() => {
      ctx.broadcast({ type: 'status', payload: { inflight: inflight.length, lastAck } });
      debug('[server:cmd] heartbeat:', { inflight: inflight.length, lastAck });
    }, HEARTBEAT_MS);
  },
  onConnection(ws) {
    uiClients.add(ws);
    debug('[server:cmd] ui connected. total:', uiClients.size);
  },
  onMessage(ws, msg: ClientMessage<unknown>, ctx) {
    if (msg.type === 'submit') {
      handleSubmit(ws, msg.payload as SubmitPayload, ctx);
    } else if (msg.type === 'drain') {
      handleDrain(ws, msg.payload as DrainPayload, ctx);
    } else if (msg.type === 'output') {
      const payload = msg.payload as { seq: number; cmd: string; params: unknown[] };
      console.log('[server:cmd] output-received:', { seq: payload.seq, cmd: payload.cmd });
      // Relay to all UI clients
      ctx.broadcast({ type: 'output', payload });
    } else if (msg.type === 'status') {
      debug('[server:cmd] status requested:', { inflight: inflight.length, lastAck });
      ctx.send(ws, { type: 'status', payload: { inflight: inflight.length, lastAck } });
    }
  },
  onClose(ws) {
    uiClients.delete(ws);
    debug('[server:cmd] ui disconnected. total:', uiClients.size);
    if (algodooClient === ws) algodooClient = null;
  },
};

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const debug = (...args: unknown[]) => {
  if (LOG_LEVEL === 'debug') console.log(...args);
};
export default cmdDispatcherPlugin;
