import path from 'path';
import fs from 'fs';
import os from 'os';
import type { IncomingMessage, ServerResponse } from 'http';
import http from 'http';
import type { ServerPlugin, PluginContext, ClientMessage } from 'algodoo-server';
import { Server as ColyseusServer } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { RaceRoom, updateClientAlive, updateScenes, dispatchAlgodooEvent } from './room.js';
import { wireTransport, submitPingAsync, requestClientScanScenes } from './transport.js';
import { setLastScenes } from './scenesCache.js';

const LOG_LEVEL = process.env.MARBLERACE_LOG || 'info';
const log = (...args: unknown[]) => console.log('[mr:plugin]', ...args);
const debug = (...args: unknown[]) => { if (LOG_LEVEL === 'debug') console.log('[mr:plugin]', ...args); };
const pluginHealth: { get?: () => { lastPingAt: number; lastPingRtt: number; pingOk: boolean } } = {};
// Cache resolved web dir to avoid repeated filesystem checks and logs
let cachedWebDir: string | null = null;
let loggedWebDirOnce = false;

// Track output sequence stats from algodoo-client
let lastOutputSeqReceived = -1;
let outputSeqGaps = 0;

function resolveWebDir(): string {
  if (cachedWebDir) return cachedWebDir;
  const candidates: string[] = [];
  try {
    // @ts-ignore import.meta in ESM build
    const here = path.dirname(new URL(import.meta.url).pathname);
    candidates.push(path.resolve(here, '../../web/dist'));
  } catch {
    // ignore
  }
  // Try common cwd-relative locations depending on where the process started
  candidates.push(
    path.resolve(process.cwd(), 'apps/marblerace/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), '../../web/dist'),
    path.resolve(process.cwd(), '../../../apps/marblerace/web/dist')
  );
  debug('resolveWebDir candidates:', candidates);
  for (const c of candidates) {
    const idx = path.join(c, 'index.html');
    if (fs.existsSync(idx)) {
      cachedWebDir = c;
      if (!loggedWebDirOnce) { log('resolveWebDir chose:', c); loggedWebDirOnce = true; }
      return cachedWebDir;
    }
  }
  // fall back to the first candidate if none exist (handler will 500)
  const fallback = candidates[0] ?? path.resolve(process.cwd(), 'apps/marblerace/web/dist');
  cachedWebDir = fallback;
  if (!loggedWebDirOnce) { log('resolveWebDir fallback:', fallback); loggedWebDirOnce = true; }
  return cachedWebDir;
}

function sendFile(res: ServerResponse, file: string, ctype?: string, cacheSeconds?: number) {
  res.statusCode = 200;
  if (ctype) res.setHeader('content-type', ctype);
  if (typeof cacheSeconds === 'number' && cacheSeconds > 0) {
    res.setHeader('cache-control', `public, max-age=${cacheSeconds}`);
  }
  fs.createReadStream(file).pipe(res);
}

function contentTypeFor(file: string): string | undefined {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return undefined;
}

// Resolve a URL path under a base directory, preventing path traversal.
function safeJoin(baseDir: string, urlPath: string): string | null {
  const cleaned = urlPath.replace(/^\/+/, '');
  const resolved = path.resolve(baseDir, cleaned);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null;
  }
  return resolved;
}

// Map raw algodoo-client output (cmd, params[]) to a canonical AlgodooEvent
function mapOutputToEvent(cmd: string, params: any): import('marblerace-protocol').AlgodooEvent | null {
  const lower = cmd.toLowerCase();
  const arr = Array.isArray(params) ? params : [];
  // Generic aliases
  if (lower === 'ready') return { type: 'stage.ready', payload: { stageId: String(arr[0] ?? '') } };
  if (lower === 'finish') return { type: 'marble.finish', payload: { playerId: String(arr[0] ?? ''), order: Number(arr[1] ?? 0) || 0, ts: Number(arr[2] ?? Date.now()) } };
  if (lower === 'timeout') return { type: 'stage.timeout', payload: { stageId: String(arr[0] ?? ''), ts: Number(arr[1] ?? Date.now()) } };
  if (lower === 'reset') return { type: 'stage.reset', payload: { stageId: String(arr[0] ?? '') } };
  if (lower === 'stage.ready' || lower === 'stage_ready' || lower === 'ev_stage_ready') {
    const stageId = String(arr[0] ?? '');
    return { type: 'stage.ready', payload: { stageId } };
  }
  if (lower === 'marble.finish' || lower === 'marble_finish' || lower === 'ev_marble_finish') {
    const playerId = String(arr[0] ?? '');
    const order = Number(arr[1] ?? 0) || 0;
    const ts = Number(arr[2] ?? Date.now());
    return { type: 'marble.finish', payload: { playerId, order, ts } };
  }
  if (lower === 'stage.timeout' || lower === 'stage_timeout' || lower === 'ev_stage_timeout') {
    const stageId = String(arr[0] ?? '');
    const ts = Number(arr[1] ?? Date.now());
    return { type: 'stage.timeout', payload: { stageId, ts } };
  }
  if (lower === 'stage.reset' || lower === 'stage_reset' || lower === 'ev_stage_reset') {
    const stageId = String(arr[0] ?? '');
    return { type: 'stage.reset', payload: { stageId } };
  }
  return null;
}

