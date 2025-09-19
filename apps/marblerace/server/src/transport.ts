import type { PluginContext } from 'algodoo-server';

type SubmitEvalFn = (thyme: string) => { ok: boolean };

let boundSubmit: SubmitEvalFn | null = null;
let boundSubmitAsync: ((thyme: string, opts?: { timeoutMs?: number }) => Promise<{ seq: number }>) | null = null;
let boundBroadcast: ((message: unknown) => void) | null = null;
let boundRawAsync: ((cmd: string, opts?: { timeoutMs?: number }) => Promise<{ seq: number }>) | null = null;

export function wireTransport(ctx: PluginContext): void {
  // Bind to the server instance that created this plugin
  boundSubmit = (thyme: string) => ctx.submitEval(thyme);
  boundSubmitAsync = (thyme: string, opts?: { timeoutMs?: number }) => ctx.submitEvalAsync(thyme, opts);
  boundBroadcast = (message: unknown) => ctx.broadcast(message);
  boundRawAsync = (cmd: string, opts?: { timeoutMs?: number }) => ctx.submitRawAsync(cmd, opts);
}

export function submitEval(thyme: string): boolean {
  if (!boundSubmit) return false;
  const res = boundSubmit(thyme);
  return !!res.ok;
}

export async function submitEvalAsync(thyme: string, opts?: { timeoutMs?: number }): Promise<boolean> {
  if (!boundSubmitAsync) return false;
  try {
    await boundSubmitAsync(thyme, opts);
    return true;
  } catch {
    return false;
  }
}

export function requestClientReset(): void {
  if (!boundBroadcast) return;
  try { boundBroadcast({ type: 'reset' }); } catch {}
}

export async function submitPingAsync(timeoutMs = 2000): Promise<boolean> {
  if (!boundRawAsync) return false;
  try {
    await boundRawAsync('PING', { timeoutMs });
    return true;
  } catch {
    return false;
  }
}
