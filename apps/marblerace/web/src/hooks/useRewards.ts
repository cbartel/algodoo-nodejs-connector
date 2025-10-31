import { useMemo } from 'react';

export interface RewardItem { points: number; tier: number }

export function useRewardsPool(state: any, ver: number) {
  return useMemo(() => {
    if (!state) return { pool: [] as RewardItem[], remaining: [] as RewardItem[], claimedCount: 0, multiplier: 1 };
    const pool: RewardItem[] = [];
    const stageIdx = typeof state?.stageIndex === 'number' ? state.stageIndex : -1;
    const stageMultiplierRaw = stageIdx >= 0 ? Number(state?.stages?.[stageIdx]?.multiplier ?? 1) : 1;
    const stageMultiplier = Number.isFinite(stageMultiplierRaw) && stageMultiplierRaw > 0 ? stageMultiplierRaw : 1;
    const adjustPoints = (pts: number) => {
      const value = Number(pts ?? 0) * stageMultiplier;
      if (!Number.isFinite(value)) return 0;
      return Math.round(value * 1000) / 1000;
    };
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
        const count = Math.max(0, Math.floor(Number(t?.count || 0)));
        const pts = Math.max(0, Number(t?.points || 0));
        const adjusted = adjustPoints(pts);
        for (let k = 0; k < count; k++) pool.push({ points: adjusted, tier: i });
      });
    } else {
      const table: any = (state)?.pointsTable;
      if (table && (typeof table.forEach === 'function' || typeof table.length === 'number')) {
        if (typeof table.forEach === 'function') {
          let i = 0; table.forEach((p: any) => { pool.push({ points: adjustPoints(Number(p || 0)), tier: i++ }); });
        } else {
          const n = Math.max(0, Math.floor(Number(table.length || 0))); for (let i = 0; i < n; i++) pool.push({ points: adjustPoints(Number(table[i] || 0)), tier: i });
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
        if (r && typeof r.points === 'number') {
          const value = Number(r.points);
          if (Number.isFinite(value)) awardedSoFar += value;
        }
      }
    } catch { void 0; }
    let claimedCount = 0;
    let acc = 0;
    for (let i = 0; i < pool.length; i++) {
      const step = Number((pool[i]?.points) ?? 0);
      if (!Number.isFinite(step)) continue;
      const next = acc + step;
      if (next <= awardedSoFar + 1e-6) { acc = next; claimedCount = i + 1; } else { break; }
    }
    const remaining = pool.slice(claimedCount);
    return { pool, remaining, claimedCount, multiplier: stageMultiplier };
  }, [state, ver]);
}
