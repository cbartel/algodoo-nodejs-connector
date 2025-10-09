import React from 'react';

export const badgeColorForTier = (tier: number) => {
  if (tier === 0) return '#ffd700';
  if (tier === 1) return '#c0c0c0';
  if (tier === 2) return '#cd7f32';
  return '#6cf';
};

export const renderRewardBadge = (pts: number, tier: number, key?: React.Key, compact = false) => {
  const color = badgeColorForTier(tier);
  const glow = color === '#ffd700' ? '#ffdf70' : color === '#c0c0c0' ? '#e0e0e0' : color === '#cd7f32' ? '#f0b07a' : '#8fe3ff';
  const emoji = tier === 0 ? '🏆' : tier === 1 ? '🥈' : tier === 2 ? '🥉' : '🎖️';
  const baseStyle: React.CSSProperties = compact ? {
    border: `3px solid ${color}`,
    background: '#111',
    boxShadow: `0 0 0 2px #222 inset, 0 0 10px ${glow}`,
    padding: '4px 6px',
    display: 'flex', alignItems: 'center', gap: 6,
    minWidth: 64, justifyContent: 'center'
  } : {
    border: `4px solid ${color}`,
    background: '#111',
    boxShadow: `0 0 0 2px #222 inset, 0 0 14px ${glow}`,
    padding: '8px 10px',
    display: 'flex', alignItems: 'center', gap: 8,
    minWidth: 92, justifyContent: 'center'
  };
  return (
    <div key={key} style={baseStyle}>
      <span style={{ filter: 'drop-shadow(0 1px 0 #000)' }}>{emoji}</span>
      <span style={{ fontWeight: 900, color, fontSize: compact ? 12 : 16 }}>{pts}</span>
    </div>
  );
};

