import { useMemo } from 'react';

/** Collect players from MapSchema/array/object into a plain array. */
export function usePlayersArray(state: any) {
  return useMemo(() => {
    const out: any[] = [];
    const p = state?.players;
    if (!p) return out;
    try { if (typeof p.forEach === 'function') { p.forEach((v: any) => v && out.push(v)); return out; } } catch { void 0; }
    try { if (Array.isArray(p)) return p.filter(Boolean); } catch { void 0; }
    try { return Object.values(p).filter(Boolean); } catch { void 0; }
    return out;
  }, [state]);
}
