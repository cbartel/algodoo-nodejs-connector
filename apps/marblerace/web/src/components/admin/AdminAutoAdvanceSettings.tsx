import { Badge, Button } from 'marblerace-ui-kit';
import React from 'react';

export default function AdminAutoAdvanceSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  const [seconds, setSeconds] = React.useState<number>(() => Math.max(0, Math.round((state?.perPostStageDelayMs || 15000)/1000)));
  React.useEffect(() => {
    setSeconds(Math.max(0, Math.round((state?.perPostStageDelayMs || 15000)/1000)));
  }, [state?.perPostStageDelayMs]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Badge>Auto-advance in: {Math.max(0, Math.round((state?.perPostStageDelayMs || 0)/1000))}s</Badge>
      <input
        type="number"
        min={0}
        value={seconds}
        onChange={(e) => setSeconds(Math.max(0, Number(e.target.value) || 0))}
        style={{ width: 120, padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
      />
      <Button onClick={() => sendAdmin('setAutoAdvanceDelay', { seconds })}>Set Auto-Advance Delay</Button>
    </div>
  );
}
