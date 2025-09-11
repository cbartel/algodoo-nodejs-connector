import { WebSocketServer, WebSocket } from 'ws';

interface ClientMessage {
  type: string;
  payload?: any;
}

interface SubmitPayload {
  cmd: 'EVAL';
  params: string;
}

interface EnqueueItem {
  seq: number;
  line: string;
}

const DEFAULT_PORT = Number(process.env.PORT || 8080);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 10000);

export class SeqCounter {
  private n = 0;
  next() {
    return this.n++;
  }
}

export const seqCounter = new SeqCounter();
let lastAck = -1;
const inflight: EnqueueItem[] = [];
const uiClients = new Set<WebSocket>();
let algodooClient: WebSocket | null = null;

export function serializeParams(p: string): string {
  return p.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function broadcast(msg: any) {
  const data = JSON.stringify(msg);
  for (const ws of uiClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
  if (algodooClient && algodooClient.readyState === WebSocket.OPEN) {
    algodooClient.send(data);
  }
}

function send(ws: WebSocket, msg: any) {
  ws.send(JSON.stringify(msg));
}

export function startServer(port = DEFAULT_PORT) {
  const wss = new WebSocketServer({ port });
  console.log(`algodoo-server listening on ${port}`);

  wss.on('connection', (ws) => {
    uiClients.add(ws);
    ws.on('message', (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        if (msg.type === 'submit') {
          handleSubmit(ws, msg.payload as SubmitPayload);
        } else if (msg.type === 'drain') {
          handleDrain(ws, msg.payload);
        } else if (msg.type === 'status') {
          send(ws, { type: 'status', payload: { inflight: inflight.length, lastAck } });
        }
      } catch (err) {
        send(ws, { type: 'error', payload: { message: String(err) } });
      }
    });

    ws.on('close', () => {
      uiClients.delete(ws);
      if (algodooClient === ws) algodooClient = null;
    });
  });

  setInterval(() => {
    broadcast({ type: 'status', payload: { inflight: inflight.length, lastAck } });
  }, HEARTBEAT_MS);

  return wss;
}

function handleSubmit(ws: WebSocket, payload: SubmitPayload) {
  if (!algodooClient) {
    send(ws, { type: 'rejected', payload: { reason: 'no-client' } });
    return;
  }
  if (inflight.length >= 50) {
    send(ws, { type: 'rejected', payload: { reason: 'backpressure' } });
    return;
  }
  const seq = seqCounter.next();
  const line = `${seq} ${payload.cmd} ${serializeParams(payload.params)}`;
  inflight.push({ seq, line });
  send(ws, { type: 'accepted', payload: { seq, cmd: payload.cmd } });
  for (const other of uiClients) {
    if (other !== ws) send(other, { type: 'accepted', payload: { seq, cmd: payload.cmd } });
  }
  if (algodooClient && algodooClient.readyState === WebSocket.OPEN) {
    send(algodooClient, { type: 'enqueue', payload: { seq, line } });
  }
}

function handleDrain(ws: WebSocket, payload: { lastAck: number }) {
  if (algodooClient !== ws) {
    algodooClient = ws;
  }
  const { lastAck: ack } = payload;
  if (ack > lastAck) {
    for (const item of [...inflight]) {
      if (item.seq <= ack) {
        inflight.shift();
        broadcast({ type: 'acked', payload: { seq: item.seq } });
      } else break;
    }
    lastAck = ack;
  }
}
