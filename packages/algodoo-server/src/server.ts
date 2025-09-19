import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

export interface ClientMessage<T = unknown> {
  type: string;
  payload?: T;
}

export interface PluginContext {
  server: http.Server;
  wss: WebSocketServer;
  clients: Set<WebSocket>;
  broadcast(message: unknown): void;
  send(ws: WebSocket, message: unknown): void;
  /**
   * Submit a Thyme script to the connected algodoo-client.
   * Returns an object indicating acceptance and sequence id.
   */
  submitEval(thyme: string): { ok: boolean; seq?: number; reason?: string };
  /** Submit a Thyme script and resolve when acknowledged. */
  submitEvalAsync(thyme: string, opts?: { timeoutMs?: number }): Promise<{ seq: number }>;
  /** Submit a raw command line (e.g., PING) */
  submitRaw(cmd: string): { ok: boolean; seq?: number; reason?: string };
  /** Submit a raw command and resolve when acknowledged. */
  submitRawAsync(cmd: string, opts?: { timeoutMs?: number }): Promise<{ seq: number }>;
  /** Transport status for health checks. */
  getStatus(): { hasClient: boolean; inflight: number; lastAck: number; nextSeq: number; clientCount: number };
}

export interface ServerPlugin {
  name: string;
  /**
   * Single URL prefix this plugin handles, e.g. "cmd" -> "/cmd".
   *
   * For multiple prefixes, use `paths`.
   */
  path?: string;
  /**
   * Multiple URL prefixes this plugin handles, e.g. ["admin","game"].
   * Backwards-compatible with `path`.
   */
  paths?: string[];
  handleHttp?(req: http.IncomingMessage, res: http.ServerResponse, ctx: PluginContext): void;
  init?(ctx: PluginContext): void;
  onConnection?(ws: WebSocket, ctx: PluginContext): void;
  onMessage?(ws: WebSocket, msg: ClientMessage, ctx: PluginContext): void;
  onClose?(ws: WebSocket, ctx: PluginContext): void;
}

export interface StartServerOptions {
  port?: number;
  plugins?: ServerPlugin[];
}

const DEFAULT_PORT = Number(process.env.PORT || 8080);

const SRV_LOG = process.env.ALGODOO_SERVER_LOG || 'info';
const srvDebug = (...args: unknown[]) => { if (SRV_LOG === 'debug') console.log('[algodoo-server]', ...args); };

// Minimal queue for submitting EVAL to a single algodoo-client connection
type EnqueueItem = { seq: number; line: string };
let algodooClient: WebSocket | null = null;
let inflight: EnqueueItem[] = [];
let lastAck = -1;
let seqCounter = 0;
function nextSeq() { return seqCounter++; }
function serializeParams(p: string): string { return p.replace(/\n/g, '\\n').replace(/\r/g, '\\r'); }
const pendingAcks = new Map<number, { resolve: (v: { seq: number }) => void; reject: (err: Error) => void; timer?: NodeJS.Timeout }>();

export function submitEval(thyme: string): { ok: boolean; seq?: number; reason?: string } {
  if (!algodooClient || algodooClient.readyState !== WebSocket.OPEN) {
    srvDebug('submitEval rejected: no algodoo-client');
    return { ok: false, reason: 'no-client' };
  }
  if (inflight.length >= 50) {
    srvDebug('submitEval rejected: backpressure');
    return { ok: false, reason: 'backpressure' };
  }
  const seq = nextSeq();
  const line = `${seq} EVAL ${serializeParams(thyme)}`;
  inflight.push({ seq, line });
  algodooClient.send(JSON.stringify({ type: 'enqueue', payload: { seq, line } }));
  srvDebug('submitEval enqueued', { seq });
  return { ok: true, seq };
}

export function submitEvalAsync(thyme: string, opts: { timeoutMs?: number } = {}): Promise<{ seq: number }> {
  const res = submitEval(thyme);
  if (!res.ok || !Number.isFinite(res.seq)) {
    const reason = res.reason || 'unknown';
    return Promise.reject(new Error(`submitEval failed: ${reason}`));
  }
  const seq = res.seq as number;
  if (lastAck >= seq) return Promise.resolve({ seq });
  const timeoutMs = Math.max(1, Number(opts.timeoutMs ?? 10000));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(seq);
      reject(new Error(`submitEval timeout: seq=${seq}`));
    }, timeoutMs);
    pendingAcks.set(seq, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (err) => { clearTimeout(timer); reject(err); },
      timer,
    });
  });
}

export function submitRaw(cmd: string): { ok: boolean; seq?: number; reason?: string } {
  if (!algodooClient || algodooClient.readyState !== WebSocket.OPEN) {
    srvDebug('submitRaw rejected: no algodoo-client');
    return { ok: false, reason: 'no-client' };
    }
  if (inflight.length >= 50) {
    srvDebug('submitRaw rejected: backpressure');
    return { ok: false, reason: 'backpressure' };
  }
  const seq = nextSeq();
  const line = `${seq} ${cmd}`;
  inflight.push({ seq, line });
  algodooClient.send(JSON.stringify({ type: 'enqueue', payload: { seq, line } }));
  srvDebug('submitRaw enqueued', { seq, cmd });
  return { ok: true, seq };
}

