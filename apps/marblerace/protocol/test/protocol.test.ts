import { describe, it, expect } from 'vitest';
import {
  clamp01,
  clamp,
  isValidRGB,
  clampConfig,
  defaultMarbleConfig,
  formatTicker,
  comparePlayers,
  emptyRaceState,
  stageCount,
  type Player,
} from '../src/index';

describe('protocol utilities', () => {
  it('clamp01 clamps into [0,1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.3)).toBeCloseTo(0.3);
    expect(clamp01(2)).toBe(1);
  });

  it('clamp clamps into [min,max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('isValidRGB validates channel ranges', () => {
    expect(isValidRGB({ r: 0, g: 128, b: 255 })).toBe(true);
    expect(isValidRGB({ r: -1, g: 0, b: 0 })).toBe(false);
    expect(isValidRGB({ r: 0, g: 0, b: 256 })).toBe(false);
  });

  it('clampConfig merges and clamps fields; rejects invalid color', () => {
    const base = defaultMarbleConfig;
    const next = clampConfig({ radius: 999, density: -1, friction: 2, restitution: -2, color: { r: 999, g: -1, b: 5 } }, base);
    expect(next.radius).toBeLessThanOrEqual(base.radius * 2); // within defined range
    expect(next.density).toBeGreaterThan(0);
    expect(next.friction).toBe(1);
    expect(next.restitution).toBe(0);
    // invalid color falls back to base
    expect(next.color).toEqual(base.color);
  });

  it('comparePlayers sorts by points, then best placement, then earliest index, then name', () => {
    const mk = (p: Partial<Player>): Player => ({
      id: p.id || 'id',
      name: p.name || 'Zed',
      config: defaultMarbleConfig,
      totalPoints: p.totalPoints ?? 0,
      bestPlacement: p.bestPlacement ?? null,
      earliestBestStageIndex: p.earliestBestStageIndex ?? null,
      results: [],
    });
    const a = mk({ name: 'Alice', totalPoints: 10, bestPlacement: 2, earliestBestStageIndex: 1 });
    const b = mk({ name: 'Bob', totalPoints: 10, bestPlacement: 1, earliestBestStageIndex: 3 });
    const c = mk({ name: 'Carl', totalPoints: 10, bestPlacement: 1, earliestBestStageIndex: 2 });
    const d = mk({ name: 'Dave', totalPoints: 5 });
    const arr = [a, b, c, d].sort(comparePlayers);
    expect(arr[0].name).toBe('Carl'); // tie on points+best, earlier index wins
    expect(arr[1].name).toBe('Bob');
    expect(arr[2].name).toBe('Alice');
    expect(arr[3].name).toBe('Dave');
  });

  it('emptyRaceState sane defaults', () => {
    const s = emptyRaceState();
    expect(s.globalPhase).toBe('lobby');
    expect(s.stageIndex).toBe(-1);
    expect(stageCount(s)).toBe(0);
  });
});