export const marbleRacePlugin: ServerPlugin = {
  name: 'marblerace',
  // Handle all three UI paths directly
  path: 'admin',
  // Explicit prefixes we handle. Core router delegates '/' to us when we are the only plugin.
  paths: ['admin', 'game', 'dashboard', 'mr', 'assets'],
  init(ctx: PluginContext) {
    // Wire transport to use algodoo-server's context-bound submitEval
    wireTransport(ctx);
    // Start dedicated Colyseus server on separate port to avoid WS conflicts
    const colyPort = Number(process.env.MARBLERACE_COLYSEUS_PORT || 2567);
    const colyHttp = http.createServer((req, res) => {
      const origin = (req.headers.origin as string) || '*';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if ((req.method || 'GET').toUpperCase() === 'OPTIONS') { res.statusCode = 204; res.end(); }
      // Do not end; Colyseus will handle /matchmake and WS upgrade
    });
    const gameServer = new ColyseusServer({ transport: new WebSocketTransport({ server: colyHttp }) });
    gameServer.define('marblerace', RaceRoom);
    const colyHost = process.env.MARBLERACE_COLYSEUS_HOST || '0.0.0.0';
    colyHttp.listen(colyPort, colyHost, () => log('colyseus listening', { host: colyHost, port: colyPort }));
    log('initialized. colyseus separate-port', colyPort);

    // Health: periodic PING roundtrip
    let lastPingAt = 0;
    let lastPingRtt = -1;
    let pingOk = false;
    setInterval(async () => {
      const start = Date.now();
      const ok = await submitPingAsync(1500);
      lastPingAt = Date.now();
      pingOk = ok;
      lastPingRtt = ok ? (lastPingAt - start) : -1;
    }, 3000);

    // expose in module closure for /mr/health
    (pluginHealth as any).get = () => ({ lastPingAt, lastPingRtt, pingOk });
  },
  onMessage(_ws, msg: ClientMessage, _ctx) {
    const t = msg?.type || '';
    if (t === 'client.hello') {
      log('algodoo-client hello');
      // Reset output sequence tracking on new client session
      lastOutputSeqReceived = -1;
      outputSeqGaps = 0;
      debug('output seq tracking reset on hello');
      updateClientAlive(Date.now());
      // Request an immediate scene scan on new client session
      try { requestClientScanScenes(); } catch {}
    } else if (t === 'client.alive') {
      const ts = Number((msg as any)?.payload?.ts ?? Date.now());
      updateClientAlive(ts);
    } else if (t === 'client.scenes') {
      const files = Array.isArray((msg as any)?.payload?.files) ? (msg as any).payload.files as string[] : [];
      setLastScenes(files);
      updateScenes(files);
    } else if (t === 'output') {
      try {
        const payload: any = (msg as any)?.payload || {};
        const seq: number = Number(payload.seq ?? -1);
        const cmd: string = String(payload.cmd || '').toLowerCase();
        const p: any[] = Array.isArray(payload.params) ? payload.params : [];
        debug('output raw', { seq, cmd, params: p });
        // Log and track sequence continuity; reset if seq appears to restart
        if (Number.isFinite(seq)) {
          if (seq === 0 && lastOutputSeqReceived !== -1) {
            debug('output seq restart detected; resetting counters');
            lastOutputSeqReceived = -1;
            outputSeqGaps = 0;
          }
          if (lastOutputSeqReceived >= 0 && seq > lastOutputSeqReceived + 1) {
            const missedFrom = lastOutputSeqReceived + 1;
            const missedTo = seq - 1;
            outputSeqGaps += (missedTo - missedFrom + 1);
            log('output gap detected', { last: lastOutputSeqReceived, received: seq, missedFrom, missedTo, totalGaps: outputSeqGaps });
          } else if (lastOutputSeqReceived >= 0 && seq <= lastOutputSeqReceived) {
            log('output out-of-order/duplicate', { last: lastOutputSeqReceived, received: seq });
          }
          lastOutputSeqReceived = Math.max(lastOutputSeqReceived, seq);
        }
        const ev = mapOutputToEvent(cmd, p);
        debug('output mapped', ev);
        if (ev) dispatchAlgodooEvent(ev);
      } catch (e) {
        debug('output parse error', String(e));
      }
    }
  },
  handleHttp(req: IncomingMessage, res: ServerResponse, ctx: PluginContext) {
    const url = req.url || '/';
    debug('http', req.method, url);
    const webDir = resolveWebDir();
    // GET-only HTTP handling
    if ((req.method || 'GET').toUpperCase() === 'GET') {
      // static assets
      if (url.startsWith('/assets/')) {
        const filePath = safeJoin(webDir, url);
        if (!filePath) { res.statusCode = 400; res.end('bad path'); return; }
        debug('asset request ->', filePath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          debug('asset 200', path.basename(filePath));
          const ctype = contentTypeFor(filePath);
          // Cache fingerprinted assets aggressively (vite outputs hashed filenames under /assets)
          const cache = /\/assets\//.test(url) ? 60 * 60 * 24 * 30 : 0;
          return sendFile(res, filePath, ctype, cache);
        }
        debug('asset 404', filePath);
        res.statusCode = 404; res.end('asset not found'); return;
      }
      // health endpoint
      if (url.startsWith('/mr/health') || url === '/mr/health') {
        debug('health 200');
        const s = ctx.getStatus ? ctx.getStatus() : { hasClient: false, inflight: 0, lastAck: -1, nextSeq: 0, clientCount: 0 };
        const p = (pluginHealth as any).get?.() || { lastPingAt: 0, lastPingRtt: -1, pingOk: false };
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, name: 'marblerace', algodoo: s, output: { lastSeq: lastOutputSeqReceived, gaps: outputSeqGaps }, ping: p }));
        return;
      }
      // config endpoint: expose Colyseus URL for the web client
      if (url.startsWith('/mr/config') || url === '/mr/config') {
        const xfProto = ((req.headers['x-forwarded-proto'] as string) || '').toLowerCase();
        const scheme = xfProto.includes('https') ? 'https' : 'http';
        const headerHost = (req.headers.host as string) || 'localhost:8080';
        const requestedHost = headerHost.split(',')[0].trim();
        const envPublicHost = process.env.MARBLERACE_PUBLIC_HOST;
        const ipHost = pickLocalIPv4();
        const baseHost = envPublicHost || (isLocalhost(requestedHost) ? (ipHost || requestedHost) : requestedHost);
        const hostOnly = extractHostname(baseHost);
        const httpPort = Number(process.env.PORT || 8080);
        const httpUrl = `${scheme}://${hostOnly}:${httpPort}`;
        const colyPort = Number(process.env.MARBLERACE_COLYSEUS_PORT || 2567);
        const colyseusUrl = `${scheme}://${hostOnly}:${colyPort}`;
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ colyseusUrl, publicHttpUrl: httpUrl }));
        return;
      }
      // fallback: serve SPA index for any other route
      const indexPath = safeJoin(webDir, '/index.html');
      if (!indexPath) { res.statusCode = 400; res.end('bad path'); return; }
      if (fs.existsSync(indexPath)) {
        debug('serve index.html');
        return sendFile(res, indexPath, 'text/html; charset=utf-8');
}

function isLocalhost(host: string): boolean {
  const h = host.split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function pickLocalIPv4(): string | null {
  try {
    const ifaces = os.networkInterfaces();
    const all: string[] = [];
    for (const name of Object.keys(ifaces)) {
      for (const i of ifaces[name] || []) {
        if (i.family === 'IPv4' && !i.internal) all.push(i.address);
      }
    }
    // Prefer RFC1918 private ranges
    const prefer = all.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2\d|3[0-1])\./));
    return prefer || all[0] || null;
  } catch {
    return null;
  }
}

function extractHostname(hostHeaderOrHost: string): string {
  const src = hostHeaderOrHost.trim();
  if (!src) return 'localhost';
  if (src.startsWith('[')) {
    // [IPv6]:port or [IPv6]
    const end = src.indexOf(']');
    if (end > 0) return src.slice(1, end);
    return src.replace(/^\[|\]$/g, '');
  }
  // IPv4-or-hostname[:port]
  const parts = src.split(':');
  return parts[0];
}
      debug('index missing', indexPath);
      res.statusCode = 500; res.end('web app not built'); return;
    }
    res.statusCode = 405; res.end('method not allowed');
  },
};

export default marbleRacePlugin;
