import React, { useEffect, useMemo, useState } from 'react';
import { Button, Panel, Table, Badge } from 'marblerace-ui-kit';
import { connectRoom } from '../lib/colyseus';

export default function Admin() {
  const [room, setRoom] = useState<any>(null);
  // Selected scenes + custom names (ordered)
  // New tiered points configuration, entered as CSV of "count x points" pairs.
  const [tiersText, setTiersText] = useState('3x10,5x7,2x5');
  const [state, setState] = useState<any>(null);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const [token, setToken] = useState<string>(() => localStorage.getItem('mr_admin_token') || 'changeme');
  const [pingInfo, setPingInfo] = useState<{ ok: boolean; rtt: number; age: number } | null>(null);

  useEffect(() => {
    connectRoom().then((r) => {
      setRoom(r);
      setState(r.state);
      r.onStateChange((newState: any) => setState({ ...newState }));
      r.onMessage('admin.denied', (msg: any) => {
        alert('Admin action denied: ' + (msg?.reason || 'unknown'));
      });
    });
  }, []);

  // Rebind on managed reconnection
  useEffect(() => {
    const onReconnected = (ev: any) => {
      const r2 = ev?.detail?.room;
      if (!r2) return;
      setRoom(r2);
      setState(r2.state);
      r2.onStateChange((newState: any) => setState({ ...newState }));
      r2.onMessage('admin.denied', (msg: any) => {
        alert('Admin action denied: ' + (msg?.reason || 'unknown'));
      });
    };
    window.addEventListener('mr:room.reconnected', onReconnected);
    return () => window.removeEventListener('mr:room.reconnected', onReconnected);
  }, []);

  // Poll health for PING roundtrip RTT
  useEffect(() => {
    let t: any;
    async function poll() {
      try {
        const res = await fetch('/mr/health');
        const j = await res.json();
        const last = Number(j?.ping?.lastPingAt || 0);
        const rtt = Number(j?.ping?.lastPingRtt || -1);
        const ok = !!j?.ping?.pingOk;
        const age = last > 0 ? Math.round((Date.now() - last)/1000) : -1;
        setPingInfo({ ok, rtt, age });
      } catch {}
      t = setTimeout(poll, 3000);
    }
    poll();
    return () => t && clearTimeout(t);
  }, []);

  // Allow passing token via URL, e.g. /admin?token=SECRET
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const t = qp.get('token');
    if (t) {
      setToken(t);
      localStorage.setItem('mr_admin_token', t);
    }
  }, []);

  const players = useMemo(() => {
    const out: any[] = [];
    const p = (state as any)?.players;
    if (!p) return out;
    try { if (typeof p.forEach === 'function') { p.forEach((v: any) => v && out.push(v)); return out; } } catch {}
    try { if (Array.isArray(p)) return p.filter(Boolean); } catch {}
    try { return Object.values(p).filter(Boolean); } catch {}
    return out;
  }, [state]);
  const scenes = useMemo(() => {
    const arr: string[] = [];
    const raw = (state as any)?.scenes;
    if (raw && typeof (raw as any).forEach === 'function') { (raw as any).forEach((v: any) => arr.push(String(v))); }
    else if (Array.isArray(raw)) arr.push(...raw.map(String));
    return arr.sort((a, b) => a.localeCompare(b));
  }, [state]);
  const clientAliveAgo = useMemo(() => {
    const ts = Number((state as any)?.clientLastAliveTs ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    const diff = Date.now() - ts;
    return Math.round(diff / 1000);
  }, [state?.clientLastAliveTs]);

  function sendAdmin(action: string, data?: any) {
    if (!room) return;
    const auth = (token || '').trim();
    room.send('admin', { token: auth, action, data });
  }

  function parseTiers(text: string): Array<{ count: number; points: number }> {
    const items = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const tiers: Array<{ count: number; points: number }> = [];
    for (const it of items) {
      const m = it.match(/^(\d+)\s*[xX:\*]\s*(\d+)$/);
      if (!m) continue;
      const count = parseInt(m[1], 10);
      const points = parseInt(m[2], 10);
      if (Number.isFinite(count) && Number.isFinite(points) && count > 0 && points >= 0) {
        tiers.push({ count, points });
      }
    }
    return tiers;
  }

  function defaultNameFromId(id: string): string {
    const base = id.split('/').pop() || id;
    return base.replace(/\.(phn|phz)$/i, '');
  }

  function createRace() {
    const source = selectedScenes;
    const stages = source.map((id) => ({ id, name: (stageNames[id] || '').trim() || defaultNameFromId(id) }));
    const tiers = parseTiers(tiersText);
    sendAdmin('createRace', { stages, tiers });
  }
  function moveStage(idx: number, dir: -1 | 1) {
    setSelectedScenes((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function removeStage(id: string) {
    setSelectedScenes((prev) => prev.filter((s) => s !== id));
    setStageNames((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Admin</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 4px' }}>
        <label style={{ fontSize: 12, color: '#6cf' }}>Admin Token</label>
        <input
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            localStorage.setItem('mr_admin_token', e.target.value);
          }}
          placeholder="MARBLERACE_ADMIN_TOKEN"
          style={{ padding: 8, border: '3px solid #333', background: '#14161b', color: '#fff', minWidth: 220 }}
        />
        <span style={{ fontSize: 12, color: '#9df' }}>Tip: add ?token=… to the URL</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Panel title="Create Race">
          {scenes.length > 0 ? (
            <div>
              <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div>Available scenes from Algodoo client ({scenes.length})</div>
                <Button onClick={() => sendAdmin('scanScenes')}>Refresh Scenes</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Scenes</div>
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '3px solid #333', padding: 8 }}>
                    {scenes.map((s) => (
                      <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedScenes.includes(s)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedScenes((prev) => prev.includes(s) ? prev : [...prev, s]);
                              setStageNames((prev) => ({ ...prev, [s]: prev[s] ?? defaultNameFromId(s) }));
                            } else {
                              removeStage(s);
                            }
                          }}
                        />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Selected Stages (order & names)</div>
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '3px solid #333', padding: 8, display: 'grid', gap: 6 }}>
                    {selectedScenes.length === 0 && <div style={{ color: '#aaa' }}>No stages selected yet.</div>}
                    {selectedScenes.map((id, idx) => (
                      <div key={id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
                        <input
                          value={stageNames[id] ?? defaultNameFromId(id)}
                          onChange={(e) => setStageNames((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder={defaultNameFromId(id)}
                          style={{ padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button onClick={() => moveStage(idx, -1)} disabled={idx === 0}>Up</Button>
                          <Button onClick={() => moveStage(idx, +1)} disabled={idx === selectedScenes.length - 1}>Down</Button>
                          <Button onClick={() => removeStage(id)}>Remove</Button>
                        </div>
                        <div style={{ gridColumn: '1 / span 2', fontSize: 12, color: '#9df' }}>{id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9df', marginTop: 8 }}>Tip: Select scenes, reorder, and rename as needed.</div>
            </div>
          ) : (
            <div style={{ color: '#fc6' }}>No scenes received from client yet.</div>
          )}
          {/* Removed manual stage entry; selection + ordering + naming controls above */}
          <div style={{ marginTop: 8 }}>Points Tiers (e.g., 3x10,5x7,2x5)</div>
          <input value={tiersText} onChange={(e) => setTiersText(e.target.value)} style={{ width: '100%' }} />
          <div style={{ marginTop: 8 }}>
            <Button onClick={createRace} disabled={selectedScenes.length === 0}>Create</Button>
          </div>
        </Panel>
        <Panel title="Controls">
          {(() => {
            const stageCount = Number(state?.stages?.length || 0);
            const inLobby = state?.globalPhase === 'lobby';
            const inIntermission = state?.globalPhase === 'intermission';
            const inPrep = state?.stagePhase === 'prep';
            const inCountdown = state?.stagePhase === 'countdown';
            const inRunning = state?.stagePhase === 'running';
            const inFinished = state?.stagePhase === 'stage_finished';
            const canLoadStage = inLobby && stageCount > 0;
            const canStartCountdown = inIntermission && inPrep;
            const canNextStage = inFinished;
            const currentStageName = stageCount > 0 && typeof state?.stageIndex === 'number' && state.stageIndex >= 0
              ? (state?.stages?.[state.stageIndex]?.name || state?.stages?.[state.stageIndex]?.id)
              : '-';
            return (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ color: '#9df' }}>Flow:</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {['Lobby','Prep','Countdown','Running','Stage Finished'].map((label, i) => {
                      const active = (i===0&&inLobby)||(i===1&&(inIntermission&&inPrep))||(i===2&&inCountdown)||(i===3&&inRunning)||(i===4&&inFinished);
                      return (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', border: '3px solid #6cf', background: active ? '#6cf' : 'transparent' }} />
                          <div style={{ color: active ? '#fff' : '#9df' }}>{label}</div>
                          {i < 4 && <span style={{ color: '#555' }}>→</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button onClick={() => sendAdmin('openLobby')}>Open Lobby</Button>
                  <Button onClick={() => sendAdmin('lockLobby')}>Lock Lobby</Button>
                  <Button onClick={() => sendAdmin('setAutoAdvance', { auto: !(state?.autoAdvance) })}>
                    Auto-advance: {state?.autoAdvance ? 'ON' : 'OFF'}
                  </Button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button onClick={() => sendAdmin('start')} disabled={!canLoadStage && !canStartCountdown}>
                    {canLoadStage ? 'Load Stage' : canStartCountdown ? 'Start Countdown' : 'Start'}
                  </Button>
                  <Button onClick={() => sendAdmin('endStageNow')} disabled={!inRunning}>End Stage</Button>
                  <Button onClick={() => sendAdmin('nextStage')} disabled={!canNextStage}>Next Stage</Button>
                  <Button onClick={() => sendAdmin('reset')}>Reset Race</Button>
                  <Button onClick={() => sendAdmin('finish')}>Finish Race</Button>
                </div>
                <PrepSettings state={state} sendAdmin={sendAdmin} />
                <AutoAdvanceSettings state={state} sendAdmin={sendAdmin} />
                <div style={{ display: 'grid', gap: 6 }}>
                  <Badge>Lobby: {state?.lobbyOpen ? 'Open' : 'Closed'}</Badge>
                  <Badge>Global: {state?.globalPhase}</Badge>
                  <Badge>Stage: {state?.stagePhase}</Badge>
                  <Badge>Current: {currentStageName}</Badge>
                  <Badge>Stage {typeof state?.stageIndex === 'number' ? state.stageIndex + 1 : '-'} / {stageCount}</Badge>
                  {!!state?.countdownMsRemaining && <Badge>Countdown: {Math.ceil((state.countdownMsRemaining || 0)/1000)}s</Badge>}
              <div style={{ display:'flex', gap:6, alignItems:'center', border: pingInfo?.ok ? '3px solid #2a2' : '3px solid #a22', padding: 4 }}>
                <Badge tone={clientAliveAgo != null && clientAliveAgo <= 6 ? 'success' : 'warn'}>
                  Algodoo Client: {clientAliveAgo == null ? 'unknown' : clientAliveAgo <= 6 ? 'connected' : `last alive ${clientAliveAgo}s ago`}
                </Badge>
                {pingInfo && (
                  <Badge tone={pingInfo.ok ? 'success' : 'danger'}>
                    RTT: {pingInfo.rtt >= 0 ? `${pingInfo.rtt}ms` : '—'} {pingInfo.age >= 0 ? `(age ${pingInfo.age}s)` : ''}
                  </Badge>
                )}
              </div>
                </div>
              </div>
            );
          })()}
        </Panel>
      </div>
      <Panel title="Players">
        <div style={{ overflowX: 'auto' }}>
          <Table
            headers={["Name","Spawned","Stage Pts","Total","Radius","Density","Friction","Restitution","Color","Actions"]}
            rows={(players as any[]).map((p) => {
              const idx = typeof state?.stageIndex === 'number' ? state.stageIndex : -1;
              const pts = (p?.results?.[idx]?.points ?? 0);
              const col = p?.config?.color || { r: 255, g: 255, b: 255 };
              const swatch = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
              return [
                p.name,
                p.spawned ? '✓' : '-',
                pts,
                p.totalPoints ?? 0,
                (p.config?.radius ?? 0).toFixed(3),
                (p.config?.density ?? 0).toFixed(1),
                (p.config?.friction ?? 0).toFixed(2),
                (p.config?.restitution ?? 0).toFixed(2),
                <span key="c" title={swatch} style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '3px solid #333', background: swatch }} />,
                <Button key="remove" onClick={() => sendAdmin('removePlayer', { playerId: p.id })}>Remove</Button>,
              ];
            })}
          />
        </div>
      </Panel>
    </div>
  );
}

function PrepSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
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

function AutoAdvanceSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
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
