import React from 'react';

import { formatPoints } from '../../utils/points';

export interface RowHighlight { id: number; left: number; top: number; width: number; height: number; color: string }
export interface ClaimBurst { id: number; pts: number; name: string; color: string; left: number; top: number }

export default function ClaimBurstsOverlay({ bursts, highlights }:{ bursts: ClaimBurst[]; highlights: RowHighlight[] }) {
  if (!bursts.length && !highlights.length) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: 'none' }}>
      {highlights.map((h) => (
        <div key={`hl-${h.id}`} style={{
          position: 'fixed',
          left: h.left,
          top: h.top,
          width: h.width,
          height: h.height,
          background: `${h.color}22`,
          boxShadow: `inset 0 0 0 2px ${h.color}55, 0 0 14px ${h.color}33` ,
          borderRadius: 6,
          animation: 'rowPulse 1s ease-in-out 1'
        }} />
      ))}
      {bursts.map((b) => (
        <div key={b.id} style={{ position: 'fixed', left: b.left, top: b.top, transform: 'translate(-50%,-50%)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#0e131a', border: `4px solid ${b.color}`,
            boxShadow: `0 0 0 2px #000 inset, 0 0 20px ${b.color}55`,
            padding: '6px 10px', borderRadius: 6,
            animation: 'burstPop 260ms cubic-bezier(.2,1.4,.3,1) both, burstFloat 1.3s ease-out 260ms both'
          }}>
            <span style={{ width: 10, height: 10, background: b.color, borderRadius: '50%', boxShadow: `0 0 8px ${b.color}aa` }} />
            <span style={{ color: '#cde', fontSize: 13, fontWeight: 700, textShadow: '0 1px 0 #000' }}>{b.name}</span>
            <span style={{ color: b.color, fontWeight: 1000, fontSize: 18, textShadow: '0 1px 0 #000' }}>+{formatPoints(b.pts)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
