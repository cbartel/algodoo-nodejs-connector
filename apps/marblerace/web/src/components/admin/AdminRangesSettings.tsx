import { Badge } from 'marblerace-ui-kit';
import React from 'react';

export default function AdminRangesSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  interface Pair { min: number; max: number }
  const getPair = (p: any, defMin: number, defMax: number): Pair => ({
    min: Number.isFinite(Number(p?.min)) ? Number(p.min) : defMin,
    max: Number.isFinite(Number(p?.max)) ? Number(p.max) : defMax,
  });
  const s = (state) || {};
  const rr = s?.ranges || {};
  const [radius, setRadius] = React.useState<Pair>(getPair(rr?.radius, 0.02, 0.045));
  const [density, setDensity] = React.useState<Pair>(getPair(rr?.density, 0.5, 4.0));
  const [friction, setFriction] = React.useState<Pair>(getPair(rr?.friction, 0.0, 1.0));
  const [restitution, setRestitution] = React.useState<Pair>(getPair(rr?.restitution, 0.0, 1.0));
  const decs = { radius: 3, density: 1, friction: 2, restitution: 2 } as const;
  const round = (v: number, d: number) => { if (!Number.isFinite(v)) return 0; const f = Math.pow(10, d); return Math.round(v * f) / f; };
  const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
  React.useEffect(() => {
    const rr2 = (state)?.ranges || {};
    setRadius(getPair(rr2?.radius, 0.02, 0.045));
    setDensity(getPair(rr2?.density, 0.5, 4.0));
    setFriction(getPair(rr2?.friction, 0.0, 1.0));
    setRestitution(getPair(rr2?.restitution, 0.0, 1.0));
  }, [state?.ranges]);
  const numberInputStyle = { width: 90, padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' } as React.CSSProperties;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Badge>Value Ranges (Auto-applies)</Badge>
      {([
        { key: 'radius', label: 'Diameter (m)', value: radius, set: setRadius, step: 0.001, d: decs.radius },
        { key: 'density', label: 'Density', value: density, set: setDensity, step: 0.1, d: decs.density },
        { key: 'friction', label: 'Friction', value: friction, set: setFriction, step: 0.01, d: decs.friction },
        { key: 'restitution', label: 'Bounciness', value: restitution, set: setRestitution, step: 0.01, d: decs.restitution },
      ] as const).map(({ key, label, value, set, step }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 140, color: '#9df' }}>{label}</div>
          <label style={{ color: '#aaa' }}>Min</label>
          <input
            type="number"
            step={step}
            value={fmt(value.min, (key==='radius'?decs.radius:key==='density'?decs.density:key==='friction'?decs.friction:decs.restitution))}
            onChange={(e) => {
              const next = { min: Number(e.target.value), max: value.max };
              set(next);
              sendAdmin('setClampRanges', { [key]: next });
            }}
            onBlur={(e) => {
              const next = { min: round(Number(e.target.value), (key==='radius'?decs.radius:key==='density'?decs.density:key==='friction'?decs.friction:decs.restitution)), max: value.max };
              set(next);
              sendAdmin('setClampRanges', { [key]: next });
            }}
            style={numberInputStyle}
          />
          <label style={{ color: '#aaa' }}>Max</label>
          <input
            type="number"
            step={step}
            value={fmt(value.max, (key==='radius'?decs.radius:key==='density'?decs.density:key==='friction'?decs.friction:decs.restitution))}
            onChange={(e) => {
              const next = { min: value.min, max: Number(e.target.value) };
              set(next);
              sendAdmin('setClampRanges', { [key]: next });
            }}
            onBlur={(e) => {
              const next = { min: value.min, max: round(Number(e.target.value), (key==='radius'?decs.radius:key==='density'?decs.density:key==='friction'?decs.friction:decs.restitution)) };
              set(next);
              sendAdmin('setClampRanges', { [key]: next });
            }}
            style={numberInputStyle}
          />
        </div>
      ))}
    </div>
  );
}
