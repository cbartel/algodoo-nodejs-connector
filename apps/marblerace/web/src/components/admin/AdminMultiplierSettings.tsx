import { Badge } from 'marblerace-ui-kit';
import React from 'react';

export default function AdminMultiplierSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  const [val, setVal] = React.useState<number>(() => {
    const v = Number(state?.marbleMultiplier ?? 1);
    return Number.isFinite(v) ? v : 1;
  });
  React.useEffect(() => {
    const v = Number(state?.marbleMultiplier ?? 1);
    setVal(Number.isFinite(v) ? v : 1);
  }, [state?.marbleMultiplier]);
  const options = Array.from({ length: 8 }, (_, i) => 0.5 + i * 0.5); // 0.5..4.0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Badge>Marble Multiplier</Badge>
      <select
        value={val}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVal(v);
          sendAdmin('setMarbleMultiplier', { value: v });
        }}
        style={{ padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{`x${o.toFixed(1)}`}</option>
        ))}
      </select>
      <span style={{ color: '#9df', fontSize: 12 }}>(Auto-applies)</span>
    </div>
  );
}
