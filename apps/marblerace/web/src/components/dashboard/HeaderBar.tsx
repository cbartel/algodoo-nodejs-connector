import React from 'react';

export default function HeaderBar({ title, stageName }: { title: string; stageName: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{
        fontWeight: 1000,
        fontSize: 20,
        background: 'linear-gradient(90deg,#9cf,#fff,#9cf)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        textShadow: '0 0 10px #069',
        backgroundSize: '200% auto',
        animation: 'neonShift 6s linear infinite, neonGlow 2.4s ease-in-out infinite alternate',
        letterSpacing: 1.2,
      }}>{title}</span>
      <span style={{ color: '#555' }}>—</span>
      <span style={{ border: '3px solid #fc6', padding: '2px 8px', color: '#fc6', fontWeight: 900, background: 'rgba(40,30,0,0.35)', boxShadow: '0 0 12px #630' }}>{stageName}</span>
    </div>
  );
}

