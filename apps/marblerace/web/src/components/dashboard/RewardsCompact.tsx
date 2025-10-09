import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { renderRewardBadge } from '../../utils/rewards';

export default function RewardsCompact({ pool, remaining }: { pool: { points: number; tier: number }[]; remaining: { points: number; tier: number }[] }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const badgesRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const totalRemaining = useMemo(() => remaining.reduce((a, b) => a + (b.points | 0), 0), [remaining]);
  const totalPool = useMemo(() => (pool.reduce((a, b) => a + (b.points | 0), 0) || 1), [pool]);
  const pct = Math.max(0, Math.min(100, Math.round(100 - (totalRemaining / totalPool) * 100)));
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = badgesRef.current;
    const header = headerRef.current;
    if (!outer || !inner) return;
    const headerH = header ? header.clientHeight : 18;
    const avail = Math.max(8, outer.clientHeight - headerH - 2);
    const need = inner.scrollHeight;
    const s = Math.max(0.6, Math.min(1, avail / Math.max(1, need)));
    setScale(Number.isFinite(s) ? s : 1);
  }, [remaining?.length, totalRemaining]);
  const scaledWidth = `${(1 / (scale || 1)) * 100}%`;
  return (
    <div ref={outerRef} style={{ minHeight: 0, overflow: 'hidden' }}>
      <div ref={headerRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#9df', fontWeight: 700, fontSize: 12 }}>Stage Rewards</span>
        <span style={{ color: '#9df', fontSize: 12 }}>Remaining: <strong style={{ color: '#6cf' }}>{totalRemaining}</strong></span>
      </div>
      <div ref={badgesRef} style={{ transform: `scale(${scale})`, transformOrigin: 'left top', width: scaledWidth }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
          {remaining.map((r, i) => renderRewardBadge(r.points, r.tier, i, true))}
          {remaining.length === 0 && (
            <div style={{ color: '#6f6', fontWeight: 700, fontSize: 12 }}>All rewards claimed!</div>
          )}
        </div>
      </div>
      <div style={{ border: '3px solid #333', height: 6, background: '#0b0f15', boxShadow: '0 0 0 2px #111 inset', marginTop: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6cf,#9cf)' }} />
      </div>
    </div>
  );
}
