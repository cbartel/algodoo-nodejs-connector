import { useMemo } from 'react';

import { rgbToHex } from '../utils/color';

export interface StandingRow {
  id: string;
  name: string;
  total: number;
  best: number;
  earliest: number;
  perStage: number[];
  colorHex: string;
}

export function useStandings(state: any, ver: number) {
  return useMemo(() => {
    if (!state) return [] as StandingRow[];
    const playersArr: any[] = [];
    const players = state.players;
    if (players && typeof players.forEach === 'function') {
      players.forEach((v: any) => { if (v) playersArr.push(v); });
    } else {
      playersArr.push(...Object.values(players ?? {}));
    }
    const safeName = (n: any) => (typeof n === 'string' ? n : '');
    const stageCount = Number(state?.stages?.length || 0);
    return playersArr
      .map((p) => {
        const perStage: number[] = [];
        for (let i = 0; i < stageCount; i++) {
          const r = p?.results?.[i];
          perStage.push(Number(r?.points ?? 0));
        }
        const colorHex = rgbToHex(p?.config?.color || { r: 255, g: 255, b: 255 }, '#fff');
        return {
          id: p?.id,
          name: p?.name,
          total: Number(p?.totalPoints ?? 0),
          best: p?.bestPlacement || 9999,
          earliest: (p?.earliestBestStageIndex ?? -1) >= 0 ? p.earliestBestStageIndex : 9999,
          perStage,
          colorHex,
        } as StandingRow;
      })
      .sort((a: any, b: any) => (b.total - a.total) || (a.best - b.best) || (a.earliest - b.earliest) || safeName(a.name).localeCompare(safeName(b.name)));
  }, [state, ver]);
}
