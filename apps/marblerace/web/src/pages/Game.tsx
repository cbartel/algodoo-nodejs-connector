import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clampRanges } from 'marblerace-protocol';
import { Button, Panel, Badge } from 'marblerace-ui-kit';
import { connectRoom } from '../lib/colyseus';

export default function Game() {
  const [room, setRoom] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [name, setName] = useState(localStorage.getItem('mr_name') || '');
  const [config, setConfig] = useState<any>({ color: { r: 255, g: 255, b: 255 } });
  const [saving, setSaving] = useState(false);
  const [flashSaved, setFlashSaved] = useState(false);
  const lastSentRef = useRef<{ radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } } | null>(null);
  const EPS = 1e-3;
  const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
  // Points-based allocation (gamified)
  const TOTAL_POINTS = 10;
  const MAX_PER_STAT = 10;
  const [alloc, setAlloc] = useState<{ density: number; friction: number; restitution: number; radius: number }>({ density: 0, friction: 0, restitution: 0, radius: 0 });
  const [hasInteracted, setHasInteracted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    connectRoom().then((r) => {
      setRoom(r);
      setState(r.state);
      r.onStateChange((newState: any) => setState({ ...newState }));
    });
  }, []);

  // Auto-join if a name is remembered and lobby is open
  // (placed after `me` is computed)

  function join() {
    if (!room) return;
    localStorage.setItem('mr_name', name);
    room.send('join', { name });
  }

  function pushConfig() {
    const sp = state?.stagePhase;
    const gp = state?.globalPhase;
    const canChange = (sp === 'prep' || sp === 'countdown') && (gp === 'intermission' || gp === 'countdown') && !me?.spawned;
    if (!room || !hasInteracted || !canChange) return;
    const differs = !me ||
      !eq(me.config?.radius ?? 0, config.radius ?? 0) ||
      !eq(me.config?.density ?? 0, config.density ?? 0) ||
      !eq(me.config?.friction ?? 0, config.friction ?? 0) ||
      !eq(me.config?.restitution ?? 0, config.restitution ?? 0) ||
      (me.config?.color?.r ?? -1) !== config.color.r ||
      (me.config?.color?.g ?? -1) !== config.color.g ||
      (me.config?.color?.b ?? -1) !== config.color.b;
    if (!differs) return;
    setSaving(true);
    room.send('setConfig', { partial: config });
    lastSentRef.current = {
      radius: config.radius,
      density: config.density,
      friction: config.friction,
      restitution: config.restitution,
      color: { ...config.color },
    };
  }

  const me = useMemo(() => {
    if (!state || !room) return null;
    const pid = room.sessionId;
    const players: any = (state as any).players;
    if (!players) return null;
    // Colyseus MapSchema compatibility: prefer get/forEach, fallback to index access
    try {
      if (typeof players.get === 'function') {
        const direct = players.get(pid);
        if (direct) return direct;
      }
      if (typeof players.forEach === 'function') {
        let found: any = null;
        players.forEach((v: any) => { if (!found && v && v.id === pid) found = v; });
        if (found) return found;
      }
    } catch {}
    return (players as any)[pid] || null;
  }, [state, room]);

  useEffect(() => {
    if (me && me.config && me.config.color) {
      setConfig((c: any) => ({ ...c, color: { r: me.config.color.r, g: me.config.color.g, b: me.config.color.b } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.config?.color?.r, me?.config?.color?.g, me?.config?.color?.b]);

  // Points UI helpers
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const ease = (t: number) => Math.pow(t, 1.15);
  const toLevel = (v: number) => Math.max(0, Math.min(MAX_PER_STAT, v|0));
  const usedPoints = alloc.density + alloc.friction + alloc.restitution + alloc.radius;
  const pointsLeft = TOTAL_POINTS - usedPoints;
  const setAllocClamped = (key: 'density' | 'friction' | 'restitution' | 'radius', value: number) => {
    value = toLevel(value);
    setAlloc((prev) => {
      const next = { ...prev, [key]: value } as typeof prev;
      let used = next.density + next.friction + next.restitution + next.radius;
      if (used > TOTAL_POINTS) {
        const order: Array<keyof typeof next> = ['radius', 'density', 'friction', 'restitution']
          .sort((a, b) => next[b] - next[a]);
        for (const k of order) {
          if (k === key) continue;
          while (used > TOTAL_POINTS && next[k] > 0) { next[k]--; used--; }
          if (used <= TOTAL_POINTS) break;
        }
      }
      return next;
    });
    setHasInteracted(true);
  };
  const levelOf = (key: 'density' | 'friction' | 'restitution' | 'radius') => {
    const t = ease((alloc as any)[key] / MAX_PER_STAT);
    if (key === 'density') return lerp(clampRanges.density.min, clampRanges.density.max, t);
    if (key === 'friction') return lerp(clampRanges.friction.min, clampRanges.friction.max, t);
    if (key === 'restitution') return lerp(clampRanges.restitution.min, clampRanges.restitution.max, t);
    return lerp(clampRanges.radius.min, clampRanges.radius.max, t);
  };

  // Map allocation to server config
  useEffect(() => {
    if (!hasInteracted) return;
    setConfig((c: any) => ({
      ...c,
      density: levelOf('density'),
      friction: levelOf('friction'),
      restitution: levelOf('restitution'),
      radius: levelOf('radius'),
    }));
  }, [alloc.density, alloc.friction, alloc.restitution, alloc.radius, hasInteracted]);

  // Auto-join if a name is remembered and lobby is open
  useEffect(() => {
    if (room && state && state.globalPhase === 'lobby' && state.lobbyOpen && !me && name.trim()) {
      join();
    }
  }, [room, state?.globalPhase, state?.lobbyOpen, me, name]);

  const colorHex = `#${(config.color.r|0).toString(16).padStart(2,'0')}${(config.color.g|0).toString(16).padStart(2,'0')}${(config.color.b|0).toString(16).padStart(2,'0')}`;

  const waiting = !state || ((state.stages?.length || 0) === 0);
  const inLobby = state?.globalPhase === 'lobby';
  const inIntermission = state?.globalPhase === 'intermission';
  const lobbyOpen = !!state?.lobbyOpen;
  const inCountdown = state?.stagePhase === 'countdown';
  const inPrep = state?.stagePhase === 'prep';
  const canConfigure = (inPrep || inCountdown) && !me?.spawned;
  const locked = !canConfigure;

  useEffect(() => {
    if (!me && inLobby && lobbyOpen) nameInputRef.current?.focus();
  }, [me, inLobby, lobbyOpen]);

  const playersArr = useMemo(() => {
    const out: any[] = [];
    const players: any = (state as any)?.players;
    if (!players) return out;
    try {
      if (typeof players.forEach === 'function') {
        players.forEach((v: any) => { if (v) out.push(v); });
        return out;
      }
      if (Array.isArray(players)) return players.filter(Boolean);
      return Object.values(players).filter(Boolean);
    } catch {
      return out;
    }
  }, [state]);
  const playersCount = playersArr.length;

  const isSynced = !!(me && me.config && me.config.color &&
    eq(me.config.radius, config.radius) &&
    eq(me.config.density, config.density) &&
    eq(me.config.friction, config.friction) &&
    eq(me.config.restitution, config.restitution) &&
    me.config.color.r === config.color.r &&
    me.config.color.g === config.color.g &&
    me.config.color.b === config.color.b);

  // Flash a transient "Saved" toast when the server reflects latest changes
  useEffect(() => {
    if (saving && isSynced) {
      setSaving(false);
      setFlashSaved(true);
      const t = setTimeout(() => setFlashSaved(false), 1200);
      return () => clearTimeout(t);
    }
  }, [saving, isSynced]);

  // Also clear saving when server matches the last values we sent (tolerant compare)
  useEffect(() => {
    if (!saving || !me?.config || !lastSentRef.current) return;
    const last = lastSentRef.current;
    if (
      eq(me.config.radius, last.radius) &&
      eq(me.config.density, last.density) &&
      eq(me.config.friction, last.friction) &&
      eq(me.config.restitution, last.restitution) &&
      me.config.color.r === last.color.r &&
      me.config.color.g === last.color.g &&
      me.config.color.b === last.color.b
    ) {
      setSaving(false);
      setFlashSaved(true);
      const t = setTimeout(() => setFlashSaved(false), 1200);
      return () => clearTimeout(t);
    }
  }, [saving, me?.config?.radius, me?.config?.density, me?.config?.friction, me?.config?.restitution, me?.config?.color?.r, me?.config?.color?.g, me?.config?.color?.b]);

  // Clear saving indicator if configuration is no longer allowed
  useEffect(() => {
    if (!canConfigure && saving) setSaving(false);
  }, [canConfigure, saving]);

  // Debounce pushing config changes while in prep/countdown (before race)
  useEffect(() => {
    if (!me || !canConfigure) return;
    const t = setTimeout(() => {
      pushConfig();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.radius,
    config.density,
    config.friction,
    config.restitution,
    config.color.r,
    config.color.g,
    config.color.b,
    me?.id,
    canConfigure
  ]);

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto', position: 'relative' }}>
      <style>{`
        .mr-header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
        .mr-right{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .mr-greeting{color:#9df;font-weight:700;display:flex;align-items:center;gap:8px}
        .mr-grid{display:grid;gap:12px;grid-template-columns:1fr}
        @media(min-width:900px){.mr-grid{grid-template-columns:1.4fr 1fr}}
        .mr-bar{height:12px;background:#191b20;border:3px solid #333;position:relative}
        .mr-fill{height:100%;background:linear-gradient(90deg,#49f,#9cf);box-shadow:0 0 0 2px #036 inset}
        .mr-pts{font-size:12px;color:#9df}
        .mr-alloc{display:grid;gap:8px}
      `}</style>
      <header className="mr-header">
        <h2 style={{ margin: 0 }}>Marble Race</h2>
        {me && (
          <div className="mr-greeting">
            <span>Welcome, <strong>{me.name}</strong></span>
            <span title="Your marble" style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid #666', display: 'inline-block', background: colorHex }} />
          </div>
        )}
        <div className="mr-right">
          <Badge>Global: {state?.globalPhase}</Badge>
          <Badge>Stage: {state?.stagePhase}</Badge>
          <Badge>Stage {typeof state?.stageIndex === 'number' ? state.stageIndex + 1 : '-'} / {state?.stages?.length || 0}</Badge>
        </div>
      </header>

      {waiting ? (
        <Panel title="Waiting">
          <div>Waiting for race… Ask the admin to create a race.</div>
        </Panel>
      ) : !me ? (
        <Panel title={inLobby ? 'Join the Lobby' : 'Intermission'}>
            {inLobby ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div>Enter your name to join.</div>
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                  style={{ padding: 8, border: '3px solid #333', background: '#14161b', color: '#fff' }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button onClick={join}>
                    Join
                  </Button>
                  {!lobbyOpen && <span style={{ color: '#fc6' }}>Lobby closed. Waiting for admin…</span>}
                </div>
              </div>
            ) : (
              <div>Intermission underway. Lobby is closed to new joins. Returning players can adjust their setup.</div>
            )}
          </Panel>
        ) : canConfigure ? (
          <div className="mr-grid">
            <Panel title="Prepare Your Marble">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 96, height: 96, borderRadius: '50%', border: '4px solid #333', background: colorHex }} />
                <div style={{ display: 'grid', gap: 8, alignItems: 'center', width: '100%' }}>
                  <label style={{ fontSize: 12, color: '#6cf' }}>Color</label>
                  <input
                    type="color"
                    value={colorHex}
                    onChange={(e) => {
                      const hex = e.target.value.replace('#','');
                      setConfig((c: any) => ({
                        ...c,
                        color: {
                          r: parseInt(hex.slice(0,2),16),
                          g: parseInt(hex.slice(2,4),16),
                          b: parseInt(hex.slice(4,6),16),
                        }
                      }));
                      setHasInteracted(true);
                    }}
                  />
                  <div style={{ height: 8 }} />
                  <div className="mr-alloc">
                    <div className="mr-pts">Points left: <strong style={{ color: pointsLeft === 0 ? '#9df' : '#fc6' }}>{pointsLeft}</strong> / {TOTAL_POINTS}</div>
                    {([
                      { key: 'radius', label: 'Diameter' },
                      { key: 'density', label: 'Density' },
                      { key: 'friction', label: 'Friction' },
                      { key: 'restitution', label: 'Restitution' },
                    ] as const).map(({ key, label }) => {
                      const value = (alloc as any)[key];
                      const val = levelOf(key as any);
                      return (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px', gap: 8, alignItems: 'center' }}>
                          <div style={{ color: '#6cf' }}>{label}</div>
                          <div>
                            <div className="mr-bar"><div className="mr-fill" style={{ width: `${(value / MAX_PER_STAT) * 100}%` }} /></div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <Button disabled={value <= 0} onClick={() => setAllocClamped(key, value - 1)}>-1</Button>
                              <Button disabled={usedPoints >= TOTAL_POINTS} onClick={() => setAllocClamped(key, value + 1)}>+1</Button>
                            </div>
                          </div>
                          <div style={{ color: '#9df' }}>
                            {key === 'radius' ? val.toFixed(3) : key === 'density' ? val.toFixed(1) : val.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 18 }}>
                    {saving && <span style={{ color: '#fc6' }}>Saving…</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => room?.send('spawn')} disabled={me?.spawned}>Spawn</Button>
                    {me?.spawned && <span style={{ color: '#9df' }}>Spawned ✓</span>}
                  </div>
                </div>
              </div>
            </Panel>
            <Panel title="Status">
              <div style={{ display: 'grid', gap: 8 }}>
                <div>Players in lobby: {playersCount}</div>
                <div>Phase: {inPrep ? 'Preparation' : inCountdown ? 'Countdown' : state?.stagePhase}</div>
                {locked && (
                  <div style={{ color: '#fc6' }}>Configuration locked. {me?.spawned ? 'You have spawned.' : state?.stagePhase === 'running' ? 'Race started.' : ''}</div>
                )}
              </div>
            </Panel>
          </div>
        ) : (
        <div>
          {inCountdown && (
            <div
              style={{
                position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', zIndex: 10
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, marginBottom: 8, color: '#9df' }}>Get ready…</div>
                <div style={{ fontSize: 96, fontWeight: 900, color: '#fc6', textShadow: '0 0 12px #630' }}>
                  {Math.max(0, Math.ceil((state?.countdownMsRemaining ?? 0) / 1000))}
                </div>
              </div>
            </div>
          )}
          {flashSaved && (
            <>
              <style>
                {`@keyframes toastInOut{0%{opacity:0;transform:translate(-50%,8px) scale(0.98)}10%{opacity:1;transform:translate(-50%,0) scale(1)}90%{opacity:1}100%{opacity:0;transform:translate(-50%,-4px) scale(0.98)}}`}
              </style>
              <div
                style={{
                  position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
                  background: '#0f1115', border: '3px solid #6f6', padding: '8px 12px', color: '#6f6',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)', zIndex: 20,
                  animation: 'toastInOut 1200ms ease-in-out forwards'
                }}
              >
                ✓ Saved
              </div>
            </>
          )}
          <Panel title="Race HUD">
            <div style={{ display: 'grid', gap: 6 }}>
              <div>Stage: {state?.stageIndex >= 0 ? (state?.stages?.[state.stageIndex]?.name || state?.stages?.[state.stageIndex]?.id) : '-'}</div>
              <div>Status: {state?.stagePhase}</div>
              {locked && (
                <div style={{ color: '#fc6' }}>Configuration locked. Focus on the race!</div>
              )}
            </div>
          </Panel>
          {state?.stagePhase === 'stage_finished' && (
            <Panel title="Stage Results">
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {Object.values((state?.players as any) || {})
                  .map((p: any) => ({ name: p?.name, res: p?.results?.[state.stageIndex] }))
                  .filter((r: any) => r.res && (r.res.placement || r.res.placement === 0))
                  .sort((a: any, b: any) => (a.res.placement || 9999) - (b.res.placement || 9999))
                  .map((r: any, i: number) => (
                    <li key={i}>
                      {r.res.placement ? `#${r.res.placement} ` : 'DNF '} {r.name} {r.res.points ? `(+${r.res.points})` : ''}
                    </li>
                  ))}
              </ol>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
