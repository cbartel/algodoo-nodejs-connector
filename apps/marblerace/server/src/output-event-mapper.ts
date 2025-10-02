import type { AlgodooEvent } from 'marblerace-protocol';

/**
 * Map a low-level algodoo-client output tuple (cmd, params[]) to a canonical AlgodooEvent.
 * Supports alias forms and minimal validation.
 */
export function mapOutputToEvent(cmd: string, params: unknown): AlgodooEvent | null {
  const lower = String(cmd || '').toLowerCase();
  const arr: unknown[] = Array.isArray(params) ? params : [];
  const str = (v: unknown) => String(v ?? '');
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  if (lower === 'ready' || lower === 'stage.ready' || lower === 'stage_ready' || lower === 'ev_stage_ready') {
    const stageId = str(arr[0]);
    return { type: 'stage.ready', payload: { stageId } };
  }
  if (lower === 'finish' || lower === 'marble.finish' || lower === 'marble_finish' || lower === 'ev_marble_finish') {
    const playerId = str(arr[0]);
    const order = num(arr[1], 0) || 0;
    const ts = num(arr[2], Date.now());
    return { type: 'marble.finish', payload: { playerId, order, ts } };
  }
  if (lower === 'timeout' || lower === 'stage.timeout' || lower === 'stage_timeout' || lower === 'ev_stage_timeout') {
    const stageId = str(arr[0]);
    const ts = num(arr[1], Date.now());
    return { type: 'stage.timeout', payload: { stageId, ts } };
  }
  if (lower === 'reset' || lower === 'stage.reset' || lower === 'stage_reset' || lower === 'ev_stage_reset') {
    const stageId = str(arr[0]);
    return { type: 'stage.reset', payload: { stageId } };
  }
  return null;
}

