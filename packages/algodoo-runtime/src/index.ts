export type RuntimeCallbacks = {
  onAccepted?: (seq: number) => void;
  onAcked?: (seq: number) => void;
  onError?: (msg: string) => void;
  onStatus?: (info: Record<string, unknown>) => void;
};

type AcceptedMessage = { type: 'accepted'; payload: { seq: number } };
type AckedMessage = { type: 'acked'; payload: { seq: number } };
type ErrorMessage = { type: 'error'; payload: { message: string } };
type StatusMessage = { type: 'status'; payload: Record<string, unknown> };
type ServerMessage = AcceptedMessage | AckedMessage | ErrorMessage | StatusMessage;

export class Runtime {
  private url: string;
  private ws: WebSocket | null = null;
  private backoff = 500;
  private callbacks: RuntimeCallbacks;
  private acceptResolvers: ((seq: number) => void)[] = [];
  private heartbeat?: NodeJS.Timer;

  constructor(url: string, cb: RuntimeCallbacks = {}) {
    this.url = url;
    this.callbacks = cb;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('open', () => {
      this.backoff = 500;
      this.startHeartbeat();
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data.toString()) as ServerMessage;
      if (msg.type === 'accepted') {
        const resolver = this.acceptResolvers.shift();
        if (resolver) resolver(msg.payload.seq);
        this.callbacks.onAccepted?.(msg.payload.seq);
      } else if (msg.type === 'acked') {
        this.callbacks.onAcked?.(msg.payload.seq);
      } else if (msg.type === 'error') {
        this.callbacks.onError?.(msg.payload.message);
      } else if (msg.type === 'status') {
        this.callbacks.onStatus?.(msg.payload);
      }
    });
    this.ws.addEventListener('close', () => {
      this.stopHeartbeat();
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 10000);
    });
    this.ws.addEventListener('error', () => this.ws?.close());
  }

  private startHeartbeat() {
    this.heartbeat = setInterval(() => {
      this.ws?.send(JSON.stringify({ type: 'status' }));
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  submitEval(thyme: string): Promise<{ seq: number }> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      this.acceptResolvers.push((seq) => resolve({ seq }));
      this.ws.send(
        JSON.stringify({ type: 'submit', payload: { cmd: 'EVAL', params: thyme } })
      );
    });
  }
}

export function connect(url = 'ws://localhost:8080', cb: RuntimeCallbacks = {}) {
  return new Runtime(url, cb);
}
