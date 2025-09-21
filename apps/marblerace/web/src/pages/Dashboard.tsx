import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Table, Badge, Countdown, QR } from 'marblerace-ui-kit';
import { connectRoom, getServerConfig } from '../lib/colyseus';

export default function Dashboard() {
  const [room, setRoom] = useState<any>(null);
  const [ver, setVer] = useState(0);
  const [publicBase, setPublicBase] = useState<string | null>(null);
  const [eventsObs, setEventsObs] = useState<string[]>([]);

  useEffect(() => {
    connectRoom().then((r) => {
      setRoom(r);
      // ticker now carries formatted strings; no special number handling required
      const applyFromState = () => {
        const sAny: any = r.state as any;
        const t: any = sAny?.ticker;
        const acc: string[] = [];
        try {
          const n = Number((t && t.length) || 0);
          for (let i = 0; i < n; i++) {
            const it: any = t[i];
            acc.push(String(it));
          }
        } catch {}
        setEventsObs(acc);
        setVer((v) => v + 1);
      };
      applyFromState();
      r.onStateChange(applyFromState);
      // Also bind ArraySchema signals directly for snappier updates
      try {
        const t: any = (r.state as any)?.ticker;
        if (t) {
          t.onAdd = (_it: any, _index: number) => applyFromState();
          t.onRemove = (_it: any, _index: number) => applyFromState();
          t.onChange = (_it: any, _index: number) => applyFromState();
        }
      } catch {}
    });
    // Handle managed reconnection: rebind listeners to the new room instance
    const onReconnected = (ev: any) => {
      const r2 = ev?.detail?.room;
      if (!r2) return;
      setRoom(r2);
      const applyFromState = () => {
        const sAny: any = r2.state as any;
        const t: any = sAny?.ticker;
        const acc: string[] = [];
        try {
          const n = Number((t && t.length) || 0);
          for (let i = 0; i < n; i++) {
            const it: any = t[i];
            acc.push(String(it));
          }
        } catch {}
        setEventsObs(acc);
        setVer((v) => v + 1);
      };
      applyFromState();
      r2.onStateChange(applyFromState);
      try {
        const t: any = (r2.state as any)?.ticker;
        if (t) {
          t.onAdd = (_it: any, _index: number) => applyFromState();
          t.onRemove = (_it: any, _index: number) => applyFromState();
          t.onChange = (_it: any, _index: number) => applyFromState();
        }
      } catch {}
    };
    window.addEventListener('mr:room.reconnected', onReconnected);
    getServerConfig().then((cfg) => {
      if (cfg?.publicHttpUrl) setPublicBase(cfg.publicHttpUrl);
    });
    return () => {
      window.removeEventListener('mr:room.reconnected', onReconnected);
    };
  }, []);

  const s: any = room?.state as any;
  const standings = useMemo(() => {
    if (!s) return [] as any[];
    const playersArr: any[] = [];
    const players = s.players;
    if (players && typeof players.forEach === 'function') {
      players.forEach((v: any) => { if (v) playersArr.push(v); });
    } else {
      playersArr.push(...Object.values(players ?? {}));
    }
    const safeName = (n: any) => (typeof n === 'string' ? n : '');
    const stageCount = Number(s?.stages?.length || 0);
    return playersArr
      .map((p) => {
        const perStage: number[] = [];
        for (let i = 0; i < stageCount; i++) {
          const r = p?.results?.[i];
          perStage.push(Number(r?.points ?? 0));
        }
        const col = p?.config?.color || { r: 255, g: 255, b: 255 };
        const colorHex = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
        return {
          id: p?.id,
          name: p?.name,
          total: Number(p?.totalPoints ?? 0),
          best: p?.bestPlacement || 9999,
          earliest: (p?.earliestBestStageIndex ?? -1) >= 0 ? p.earliestBestStageIndex : 9999,
          perStage,
          colorHex,
        };
      })
      .sort((a: any, b: any) => (b.total - a.total) || (a.best - b.best) || (a.earliest - b.earliest) || safeName(a.name).localeCompare(safeName(b.name)));
  }, [s, ver]);

  const roomId = s?.roomId;
  const link = `${publicBase || window.location.origin}/game`;
  const displayEvents = eventsObs;

  // Compute Top 3 scorers for the current stage (by stage points desc)
  const top3 = useMemo(() => {
    if (!s) return [] as Array<{ id: string; name: string; placement: number; points: number; colorHex: string }>;
    const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
    const arr: any[] = [];
    const players = s?.players;
    try {
      if (players && typeof players.forEach === 'function') {
        players.forEach((p: any) => {
          const r = p?.results?.[idx];
          const points = Number(r?.points ?? 0);
          const placement = Number(r?.placement ?? 0);
          const col = p?.config?.color || { r: 255, g: 255, b: 255 };
          const colorHex = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
          if (points > 0) arr.push({ id: p?.id, name: p?.name, placement, points, colorHex });
        });
      } else {
        Object.values(players || {}).forEach((p: any) => {
          const r = p?.results?.[idx];
          const points = Number(r?.points ?? 0);
          const placement = Number(r?.placement ?? 0);
          const col = p?.config?.color || { r: 255, g: 255, b: 255 };
          const colorHex = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
          if (points > 0) arr.push({ id: p?.id, name: p?.name, placement, points, colorHex });
        });
      }
    } catch {}
    // Sort by points descending, break ties by better placement then name
    return arr
      .sort((a, b) => (b.points - a.points) || ((a.placement || 9999) - (b.placement || 9999)) || String(a.name||'').localeCompare(String(b.name||'')))
      .slice(0, 3);
  }, [s, ver]);

  // Compute current stage reward pool and remaining unclaimed rewards as badges
  const rewards = useMemo(() => {
    if (!s) return { pool: [] as Array<{ points: number; tier: number }>, remaining: [] as Array<{ points: number; tier: number }>, claimedCount: 0 };
    // Flatten tiered config (preferred) or legacy per-placement table
    const pool: Array<{ points: number; tier: number }> = [];
    const ptsTiers: any = (s as any)?.pointsTiers;
    if (ptsTiers && (typeof ptsTiers.forEach === 'function' || typeof ptsTiers.length === 'number')) {
      // Use configured order (no resort) so removal aligns with placements
      const each = (fn: (t: any, i: number) => void) => {
        if (typeof ptsTiers.forEach === 'function') {
          let i = 0;
          ptsTiers.forEach((t: any) => fn(t, i++));
        } else {
          const n = Number(ptsTiers.length|0);
          for (let i = 0; i < n; i++) fn(ptsTiers[i], i);
        }
      };
      each((t, i) => {
        const count = Math.max(0, Number(t?.count || 0) | 0);
        const pts = Math.max(0, Number(t?.points || 0) | 0);
        for (let k = 0; k < count; k++) pool.push({ points: pts, tier: i });
      });
    } else {
      const table: any = (s as any)?.pointsTable;
      if (table && (typeof table.forEach === 'function' || typeof table.length === 'number')) {
        if (typeof table.forEach === 'function') {
          let i = 0;
          table.forEach((p: any) => { pool.push({ points: Number(p || 0) | 0, tier: i++ }); });
        } else {
          const n = Number(table.length|0);
          for (let i = 0; i < n; i++) pool.push({ points: Number(table[i] || 0) | 0, tier: i });
        }
      }
    }
    // Determine how many placements have already claimed points for current stage
    const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
    // Determine awarded points so far in the current stage
    let awardedSoFar = 0;
    try {
      const arr: any[] = [];
      const players = s?.players;
      if (players && typeof players.forEach === 'function') {
        players.forEach((p: any) => { if (p) arr.push(p); });
      } else {
        Object.values(players || {}).forEach((p: any) => arr.push(p));
      }
      for (const p of arr) {
        const r = p?.results?.[idx];
        if (r && typeof r.points === 'number') awardedSoFar += (r.points | 0);
      }
    } catch {}
    // Convert awarded points into number of badges to remove from left
    let claimedCount = 0;
    let acc = 0;
    for (let i = 0; i < pool.length; i++) {
      const next = acc + (pool[i].points | 0);
      if (next <= awardedSoFar) {
        acc = next;
        claimedCount = i + 1;
      } else {
        break;
      }
    }
    const remaining = pool.slice(claimedCount);
    return { pool, remaining, claimedCount };
  }, [s, ver]);

  const badgeColorForTier = (tier: number) => {
    // Tier 0: gold, 1: silver, 2: bronze, others: cyan
    if (tier === 0) return '#ffd700';
    if (tier === 1) return '#c0c0c0';
    if (tier === 2) return '#cd7f32';
    return '#6cf';
  };

  const renderRewardBadge = (pts: number, tier: number, key?: React.Key) => {
    const color = badgeColorForTier(tier);
    const glow = color === '#ffd700' ? '#ffdf70' : color === '#c0c0c0' ? '#e0e0e0' : color === '#cd7f32' ? '#f0b07a' : '#8fe3ff';
    const emoji = tier === 0 ? '🏆' : tier === 1 ? '🥈' : tier === 2 ? '🥉' : '🎖️';
    return (
      <div key={key} style={{
        border: `4px solid ${color}`,
        background: '#111',
        boxShadow: `0 0 0 2px #222 inset, 0 0 14px ${glow}`,
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 92,
        justifyContent: 'center',
      }}>
        <span style={{ filter: 'drop-shadow(0 1px 0 #000)' }}>{emoji}</span>
        <span style={{ fontWeight: 900, color }}>{pts}</span>
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      {s?.stagePhase === 'stage_finished' && (s?.postStageMsRemaining || 0) > 0 && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div style={{ textAlign: 'center', padding: 16, border: '4px solid #6cf', background: '#0f1115', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 18, color: '#9df', marginBottom: 6 }}>Next stage in</div>
            <div style={{ fontSize: 72, fontWeight: 900, color: '#fc6', textShadow: '0 0 12px #630', marginBottom: 12 }}>
              {Math.max(0, Math.ceil((s?.postStageMsRemaining || 0) / 1000))}
            </div>
            <div style={{ fontSize: 16, color: '#9df', marginBottom: 8 }}>Top 3 (Stage Points)</div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {top3.map((t, i) => (
                <li key={i} style={{ fontSize: 20, color: i===0 ? '#ffd700' : i===1 ? '#c0c0c0' : '#cd7f32', margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{i+1}.</span>
                  <span title="player color" style={{ width: 14, height: 14, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: t.colorHex }} />
                  <span>{t.name}</span>
                  <span>{t.points ? `(+${t.points})` : ''}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <h2>Marble Race Dashboard</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Badge>Global: {s?.globalPhase}</Badge>
        <Badge>Stage: {s?.stagePhase}</Badge>
        <Badge>Stage {typeof s?.stageIndex === 'number' ? s.stageIndex + 1 : '-'} / {s?.stages?.length || 0}</Badge>
        <Countdown msRemaining={s?.countdownMsRemaining} />
        <div style={{ marginLeft: 'auto' }}>
          <QR url={link} />
        </div>
      </div>
      {/* Stage Rewards badges */}
      {(rewards.pool.length > 0) && (
        <Panel title="Stage Rewards">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {rewards.remaining.map((r, i) => renderRewardBadge(r.points, r.tier, i))}
              {rewards.remaining.length === 0 && (
                <div style={{ color: '#6f6', fontWeight: 700 }}>All rewards claimed!</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#9df' }}>Remaining</span>
              <div style={{
                border: '4px solid #6cf',
                background: '#0b0f15',
                padding: '6px 10px',
                minWidth: 72,
                textAlign: 'center',
                boxShadow: '0 0 0 2px #036 inset'
              }}>
                <span style={{ fontWeight: 900, color: '#6cf' }}>{rewards.remaining.reduce((a, b) => a + (b.points|0), 0)}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Legend */}
            <span style={{ fontSize: 12, color: '#9aa' }}>Legend:</span>
            <span style={{ fontSize: 12, color: '#ffd700' }}>Gold</span>
            <span style={{ fontSize: 12, color: '#c0c0c0' }}>Silver</span>
            <span style={{ fontSize: 12, color: '#cd7f32' }}>Bronze</span>
            <span style={{ fontSize: 12, color: '#6cf' }}>Tier</span>
          </div>
        </Panel>
      )}
      {((s?.stages?.length || 0) === 0) && (
        <Panel title="Waiting">
          <div>Waiting for race… Admin has not created a race yet.</div>
        </Panel>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
        <Panel title="Standings">
          <Table
            headers={["#", "Player", ...Array.from({ length: s?.stages?.length || 0 }).map((_, i) => `S${i+1}`), "Total"]}
            rows={standings.map((p: any, i: number) => [
              i+1,
              <span key={`${p.id||p.name}-name`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span title="player color" style={{ width: 14, height: 14, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: p.colorHex }} />
                <span>{p.name}</span>
              </span>,
              ...(p.perStage || []),
              p.total
            ])}
          />
        </Panel>
        <Panel title="Events">
          <ul>
            {displayEvents.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
