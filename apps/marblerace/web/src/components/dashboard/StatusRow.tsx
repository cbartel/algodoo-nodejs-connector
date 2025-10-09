import { Badge, Countdown } from 'marblerace-ui-kit';
import React from 'react';

export default function StatusRow({ s }: { s: any }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Badge>Global: {s?.globalPhase}</Badge>
      <Badge>Stage: {s?.stagePhase}</Badge>
      <Badge>Stage {typeof s?.stageIndex === 'number' ? s.stageIndex + 1 : '-'} / {s?.stages?.length || 0}</Badge>
      <Countdown msRemaining={s?.countdownMsRemaining} />
    </div>
  );
}
