import { describe, it, expect } from 'vitest';
import { mapOutputToEvent } from '../src/output-event-mapper';

describe('mapOutputToEvent', () => {
  it('maps ready aliases', () => {
    expect(mapOutputToEvent('ready', ['stage1'])).toEqual({ type: 'stage.ready', payload: { stageId: 'stage1' } });
    expect(mapOutputToEvent('stage.ready', ['s'])).toEqual({ type: 'stage.ready', payload: { stageId: 's' } });
    expect(mapOutputToEvent('stage_ready', ['x'])).toEqual({ type: 'stage.ready', payload: { stageId: 'x' } });
  });

  it('maps finish aliases', () => {
    const ev = mapOutputToEvent('finish', ['p1', 2, 123]);
    expect(ev?.type).toBe('marble.finish');
    expect((ev as any).payload.playerId).toBe('p1');
    expect((ev as any).payload.order).toBe(2);
  });

  it('maps timeout and reset', () => {
    expect(mapOutputToEvent('timeout', ['s1'])?.type).toBe('stage.timeout');
    expect(mapOutputToEvent('reset', ['s1'])).toEqual({ type: 'stage.reset', payload: { stageId: 's1' } });
  });

  it('returns null for unknown', () => {
    expect(mapOutputToEvent('unknown', [])).toBeNull();
  });
});
