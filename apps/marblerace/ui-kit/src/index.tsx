import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export function PixelProvider({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: `'Lucida Console', Monaco, monospace`, color: '#fff' }}>
      <style>{globalCss}</style>
      {children}
    </div>
  );
}

const globalCss = `
  html, body, #root { height: 100%; background: #1b1b1b; }
  * { image-rendering: pixelated; }
  a { color: #9df; }
`;

export function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '4px solid #6cf', padding: 12, background: '#0f1115', boxShadow: '0 0 0 2px #036 inset' }}>
      {title && <div style={{ fontSize: 12, marginBottom: 8, color: '#6cf' }}>{title}</div>}
      {children}
    </div>
  );
}

export function Button({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#333' : '#222',
        color: '#fff',
        border: '4px solid #fc6',
        padding: '8px 12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: '0 0 0 2px #b70 inset',
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'success' | 'warn' | 'danger' }) {
  const colors: Record<string, string> = { info: '#6cf', success: '#6f6', warn: '#fc6', danger: '#f66' };
  return (
    <span style={{ border: `3px solid ${colors[tone]}`, padding: '2px 6px', marginRight: 6 }}>{children}</span>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ border: '3px solid #6cf', padding: 6, textAlign: 'left', color: '#6cf' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{ border: '3px solid #333', padding: 6 }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Countdown({ msRemaining }: { msRemaining: number | undefined }) {
  if (msRemaining == null) return null;
  const s = Math.ceil(msRemaining / 1000);
  return <div style={{ fontSize: 24, color: '#fc6' }}>⏱ {s}</div>;
}

export function QR({ url, size = 128 }: { url: string; size?: number }) {
  return (
    <div style={{ background: '#fff', display: 'inline-block', padding: 8 }}>
      <QRCodeCanvas value={url} size={size} includeMargin={false} />
    </div>
  );
}

