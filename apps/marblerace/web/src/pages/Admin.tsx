import { Button, Panel, Table, Badge } from 'marblerace-ui-kit';
import React, { useEffect, useMemo, useState } from 'react';

import AdminAutoAdvanceSettings from '../components/admin/AdminAutoAdvanceSettings';
import AdminCeremonySettings from '../components/admin/AdminCeremonySettings';
import AdminMultiplierSettings from '../components/admin/AdminMultiplierSettings';
import AdminMusicSettings from '../components/admin/AdminMusicSettings';
import AdminPrepSettings from '../components/admin/AdminPrepSettings';
import AdminRangesSettings from '../components/admin/AdminRangesSettings';
import { useAdminToken } from '../hooks/useAdminToken';
import { usePingInfo } from '../hooks/usePingInfo';
import { useRoom } from '../hooks/useRoom';
import { formatPoints } from '../utils/points';
import './Admin.css';

export default function Admin() {
  const [room, setRoom] = useState<any>(null);
  const [tiersText, setTiersText] = useState('3x10,5x7,2x5');
  const [state, setState] = useState<any>(null);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const [stageRepeats, setStageRepeats] = useState<Record<string, number>>({});
  const [stageMultipliers, setStageMultipliers] = useState<Record<string, number>>({});
  const { token, setToken } = useAdminToken();
  const pingInfo = usePingInfo();
  const [titleDraft, setTitleDraft] = useState<string>('');
  const titleDebounceRef = React.useRef<any>(null);
  const roomState = useRoom<any>();
  useEffect(() => {
    if (!roomState.room) return;
    setRoom(roomState.room);
    setState(roomState.state);
    const r = roomState.room as any;
    try {
      r.onMessage('admin.denied', (msg: any) => {
        alert('Admin action denied: ' + (msg?.reason || 'unknown'));
      });
    } catch { void 0; }
  }, [roomState.room, roomState.state]);

  useEffect(() => {
    setTitleDraft(String((state)?.title || 'Marble Race'));
  }, [state?.title]);


  const players = useMemo(() => {
    const out: any[] = [];
    const p = (state)?.players;
    if (!p) return out;
    try { if (typeof p.forEach === 'function') { p.forEach((v: any) => v && out.push(v)); return out; } } catch { void 0; }
    try { if (Array.isArray(p)) return p.filter(Boolean); } catch { void 0; }
    try { return Object.values(p).filter(Boolean); } catch { void 0; }
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
  const allowRespawn = ['prep', 'countdown', 'running'].includes(String(state?.stagePhase || ''));

  function sendAdmin(action: string, data?: any) {
    if (!room) return;
    const auth = (token || '').trim();
    room.send('admin', { token: auth, action, data });
  }

  function parseTiers(text: string): { count: number; points: number }[] {
    const items = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const tiers: { count: number; points: number }[] = [];
    for (const it of items) {
      const m = /^(\d+)\s*[xX:*]\s*(\d+)$/.exec(it);
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
    const stages = source.map((id) => {
      const repeats = Math.max(1, Number(stageRepeats[id] ?? 1) | 0);
      const multiplierRaw = Number(stageMultipliers[id] ?? 1);
      const multiplier = Number.isFinite(multiplierRaw) ? multiplierRaw : 1;
      return {
        id,
        name: (stageNames[id] || '').trim() || defaultNameFromId(id),
        repeats,
        multiplier,
      };
    });
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
    setStageMultipliers((prev) => {
      const n = { ...prev } as any;
      delete n[id];
      return n;
    });
  }

  const stageMultiplierOptions = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

  return (
    <div className="admin-root">
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
                              setStageMultipliers((prev) => ({ ...prev, [s]: prev[s] ?? 1 }));
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
                    {selectedScenes.map((id, idx) => {
                      const multiplierValue = stageMultipliers[id] ?? 1;
                      return (
                        <div key={id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', alignItems: 'center', gap: 8 }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#6cf' }}>Multiplier</span>
                            <select
                              value={String(multiplierValue)}
                              onChange={(e) => setStageMultipliers((prev) => ({ ...prev, [id]: parseFloat(e.target.value) }))}
                              style={{ padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
                            >
                              {stageMultiplierOptions.map((opt) => (
                                <option key={opt} value={opt}>{`×${opt.toFixed(1)}`}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button onClick={() => moveStage(idx, -1)} disabled={idx === 0}>Up</Button>
                            <Button onClick={() => moveStage(idx, +1)} disabled={idx === selectedScenes.length - 1}>Down</Button>
                            <Button onClick={() => removeStage(id)}>Remove</Button>
                          </div>
                          <div style={{ gridColumn: '1 / span 4', fontSize: 12, color: '#9df' }}>{id}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9df', marginTop: 8 }}>Tip: Select scenes, reorder, and rename as needed.</div>
              <div style={{ marginTop: 10 }}>
                <AdminRangesSettings state={state} sendAdmin={sendAdmin} />
              </div>
              <div style={{ marginTop: 10 }}>
                <AdminMultiplierSettings state={state} sendAdmin={sendAdmin} />
              </div>
            </div>
          ) : (
            <div style={{ color: '#fc6' }}>No scenes received from client yet.</div>
          )}
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
            const canRestartStage = stageCount > 0 && typeof state?.stageIndex === 'number' && state.stageIndex >= 0;
            const currentStageName = stageCount > 0 && typeof state?.stageIndex === 'number' && state.stageIndex >= 0
              ? (state?.stages?.[state.stageIndex]?.name || state?.stages?.[state.stageIndex]?.id)
              : '-';
            return (
              <div style={{ display: 'grid', gap: 10 }}>
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
                  <Button onClick={() => sendAdmin('restartStage')} disabled={!canRestartStage}>Restart Stage</Button>
                  <Button onClick={() => sendAdmin('nextStage')} disabled={!canNextStage}>Next Stage</Button>
                  <Button onClick={() => sendAdmin('reset')}>Reset Race</Button>
                  <Button onClick={() => sendAdmin('finish')}>Finish Race</Button>
                </div>
                <AdminPrepSettings state={state} sendAdmin={sendAdmin} />
                <AdminAutoAdvanceSettings state={state} sendAdmin={sendAdmin} />
                <AdminCeremonySettings state={state} sendAdmin={sendAdmin} />
                <AdminMusicSettings state={state} sendAdmin={sendAdmin} />
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
              const pts = Number(p?.results?.[idx]?.points ?? 0);
              const col = p?.config?.color || { r: 255, g: 255, b: 255 };
              const swatch = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
              return [
                p.name,
                p.spawned ? '✓' : '-',
                formatPoints(pts),
                formatPoints(p.totalPoints ?? 0),
                (p.config?.radius ?? 0).toFixed(3),
                (p.config?.density ?? 0).toFixed(1),
                (p.config?.friction ?? 0).toFixed(2),
                (p.config?.restitution ?? 0).toFixed(2),
                <span key="c" title={swatch} style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '3px solid #333', background: swatch }} />,
                <div key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button onClick={() => sendAdmin('respawnPlayer', { playerId: p.id })} disabled={!allowRespawn}>
                    Respawn
                  </Button>
                  <Button onClick={() => sendAdmin('removePlayer', { playerId: p.id })}>Remove</Button>
                </div>,
              ];
            })}
          />
        </div>
      </Panel>
    </div>
  );
}
/* eslint-env browser */
