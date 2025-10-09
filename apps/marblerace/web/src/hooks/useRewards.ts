import { useMemo } from 'react';

export interface RewardItem { points: number; tier: number }

export function useRewardsPool(state: any, ver: number) {
  return useMemo(() => {
    if (!state) return { pool: [] as RewardItem[], remaining: [] as RewardItem[], claimedCount: 0 };
    const pool: RewardItem[] = [];
    const ptsTiers: any = (state)?.pointsTiers;
    if (ptsTiers && (typeof ptsTiers.forEach === 'function' || typeof ptsTiers.length === 'number')) {
      const each = (fn: (t: any, i: number) => void) => {
        if (typeof ptsTiers.forEach === 'function') {
          let i = 0; ptsTiers.forEach((t: any) => fn(t, i++));
        } else {
          const n = Number(ptsTiers.length|0); for (let i = 0; i < n; i++) fn(ptsTiers[i], i);
        }
      };
      each((t, i) => {
        const count = Math.max(0, Number(t?.count || 0) | 0);
        const pts = Math.max(0, Number(t?.points || 0) | 0);
        for (let k = 0; k < count; k++) pool.push({ points: pts, tier: i });
      });
    } else {
      const table: any = (state)?.pointsTable;
      if (table && (typeof table.forEach === 'function' || typeof table.length === 'number')) {
        if (typeof table.forEach === 'function') {
          let i = 0; table.forEach((p: any) => { pool.push({ points: Number(p || 0) | 0, tier: i++ }); });
        } else {
          const n = Number(table.length|0); for (let i = 0; i < n; i++) pool.push({ points: Number(table[i] || 0) | 0, tier: i });
        }
      }
    }
    // Determine awarded points so far in current stage
    const idx = typeof state?.stageIndex === 'number' ? state.stageIndex : -1;
    let awardedSoFar = 0;
    try {
      const arr: any[] = [];
      const players = state?.players;
      if (players && typeof players.forEach === 'function') {
        players.forEach((p: any) => { if (p) arr.push(p); });
      } else {
        Object.values(players || {}).forEach((p: any) => arr.push(p));
      }
      for (const p of arr) {
        const r = p?.results?.[idx];
        if (r && typeof r.points === 'number') awardedSoFar += (r.points | 0);
      }
    } catch { void 0; }
    let claimedCount = 0;
    let acc = 0;
    for (let i = 0; i < pool.length; i++) {
      const next = acc + (pool[i].points | 0);
      if (next <= awardedSoFar) { acc = next; claimedCount = i + 1; } else { break; }
    }
    const remaining = pool.slice(claimedCount);
    return { pool, remaining, claimedCount };
  }, [state, ver]);
}
