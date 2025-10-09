import { Badge, Button } from 'marblerace-ui-kit';
import React from 'react';

export default function AdminPrepSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  const [seconds, setSeconds] = React.useState<number>(() => Math.max(0, Math.round((state?.perPrepTimeoutMs || 60000)/1000)));
  React.useEffect(() => {
    setSeconds(Math.max(0, Math.round((state?.perPrepTimeoutMs || 60000)/1000)));
  }, [state?.perPrepTimeoutMs]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Badge>Prep limit: {Math.max(0, Math.round((state?.perPrepTimeoutMs || 0)/1000))}s</Badge>
      <input
        type="number"
        min={0}
        value={seconds}
        onChange={(e) => setSeconds(Math.max(0, Number(e.target.value) || 0))}
        style={{ width: 100, padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
      />
      <Button onClick={() => sendAdmin('setPrepTimeout', { seconds })}>Set Prep Limit</Button>
    </div>
  );
}
