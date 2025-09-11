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
}

export interface ServerPlugin {
  name: string;
  path?: string;
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

export function startServer({ port = DEFAULT_PORT, plugins = [] }: StartServerOptions = {}) {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    for (const plugin of plugins) {
      if (plugin.path && url.startsWith(`/${plugin.path}`)) {
        plugin.handleHttp?.(req, res, ctx);
        return;
      }
    }
    res.statusCode = 404;
    res.end('not found');
  });
  const wss = new WebSocketServer({ server });
  server.listen(port, () => console.log(`algodoo-server listening on ${port}`));
  const clients = new Set<WebSocket>();

  const ctx: PluginContext = {
    server,
    wss,
    clients,
    broadcast,
    send,
  };

  for (const plugin of plugins) {
    plugin.init?.(ctx);
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    for (const plugin of plugins) plugin.onConnection?.(ws, ctx);

    ws.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch (err) {
        send(ws, { type: 'error', payload: { message: String(err) } });
        return;
      }
      for (const plugin of plugins) plugin.onMessage?.(ws, msg, ctx);
    });

    ws.on('close', () => {
      clients.delete(ws);
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
