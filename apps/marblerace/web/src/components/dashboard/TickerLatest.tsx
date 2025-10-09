import React from 'react';

function iconForKind(kind: string): string {
  switch (kind) {
    case 'join': return '👤';
    case 'spawn': return '🎯';
    case 'finish': return '🏁';
    case 'countdown': return '⏱️';
    case 'stage': return '🧭';
    case 'race': return '🏎️';
    case 'lobby': return '🛎️';
    case 'admin': return '🛡️';
    case 'ceremony': return '🎉';
    case 'music': return '🎵';
    case 'colors': return '🎨';
    case 'title': return '📝';
    case 'prep': return '🧰';
    case 'scenes': return '🗂️';
    case 'timeout': return '⌛';
    default: return 'ℹ️';
  }
}

function highlightMessage(msg: string, players: Record<string, string>): React.ReactNode {
  const patterns: RegExp[] = [
    /^(.*?) joined lobby$/,
    /^(.*?) spawned$/,
    /^Removed player: (.*)$/,
    /Leader:\s*(.*)$/,
    /^(.*?) finished\b/,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m && m[1]) {
      const name = m[1].trim();
      const color = players[name];
      if (!color) break;
      const idx = msg.indexOf(name);
      if (idx >= 0) {
        const before = msg.slice(0, idx);
        const after = msg.slice(idx + name.length);
        return (
          <span>
            {before}
            <span style={{ color, fontWeight: 800 }}>{name}</span>
            {after}
          </span>
        );
      }
    }
  }
  return msg;
}

export default function TickerLatest({ line, players, width = 420, height = 152 }: { line: string | null; players: Record<string, string>; width?: number; height?: number }) {
  const boxStyle: React.CSSProperties = {
    border: '3px solid #333', background: '#0b0f15', width, height, padding: 10,
    color: '#cde', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10, overflow: 'hidden'
  } as any;
  if (!line) return <div style={boxStyle} />;
  const m = /^\[(.*?)\]\s*(\w+)(?::\s*(.*))?$/.exec(line);
  const time = m?.[1] || '';
  const kind = (m?.[2] || '').toLowerCase();
  const msg = m?.[3] || '';
  const icon = iconForKind(kind);
  const content = highlightMessage(msg, players);
  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 28, lineHeight: 1 }}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#7b8a9a' }}>{time} • {kind}</div>
        <div style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{content}</div>
      </div>
    </div>
  );
}

