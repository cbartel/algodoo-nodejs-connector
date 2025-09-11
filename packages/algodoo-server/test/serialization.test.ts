import { describe, it, expect } from 'vitest';
import { serializeParams, SeqCounter } from '../src/server';

describe('serializeParams', () => {
  it('replaces newlines and carriage returns', () => {
    expect(serializeParams('a\nb\rc')).toBe('a\\nb\\rc');
  });
});

describe('SeqCounter', () => {
  it('increments sequentially', () => {
    const seq = new SeqCounter();
    expect(seq.next()).toBe(0);
    expect(seq.next()).toBe(1);
  });
});
