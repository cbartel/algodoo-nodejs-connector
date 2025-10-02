import type { PluginContext } from 'algodoo-server';

type SubmitEvalFn = (thyme: string) => { ok: boolean };

let boundSubmit: SubmitEvalFn | null = null;
let boundSubmitAsync: ((thyme: string, opts?: { timeoutMs?: number }) => Promise<{ seq: number }>) | null = null;
let boundBroadcast: ((message: unknown) => void) | null = null;
let boundRawAsync: ((cmd: string, opts?: { timeoutMs?: number }) => Promise<{ seq: number }>) | null = null;

/**
 * Bind transport helpers to the active algodoo-server plugin context.
 * Must be called once during plugin initialization.
 */
export function wireTransport(ctx: PluginContext): void {
  // Bind to the server instance that created this plugin
  boundSubmit = (thyme: string) => ctx.submitEval(thyme);
  boundSubmitAsync = (thyme: string, opts?: { timeoutMs?: number }) => ctx.submitEvalAsync(thyme, opts);
  boundBroadcast = (message: unknown) => ctx.broadcast(message);
  boundRawAsync = (cmd: string, opts?: { timeoutMs?: number }) => ctx.submitRawAsync(cmd, opts);
}

/** Submit a Thyme script and return whether it was accepted by the queue. */
export function submitEval(thyme: string): boolean {
  if (!boundSubmit) return false;
  const res = boundSubmit(thyme);
  return !!res.ok;
}

/** Submit a Thyme script and resolve once the command is acknowledged. */
export async function submitEvalAsync(thyme: string, opts?: { timeoutMs?: number }): Promise<boolean> {
  if (!boundSubmitAsync) return false;
  try {
    await boundSubmitAsync(thyme, opts);
    return true;
  } catch {
    return false;
  }
}

/** Request the algodoo-client to perform a RESET handshake. */
export function requestClientReset(): void {
  if (!boundBroadcast) return;
  try { boundBroadcast({ type: 'reset' }); } catch {}
}

/** Ask the algodoo-client to rescan scenes directory and publish file list. */
export function requestClientScanScenes(): void {
  if (!boundBroadcast) return;
  try { boundBroadcast({ type: 'scan.scenes' }); } catch {}
}

/** Send a low-level PING and resolve to true on ack; false on timeout. */
export async function submitPingAsync(timeoutMs = 2000): Promise<boolean> {
  if (!boundRawAsync) return false;
  try {
    await boundRawAsync('PING', { timeoutMs });
    return true;
  } catch {
    return false;
  }
}
