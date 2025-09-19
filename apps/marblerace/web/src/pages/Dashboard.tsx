import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Table, Badge, Countdown, QR } from 'marblerace-ui-kit';
import { connectRoom, getServerConfig } from '../lib/colyseus';

export default function Dashboard() {
  const [room, setRoom] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [publicBase, setPublicBase] = useState<string | null>(null);

  useEffect(() => {
    connectRoom().then((r) => {
      setRoom(r);
      setState(r.state);
      r.onStateChange((newState: any) => setState({ ...newState }));
    });
    getServerConfig().then((cfg) => {
      if (cfg?.publicHttpUrl) setPublicBase(cfg.publicHttpUrl);
    });
  }, []);

  const standings = useMemo(() => {
    if (!state) return [] as any[];
    const playersArr: any[] = [];
    const players = (state as any).players;
    if (players && typeof players.forEach === 'function') {
      players.forEach((v: any) => { if (v) playersArr.push(v); });
    } else {
      playersArr.push(...Object.values(players ?? {}));
    }
    const safeName = (n: any) => (typeof n === 'string' ? n : '');
    const stageCount = Number(state?.stages?.length || 0);
    return playersArr
      .map((p) => {
        const perStage: number[] = [];
        for (let i = 0; i < stageCount; i++) {
          const r = p?.results?.[i];
          perStage.push(Number(r?.points ?? 0));
        }
        return {
          name: p?.name,
          total: Number(p?.totalPoints ?? 0),
          best: p?.bestPlacement || 9999,
          earliest: (p?.earliestBestStageIndex ?? -1) >= 0 ? p.earliestBestStageIndex : 9999,
          perStage,
        };
      })
      .sort((a: any, b: any) => (b.total - a.total) || (a.best - b.best) || (a.earliest - b.earliest) || safeName(a.name).localeCompare(safeName(b.name)));
  }, [state]);

  const roomId = state?.roomId;
  const events = useMemo(() => {
    const out: any[] = [];
    const raw = (state as any)?.ticker;
    if (raw && typeof (raw as any).forEach === 'function') {
      (raw as any).forEach((v: any) => out.push(v));
    } else if (Array.isArray(raw)) {
      out.push(...raw);
    }
    return out;
  }, [state]);
  const link = `${publicBase || window.location.origin}/game`;

  return (
    <div style={{ padding: 16 }}>
      <h2>Marble Race Dashboard</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Badge>Global: {state?.globalPhase}</Badge>
        <Badge>Stage: {state?.stagePhase}</Badge>
        <Badge>Stage {typeof state?.stageIndex === 'number' ? state.stageIndex + 1 : '-'} / {state?.stages?.length || 0}</Badge>
        <Countdown msRemaining={state?.countdownMsRemaining} />
        <div style={{ marginLeft: 'auto' }}>
          <QR url={link} />
        </div>
      </div>
      {((state?.stages?.length || 0) === 0) && (
        <Panel title="Waiting">
          <div>Waiting for race… Admin has not created a race yet.</div>
        </Panel>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
        <Panel title="Standings">
          <Table
            headers={["#", "Player", ...Array.from({ length: state?.stages?.length || 0 }).map((_, i) => `S${i+1}`), "Total"]}
            rows={standings.map((p: any, i: number) => [i+1, p.name, ...(p.perStage || []), p.total])}
          />
        </Panel>
        <Panel title="Events">
          <ul>
            {events.map((t: any, i: number) => {
              const ts = Number(t?.ts ?? 0);
              const time = Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleTimeString() : '-';
              return (
                <li key={i}>[{time}] {t?.kind ?? ''}: {t?.msg ?? ''}</li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
