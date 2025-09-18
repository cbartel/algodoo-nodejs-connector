import type { PluginContext } from 'algodoo-server';

type SubmitEvalFn = (thyme: string) => { ok: boolean };

let boundSubmit: SubmitEvalFn | null = null;
let boundSubmitAsync: ((thyme: string, opts?: { timeoutMs?: number }) => Promise<{ seq: number }>) | null = null;

export function wireTransport(ctx: PluginContext): void {
  // Bind to the server instance that created this plugin
  boundSubmit = (thyme: string) => ctx.submitEval(thyme);
  boundSubmitAsync = (thyme: string, opts?: { timeoutMs?: number }) => ctx.submitEvalAsync(thyme, opts);
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
