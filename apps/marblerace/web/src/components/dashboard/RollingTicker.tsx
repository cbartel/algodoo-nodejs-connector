import React from 'react';

export default function RollingTicker({ lines, width = 420, height = 152, speedSec }: { lines: string[]; width?: number; height?: number; speedSec?: number }) {
  const items = (lines || []).filter(Boolean);
  const duration = speedSec != null ? Math.max(6, speedSec) : Math.max(12, items.length * 2);
  if (!items.length) {
    return (
      <div style={{
        border: '3px solid #333', background: '#0b0f15', width, height, padding: 6,
        color: '#9aa', fontSize: 12, lineHeight: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>No recent events</div>
      </div>
    );
  }
  const ulStyle: React.CSSProperties = { margin: 0, paddingLeft: 14, listStyle: 'none' } as any;
  const liStyle: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '4px 0' } as any;
  const accent = '#6cf';
  return (
    <div style={{ position: 'relative', width, height, border: '3px solid #333', background: '#0b0f15', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', inset: 0, padding: 6, color: '#cde', fontSize: 12, lineHeight: 1.2,
          display: 'flex', flexDirection: 'column'
        }}
      >
        <div
          key={`track-${items.length}-${items[0]}`}
          style={{
            display: 'inline-block',
            animation: `mrTickerScroll ${duration}s linear infinite`,
          }}
        >
          <ul style={ulStyle}>
            {items.map((line, i) => (
              <li key={`a-${i}`} style={liStyle}>
                <span style={{ color: accent, marginRight: 6 }}>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <ul style={ulStyle}>
            {items.map((line, i) => (
              <li key={`b-${i}`} style={liStyle}>
                <span style={{ color: accent, marginRight: 6 }}>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