export function submitRawAsync(cmd: string, opts: { timeoutMs?: number } = {}): Promise<{ seq: number }> {
  const res = submitRaw(cmd);
  if (!res.ok || !Number.isFinite(res.seq)) {
    const reason = res.reason || 'unknown';
    return Promise.reject(new Error(`submitRaw failed: ${reason}`));
  }
  const seq = res.seq as number;
  if (lastAck >= seq) return Promise.resolve({ seq });
  const timeoutMs = Math.max(1, Number(opts.timeoutMs ?? 5000));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(seq);
      reject(new Error(`submitRaw timeout: seq=${seq}`));
    }, timeoutMs);
    pendingAcks.set(seq, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (err) => { clearTimeout(timer); reject(err); },
      timer,
    });
  });
}

export function startServer({ port = DEFAULT_PORT, plugins = [] }: StartServerOptions = {}) {
  // Normalize plugins in case caller passed an ESM module instead of the plugin object
  const normPlugins: ServerPlugin[] = plugins.map((p: any) => {
    if (!p) return p;
    if (p.name || p.handleHttp || p.paths || p.path) return p as ServerPlugin;
    return (p.default ?? p) as ServerPlugin;
  });

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    srvDebug('http', req.method, url);
    // Core server stays transport-agnostic; no framework-specific routes here.
    if (url === '/favicon.ico') {
      res.statusCode = 204;
      return res.end();
    }
    for (const plugin of normPlugins) {
      const prefixes = plugin.paths && plugin.paths.length > 0
        ? plugin.paths
        : (plugin.path ? [plugin.path] : []);
      srvDebug('check plugin', plugin.name, 'prefixes', prefixes);
      for (const p of prefixes) {
        if (url.startsWith(`/${p}`)) {
          // quiet: route is handled by plugin
          srvDebug('route -> plugin', plugin.name, 'via', p || '(root)');
          plugin.handleHttp?.(req, res, ctx);
          return;
        }
      }
    }
    // Friendly fallback: if only one plugin is registered, delegate to it
    // so it can decide how to respond (useful for SPAs with multiple routes).
    if (normPlugins.length === 1) {
      srvDebug('fallback -> only plugin', normPlugins[0].name);
      normPlugins[0].handleHttp?.(req, res, ctx);
      return;
    }
    res.statusCode = 404;
    srvDebug('404 not found', url);
    res.end('not found');
  });
  // Log all upgrade paths for debugging (does not intercept)
  server.on('upgrade', (req) => {
    srvDebug('upgrade', req.url);
  });
  const WS_PATH = process.env.ALGODOO_WS_PATH || '/_ws';
  const wss =  new WebSocketServer({ server, path: WS_PATH });
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => console.log(`[server] listening on ${host}:${port}`));
  const clients = new Set<WebSocket>();

  const ctx: PluginContext = {
    server,
    wss,
    clients,
    broadcast,
    send,
    submitEval,
    submitEvalAsync,
    submitRaw,
    submitRawAsync,
    getStatus: () => ({
      hasClient: !!algodooClient && algodooClient.readyState === WebSocket.OPEN,
      inflight: inflight.length,
      lastAck,
      nextSeq: seqCounter,
      clientCount: clients.size,
    }),
  };

  for (const plugin of plugins) {
    plugin.init?.(ctx);
  }


    wss.on('connection', (ws) => {
      srvDebug('ws:connection', { path: WS_PATH });
      clients.add(ws);
      for (const plugin of plugins) plugin.onConnection?.(ws, ctx);
      ws.on('message', (data) => {
        srvDebug('ws:message', { bytes: (data as Buffer).length });
        let msg: ClientMessage;
        try {
          msg = JSON.parse(data.toString()) as ClientMessage;
        } catch (err) {
          send(ws, { type: 'error', payload: { message: String(err) } });
          return;
        }
        // Internal: track algodoo-client and process drain acks
        if ((msg as any)?.type === 'client.hello') {
          if (algodooClient !== ws) algodooClient = ws;
        } else if ((msg as any)?.type === 'drain') {
          const ack = Number((msg as any)?.payload?.lastAck ?? -1);
          if (algodooClient !== ws) algodooClient = ws;
          if (Number.isFinite(ack) && ack > lastAck) {
            const before = inflight.length;
            inflight = inflight.filter((it) => it.seq > ack);
            lastAck = ack;
            srvDebug('ack received', { ack, removed: before - inflight.length, remaining: inflight.length });
            // Resolve any pending promises up to ack
            for (const [seq, waiter] of [...pendingAcks.entries()]) {
              if (seq <= ack) {
                pendingAcks.delete(seq);
                try { waiter.resolve({ seq }); } catch {}
              }
            }
          }
        } else if ((msg as any)?.type === 'output') {
          if (algodooClient !== ws) algodooClient = ws;
          try { srvDebug('ws:output', { seq: (msg as any)?.payload?.seq, cmd: (msg as any)?.payload?.cmd }); } catch {}
        }
        for (const plugin of plugins) plugin.onMessage?.(ws, msg, ctx);
      });
      ws.on('close', () => {
        srvDebug('ws:close');
        clients.delete(ws);
        if (ws === algodooClient) {
          algodooClient = null;
          // Reject all pending waiters since the client is gone
          for (const [, waiter] of pendingAcks) {
            try { waiter.reject(new Error('algodoo-client disconnected')); } catch {}
          }
          pendingAcks.clear();
        }
        for (const plugin of plugins) plugin.onClose?.(ws, ctx);
      });
    });

  return wss;

  function broadcast(message: unknown): void {
    const data = JSON.stringify(message);
    for (const ws of clients) {
       if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  function send(target: WebSocket, message: unknown): void {
    target.send(JSON.stringify(message));
  }
}
