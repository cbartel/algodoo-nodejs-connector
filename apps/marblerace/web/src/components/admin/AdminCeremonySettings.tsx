import { Badge, Button } from 'marblerace-ui-kit';
import React from 'react';

export default function AdminCeremonySettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  const [seconds, setSeconds] = React.useState<number>(() => {
    const ms = Number(state?.ceremonyDwellMs ?? 10000);
    return Math.max(0.3, Math.min(60, Math.round(ms/100)/10));
  });
  React.useEffect(() => {
    const ms = Number(state?.ceremonyDwellMs ?? 10000);
    setSeconds(Math.max(0.3, Math.min(60, Math.round(ms/100)/10)));
  }, [state?.ceremonyDwellMs]);
  const active = !!state?.ceremonyActive;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Badge>Award Ceremony: {active ? 'Running' : 'Idle'}</Badge>
      <label style={{ fontSize: 12, color: '#9df' }}>Per-player dwell (s)</label>
      <input
        type="number"
        min={0.3}
        step={0.1}
        value={seconds}
        onChange={(e) => setSeconds(Math.max(0.3, Math.min(60, Number(e.target.value) || 0.3)))}
        style={{ width: 120, padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
      />
      <Button onClick={() => sendAdmin('startCeremony', { seconds })}>{active ? 'Restart Ceremony' : 'Start Ceremony'}</Button>
      <Button onClick={() => sendAdmin('stopCeremony')} disabled={!active}>Stop</Button>
    </div>
  );
}
