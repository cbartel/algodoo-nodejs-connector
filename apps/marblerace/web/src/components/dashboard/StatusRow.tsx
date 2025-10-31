import { Badge, Countdown } from 'marblerace-ui-kit';
import React from 'react';

import { safeMultiplier } from '../../utils/points';

export default function StatusRow({ s }: { s: any }) {
  const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
  const multiplier = idx >= 0 ? safeMultiplier(s?.stages?.[idx]?.multiplier, 1) : 1;
  const multiplierLabel = Math.abs(multiplier - 1) > 0.001 ? `×${multiplier.toFixed(1)}` : '×1.0';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Badge>Global: {s?.globalPhase}</Badge>
      <Badge>Stage: {s?.stagePhase}</Badge>
      <Badge>Stage {typeof s?.stageIndex === 'number' ? s.stageIndex + 1 : '-'} / {s?.stages?.length || 0}</Badge>
      <Badge>Multiplier: {multiplierLabel}</Badge>
      <Countdown msRemaining={s?.countdownMsRemaining} />
    </div>
  );
}
