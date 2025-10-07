import { Button, Panel, Table, Badge } from 'marblerace-ui-kit';
import React, { useEffect, useMemo, useState } from 'react';

import { connectRoom } from '../lib/colyseus';

export default function Admin() {
  const [room, setRoom] = useState<any>(null);
  // Selected scenes + custom names (ordered)
  // New tiered points configuration, entered as CSV of "count x points" pairs.
  const [tiersText, setTiersText] = useState('3x10,5x7,2x5');
  const [state, setState] = useState<any>(null);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const [stageRepeats, setStageRepeats] = useState<Record<string, number>>({});
  const [token, setToken] = useState<string>(() => localStorage.getItem('mr_admin_token') || 'changeme');
  const [pingInfo, setPingInfo] = useState<{ ok: boolean; rtt: number; age: number } | null>(null);
  const [titleDraft, setTitleDraft] = useState<string>('');
  const titleDebounceRef = React.useRef<any>(null);

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

  // Sync local caption draft with server state
  useEffect(() => {
    setTitleDraft(String((state)?.title || 'Marble Race'));
  }, [state?.title]);

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
    const p = (state)?.players;
    if (!p) return out;
    try { if (typeof p.forEach === 'function') { p.forEach((v: any) => v && out.push(v)); return out; } } catch {}
    try { if (Array.isArray(p)) return p.filter(Boolean); } catch {}
    try { return Object.values(p).filter(Boolean); } catch {}
    return out;
  }, [state]);
  const scenes = useMemo(() => {
    const arr: string[] = [];
    const raw = (state)?.scenes;
    if (raw && typeof (raw).forEach === 'function') { (raw).forEach((v: any) => arr.push(String(v))); }
    else if (Array.isArray(raw)) arr.push(...raw.map(String));
    return arr.sort((a, b) => a.localeCompare(b));
  }, [state]);
  const clientAliveAgo = useMemo(() => {
    const ts = Number((state)?.clientLastAliveTs ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    const diff = Date.now() - ts;
    return Math.round(diff / 1000);
  }, [state?.clientLastAliveTs]);

  function sendAdmin(action: string, data?: any) {
    if (!room) return;
    const auth = (token || '').trim();
    room.send('admin', { token: auth, action, data });
  }

  function parseTiers(text: string): { count: number; points: number }[] {
    const items = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const tiers: { count: number; points: number }[] = [];
    for (const it of items) {
      const m = /^(\d+)\s*[xX:\*]\s*(\d+)$/.exec(it);
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
    const stages = source.map((id) => ({
      id,
      name: (stageNames[id] || '').trim() || defaultNameFromId(id),
      repeats: Math.max(1, Number(stageRepeats[id] ?? 1) | 0),
    }));
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
    setStageRepeats((prev) => {
      const n = { ...prev } as any;
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
                      <div key={id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', alignItems: 'center', gap: 8 }}>
                        <input
                          value={stageNames[id] ?? defaultNameFromId(id)}
                          onChange={(e) => setStageNames((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder={defaultNameFromId(id)}
                          style={{ padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#6cf' }}>Repeats</span>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Button onClick={() => setStageRepeats((prev) => ({ ...prev, [id]: Math.max(1, (Number(prev[id] ?? 1) | 0) - 1) }))}>-</Button>
                            <span style={{ minWidth: 24, textAlign: 'center' }}>{Math.max(1, Number(stageRepeats[id] ?? 1) | 0)}</span>
                            <Button onClick={() => setStageRepeats((prev) => ({ ...prev, [id]: Math.max(1, (Number(prev[id] ?? 1) | 0) + 1) }))}>+</Button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button onClick={() => moveStage(idx, -1)} disabled={idx === 0}>Up</Button>
                          <Button onClick={() => moveStage(idx, +1)} disabled={idx === selectedScenes.length - 1}>Down</Button>
                          <Button onClick={() => removeStage(id)}>Remove</Button>
                        </div>
                        <div style={{ gridColumn: '1 / span 3', fontSize: 12, color: '#9df' }}>{id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9df', marginTop: 8 }}>Tip: Select scenes, reorder, and rename as needed.</div>
              <div style={{ marginTop: 10 }}>
                <RangesSettings state={state} sendAdmin={sendAdmin} />
              </div>
              <div style={{ marginTop: 10 }}>
                <MultiplierSettings state={state} sendAdmin={sendAdmin} />
              </div>
            </div>
          ) : (
            <div style={{ color: '#fc6' }}>No scenes received from client yet.</div>
          )}
          {/* Removed manual stage entry; selection + ordering + naming controls above */}
          <div style={{ marginTop: 8 }}>Points Tiers (e.g., 3x10,5x7,2x5)</div>
          <input value={tiersText} onChange={(e) => setTiersText(e.target.value)} style={{ width: '100%' }} />
          <div style={{ marginTop: 8, color: '#9df' }}>
            Total stages to run: {selectedScenes.reduce((sum, id) => sum + Math.max(1, Number(stageRepeats[id] ?? 1) | 0), 0)}
          </div>
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
                {/* Caption editor and live preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ color: '#9df' }}>Caption:</div>
                  <input
                    value={titleDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTitleDraft(v);
                      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
                      titleDebounceRef.current = setTimeout(() => {
                        sendAdmin('setTitle', { title: v });
                      }, 300);
                    }}
                    placeholder="Enter race title"
                    style={{ minWidth: 220, padding: 8, border: '3px solid #333', background: '#14161b', color: '#fff' }}
                  />
                  {/* Live styled preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#0b0f15', border: '4px solid #6cf', boxShadow: '0 0 0 2px #036 inset' }}>
                    <span style={{
                      fontWeight: 1000,
                      fontSize: 20,
                      background: 'linear-gradient(90deg,#9cf,#fff,#9cf)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      textShadow: '0 0 10px #069',
                      backgroundSize: '200% auto',
                      animation: 'neonShift 6s linear infinite, neonGlow 2.4s ease-in-out infinite alternate',
                      letterSpacing: 1.2,
                    }}>{String(titleDraft || 'Marble Race')}</span>
                    <span style={{ color: '#555' }}>—</span>
                    <span style={{
                      border: '3px solid #fc6',
                      padding: '2px 8px',
                      color: '#fc6',
                      fontWeight: 900,
                      background: 'rgba(40,30,0,0.35)',
                      boxShadow: '0 0 12px #630',
                    }}>{currentStageName}</span>
                  </div>
                  <style>{`
                    @keyframes neonShift { to { background-position: 200% center } }
                    @keyframes neonGlow { 0% { text-shadow: 0 0 6px #069 } 100% { text-shadow: 0 0 16px #0bf } }
                  `}</style>
                </div>
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
                  <Button onClick={() => sendAdmin('setEnforceUniqueColors', { enforce: !(state?.enforceUniqueColors) })}>
                    Enforce unique colors: {state?.enforceUniqueColors ? 'ON' : 'OFF'}
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
                <CeremonySettings state={state} sendAdmin={sendAdmin} />
                <MusicSettings state={state} sendAdmin={sendAdmin} />
                <div style={{ display: 'grid', gap: 6 }}>
                  <Badge>Lobby: {state?.lobbyOpen ? 'Open' : 'Closed'}</Badge>
                  <Badge>Global: {state?.globalPhase}</Badge>
                  <Badge>Stage: {state?.stagePhase}</Badge>
                  <Badge>Current: {currentStageName}</Badge>
                  <Badge>Stage {typeof state?.stageIndex === 'number' ? state.stageIndex + 1 : '-'} / {stageCount}</Badge>
                  <Badge>Ranges: {String(state?.globalPhase||'') === 'lobby' ? 'Editable' : 'Locked'}</Badge>
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
            rows={(players).map((p) => {
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

function CeremonySettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
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

function MusicSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  const [text, setText] = React.useState<string>('');
  React.useEffect(() => {
    setText(String(state?.spotifyPlaylistId || ''));
  }, [state?.spotifyPlaylistId]);
  const id = String(state?.spotifyPlaylistId || '').trim();
  const embedUrl = id ? `https://open.spotify.com/playlist/${id}` : '';
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge>Spotify Playlist</Badge>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Playlist ID or URL"
          style={{ minWidth: 260, padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
        />
        <Button onClick={() => sendAdmin('setSpotifyPlaylist', { id: text })}>Apply</Button>
        <Button onClick={() => { setText(''); sendAdmin('setSpotifyPlaylist', { id: '' }); }}>Clear</Button>
      </div>
      {id && (
        <div style={{ fontSize: 12, color: '#9df' }}>
          Current: <a href={embedUrl} target="_blank" rel="noreferrer">{id}</a>
        </div>
      )}
    </div>
  );
}

function MultiplierSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
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

function RangesSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
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
  const decs = {
    radius: 3,
    density: 1,
    friction: 2,
    restitution: 2,
  } as const;
  const round = (v: number, d: number) => {
    if (!Number.isFinite(v)) return 0;
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  };
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
