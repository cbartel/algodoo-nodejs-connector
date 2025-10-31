import React from 'react';

import { useSound } from '../context/SoundProvider';

export default function SoundControls({ compact = false }: { compact?: boolean }) {
  const { volume, muted, setVolume, toggleMute, unlock } = useSound();
  const percent = Math.round(volume * 100);

  const onSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    unlock();
    setVolume(next);
  };

  const buttonLabel = muted || percent === 0 ? 'Unmute' : 'Mute';
  const icon = muted || percent === 0 ? '🔇' : percent > 66 ? '🔊' : percent > 33 ? '🔉' : '🔈';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 10,
        padding: compact ? '4px 6px' : '6px 10px',
        border: '3px solid #333',
        background: '#0b0f15',
        borderRadius: 10,
        boxShadow: '0 0 0 2px #111 inset',
        minWidth: compact ? 0 : 160,
      }}
    >
      <button
        type="button"
        onClick={() => {
          unlock();
          toggleMute();
        }}
        onPointerDown={unlock}
        style={{
          border: '3px solid #6cf',
          background: '#141a24',
          color: '#9df',
          borderRadius: 8,
          padding: compact ? '2px 6px' : '4px 8px',
          cursor: 'pointer',
          fontWeight: 700,
        }}
        aria-label={buttonLabel}
      >
        {icon}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={onSliderChange}
        onPointerDown={unlock}
        onKeyDown={unlock}
        style={{ flex: 1 }}
        aria-label="Sound volume"
      />
    </div>
  );
}
