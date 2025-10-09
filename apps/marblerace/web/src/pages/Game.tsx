/* eslint-env browser */
import { clampRanges as defaultClampRanges, defaultMarbleConfig } from 'marblerace-protocol';
import { Button, Panel } from 'marblerace-ui-kit';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import CheerPanel, { type CheerDef } from '../components/game/CheerPanel';
import { useRoom } from '../hooks/useRoom';
import { getPlayerKey } from '../lib/colyseus';
import { okLabDistance } from '../utils/color';
import './Game.css';


export default function Game() {
  const [room, setRoom] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [name, setName] = useState(localStorage.getItem('mr_name') || '');
  const playerKeyRef = useRef<string>(getPlayerKey());
  const [config, setConfig] = useState<any>({
    radius: defaultMarbleConfig.radius,
    density: defaultMarbleConfig.density,
    friction: defaultMarbleConfig.friction,
    restitution: defaultMarbleConfig.restitution,
    color: { r: defaultMarbleConfig.color.r, g: defaultMarbleConfig.color.g, b: defaultMarbleConfig.color.b },
  });
  const [colorDenied, setColorDenied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flashSaved, setFlashSaved] = useState(false);
  const [cheerEdit, setCheerEdit] = useState(false);
  const [cheers, setCheers] = useState<CheerDef[]>([]);
  const forceCheerUi = useRef(0);
  const lastCheerSentAtRef = useRef(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mr_cheers_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCheers(parsed.filter((c) => c && typeof c.icon === 'string' && typeof c.text === 'string'));
          return;
        }
      }
      setCheers([
        { icon: '👾', text: 'All your base!' },
        { icon: '🚀', text: 'To the moon!' },
        { icon: '🕹️', text: 'Do a barrel roll!' },
        { icon: '😹', text: 'LOLcats approved!' },
        { icon: '💾', text: 'Save point!' },
        { icon: '🔥', text: 'It’s over 9000!' },
        { icon: '🧱', text: '404: brakes not found' },
        { icon: '🎉', text: 'WinRAR activated!' },
      ]);
    } catch {
      setCheers([
        { icon: '👾', text: 'All your base!' },
        { icon: '🚀', text: 'To the moon!' },
        { icon: '🕹️', text: 'Do a barrel roll!' },
        { icon: '😹', text: 'LOLcats approved!' },
        { icon: '💾', text: 'Save point!' },
        { icon: '🔥', text: 'It’s over 9000!' },
        { icon: '🧱', text: '404: brakes not found' },
        { icon: '🎉', text: 'WinRAR activated!' },
      ]);
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('mr_cheers_v2', JSON.stringify(cheers)); } catch { void 0; }
  }, [cheers]);
  const lastSentRef = useRef<{ radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } } | null>(null);
  const EPS = 1e-3;
  const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
  const TOTAL_POINTS = 10;
  const MAX_PER_STAT = 10;
  const [alloc, setAlloc] = useState<{ density: number; friction: number; restitution: number; radius: number }>({ density: 0, friction: 0, restitution: 0, radius: 0 });
  const [hasInteracted, setHasInteracted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const roomState = useRoom<any>();
  useEffect(() => {
    if (!roomState.room) return;
    setRoom(roomState.room);
    setState(roomState.state);
    const r = roomState.room as any;
    try {
      r.onMessage('color.denied', (msg: any) => {
        const who = msg?.conflictWith?.name || 'someone';
        setColorDenied(`Color too similar to ${who}. Pick a different color.`);
        setTimeout(() => setColorDenied(null), 2500);
      });
    } catch { void 0; }
  }, [roomState.room, roomState.state]);

  function join() {
    if (!room) return;
    if ((state)?.enforceUniqueColors && hasColorConflict) {
      setColorDenied('Color too similar. Pick one of the suggestions.');
      return;
    }
    localStorage.setItem('mr_name', name);
    room.send('join', { name, playerKey: playerKeyRef.current, color: { r: config.color.r|0, g: config.color.g|0, b: config.color.b|0 } });
  }


  const me = useMemo(() => {
    if (!state || !room) return null;
    const pid = playerKeyRef.current;
    const players: any = (state).players;
    if (!players) return null;
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
    } catch { void 0; }
    return (players)[pid] || null;
  }, [state, room]);

  useEffect(() => {
    if (me?.config) {
      setConfig((c: any) => ({
        ...c,
        radius: typeof me.config.radius === 'number' ? me.config.radius : c.radius,
        density: typeof me.config.density === 'number' ? me.config.density : c.density,
        friction: typeof me.config.friction === 'number' ? me.config.friction : c.friction,
        restitution: typeof me.config.restitution === 'number' ? me.config.restitution : c.restitution,
        color: me.config.color ? { r: me.config.color.r, g: me.config.color.g, b: me.config.color.b } : c.color,
      }));
    }
     
  }, [me?.config?.radius, me?.config?.density, me?.config?.friction, me?.config?.restitution, me?.config?.color?.r, me?.config?.color?.g, me?.config?.color?.b]);

  const ease = (t: number) => Math.pow(t, 1.15);
  const usedPoints = Math.abs(alloc.density) + Math.abs(alloc.friction) + Math.abs(alloc.restitution) + Math.abs(alloc.radius);
  const pointsLeft = TOTAL_POINTS - usedPoints;
  const setAllocClamped = (key: 'density' | 'friction' | 'restitution' | 'radius', value: number) => {
    const v = Math.max(-MAX_PER_STAT, Math.min(MAX_PER_STAT, Math.round(value)));
    setAlloc((prev) => {
      const next = { ...prev, [key]: v } as typeof prev;
      let used = Math.abs(next.density) + Math.abs(next.friction) + Math.abs(next.restitution) + Math.abs(next.radius);
      if (used > TOTAL_POINTS) {
        const orderInit = ['radius', 'density', 'friction', 'restitution'] as const;
        const order: (keyof typeof next)[] = [];
        for (const k of orderInit) { if (k !== key) order.push(k); }
        order.sort((a, b) => Math.abs(next[b]) - Math.abs(next[a]));
        let idx = 0;
        while (used > TOTAL_POINTS && (Math.abs(next[order[0]]) > 0 || Math.abs(next[order[1]]) > 0 || Math.abs(next[order[2]]) > 0)) {
          const k = order[idx % order.length];
          if (next[k] !== 0) {
            next[k] += next[k] > 0 ? -1 : 1;
            used -= 1;
          }
          idx++;
        }
      }
      return next;
    });
    setHasInteracted(true);
  };
  const mapDelta = (key: 'density' | 'friction' | 'restitution' | 'radius', delta: number): number => {
    const ranges = (state)?.ranges || defaultClampRanges;
    const r = (ranges)[key];
    const base = (r && typeof r.min === 'number' && typeof r.max === 'number')
      ? (r.min + r.max) / 2
      : (defaultMarbleConfig as any)[key];
    const dir = delta >= 0 ? 1 : -1;
    const t = ease(Math.min(1, Math.abs(delta) / MAX_PER_STAT));
    if (dir >= 0) return base + t * (r.max - base);
    return base - t * (base - r.min);
  };

  useEffect(() => {
    if (!hasInteracted) return;
    setConfig((c: any) => ({
      ...c,
      density: mapDelta('density', alloc.density),
      friction: mapDelta('friction', alloc.friction),
      restitution: mapDelta('restitution', alloc.restitution),
      radius: mapDelta('radius', alloc.radius),
    }));
  }, [alloc.density, alloc.friction, alloc.restitution, alloc.radius, hasInteracted]);


  const colorHex = `#${(config.color.r|0).toString(16).padStart(2,'0')}${(config.color.g|0).toString(16).padStart(2,'0')}${(config.color.b|0).toString(16).padStart(2,'0')}`;

  const otherColors = useMemo(() => {
    const meId = playerKeyRef.current;
    const arr: { r:number; g:number; b:number }[] = [];
    try {
      const players: any = (state)?.players;
      if (players && typeof players.forEach === 'function') {
        players.forEach((p: any) => { if (p && p.id !== meId) arr.push({ r: p.config?.color?.r|0, g: p.config?.color?.g|0, b: p.config?.color?.b|0 }); });
      } else {
        Object.values((state)?.players || {}).forEach((p: any) => { if (p && p.id !== meId) arr.push({ r: p.config?.color?.r|0, g: p.config?.color?.g|0, b: p.config?.color?.b|0 }); });
      }
    } catch { void 0; }
    return arr;
  }, [state?.players, config.color.r, config.color.g, config.color.b]);

  const hasColorConflict = useMemo(() => {
    const mine = config.color;
    for (const oc of otherColors) {
      if (okLabDistance(mine, oc) < 0.12) return true;
    }
    return false;
  }, [otherColors, config.color.r, config.color.g, config.color.b]);

  const generateSuggestions = useMemo(() => (n = 5) => {
    const res: { r:number; g:number; b:number }[] = [];
    let attempts = 0;
    while (res.length < n && attempts < 200) {
      attempts++;
      const r = Math.floor(40 + Math.random()*215);
      const g = Math.floor(40 + Math.random()*215);
      const b = Math.floor(40 + Math.random()*215);
      const cand = { r, g, b };
      let ok = otherColors.every((oc) => okLabDistance(cand, oc) >= 0.12);
      if (ok) ok = res.every((oc) => okLabDistance(cand, oc) >= 0.12);
      if (ok) res.push(cand);
    }
    return res;
  }, [otherColors]),
  suggestions = useMemo(() => generateSuggestions(5), [generateSuggestions]);

  const waiting = !state || ((state.stages?.length || 0) === 0);
  const inLobby = state?.globalPhase === 'lobby';
  const inIntermission = state?.globalPhase === 'intermission';
  const lobbyOpen = !!state?.lobbyOpen;
  const inCountdown = state?.stagePhase === 'countdown';
  const inPrep = state?.stagePhase === 'prep';
  const inRunning = state?.stagePhase === 'running';
  const inFinished = state?.stagePhase === 'stage_finished';
  const canConfigure = (inPrep || inCountdown) && !me?.spawned;
  

  const stageIdx = typeof state?.stageIndex === 'number' ? state.stageIndex : -1;
  const myStagePoints = (me)?.results?.[stageIdx]?.points ?? 0;
  const myTotal = (me)?.totalPoints ?? 0;
  const currentStageName = stageIdx >= 0 ? (state?.stages?.[stageIdx]?.name || state?.stages?.[stageIdx]?.id) : '-';
  const [scoreFx, setScoreFx] = useState(false);
  const lastTotalRef = useRef<number>(0);
  useEffect(() => {
    const prev = lastTotalRef.current;
    if (myTotal > prev) {
      setScoreFx(true);
      const t = setTimeout(() => setScoreFx(false), 1200);
      lastTotalRef.current = myTotal;
      return () => clearTimeout(t);
    }
    lastTotalRef.current = myTotal;
  }, [myTotal]);

  useEffect(() => {
    if (!me && inLobby && lobbyOpen) nameInputRef.current?.focus();
  }, [me, inLobby, lobbyOpen]);

  const playersArr = useMemo(() => {
    const out: any[] = [];
    const players: any = (state)?.players;
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

  const myRank = useMemo(() => {
    try {
      const arr: { id: string; name: string; total: number; best: number; earliest: number }[] = [];
      const players: any = (state)?.players;
      const each = (fn: (p: any) => void) => {
        if (players && typeof players.forEach === 'function') { players.forEach(fn); }
        else { Object.values(players || {}).forEach((p: any) => fn(p)); }
      };
      each((p: any) => {
        if (!p) return;
        arr.push({
          id: String(p.id || ''),
          name: String(p.name || ''),
          total: Number(p.totalPoints || 0),
          best: (p.bestPlacement || 9999),
          earliest: ((p.earliestBestStageIndex ?? -1) >= 0 ? p.earliestBestStageIndex : 9999),
        });
      });
      arr.sort((a, b) => (b.total - a.total) || (a.best - b.best) || (a.earliest - b.earliest) || a.name.localeCompare(b.name));
      const pid = String(me?.id || playerKeyRef.current);
      const idx = arr.findIndex((x) => x.id === pid);
      return idx >= 0 ? (idx + 1) : 0;
    } catch { return 0; }
  }, [state, me?.id]);

  const isSynced = !!(me?.config?.color &&
    eq(me.config.radius, config.radius) &&
    eq(me.config.density, config.density) &&
    eq(me.config.friction, config.friction) &&
    eq(me.config.restitution, config.restitution) &&
    me.config.color.r === config.color.r &&
    me.config.color.g === config.color.g &&
    me.config.color.b === config.color.b);

  useEffect(() => {
    if (saving && isSynced) {
      setSaving(false);
      setFlashSaved(true);
      const t = setTimeout(() => setFlashSaved(false), 1200);
      return () => clearTimeout(t);
    }
  }, [saving, isSynced]);

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

  useEffect(() => {
    if (!canConfigure && saving) setSaving(false);
  }, [canConfigure, saving]);

  useEffect(() => {
    if (!me || !inPrep || me?.spawned) return;
    const t = setTimeout(() => {
      if (!room) return;
      room.send('setConfig', { partial: { radius: config.radius, density: config.density, friction: config.friction, restitution: config.restitution } });
    }, 300);
    return () => clearTimeout(t);
  }, [config.radius, config.density, config.friction, config.restitution, inPrep, me?.spawned, room]);

  useEffect(() => {
    if (!room || !me) return;
    if (!(inLobby || inPrep || inCountdown) || me?.spawned) return;
    const t = setTimeout(() => {
      room.send('setConfig', { partial: { color: { r: config.color.r|0, g: config.color.g|0, b: config.color.b|0 } } });
    }, 150);
    return () => clearTimeout(t);
  }, [config.color.r, config.color.g, config.color.b, inLobby, inPrep, inCountdown, me, room]);

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto', position: 'relative' }}>
      
      <header className="mr-header">
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{
            fontWeight: 1000,
            fontSize: 28,
            background: 'linear-gradient(90deg,#9cf,#fff,#9cf)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 12px #069',
            backgroundSize: '200% auto',
            animation: 'neonShift 6s linear infinite, neonGlow 2.4s ease-in-out infinite alternate',
            letterSpacing: 1.2,
          }}>{String(state?.title || 'Marble Race')}</span>
          <span style={{ color: '#555' }}>—</span>
          <span style={{
            border: '3px solid #fc6',
            padding: '2px 8px',
            color: '#fc6',
            fontWeight: 900,
            background: 'rgba(40,30,0,0.35)',
            boxShadow: '0 0 12px #630',
          }}>{currentStageName}</span>
          {me && (
            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#0f1115', border: '4px solid #6cf', boxShadow: '0 0 0 2px #036 inset',
                padding: '6px 10px', borderRadius: 12,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span title="your marble" style={{ width: 14, height: 14, borderRadius: '50%', border: '3px solid #666', display: 'inline-block', background: colorHex }} />
                  <strong>{me.name}</strong>
                </div>
                <span style={{ color: '#555' }}>•</span>
                <div title="Overall standing" style={{ color:'#ffd700', fontWeight:900 }}>#{myRank || '-'}</div>
                <span style={{ color: '#555' }}>•</span>
                <div title="Total points" style={{ color:'#cde' }}>Total: <strong>{myTotal}</strong></div>
                <span style={{ color: '#555' }}>•</span>
                <div title="Points this stage" style={{ color:'#6f6' }}>Stage: <strong>+{myStagePoints}</strong></div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mr-flow">
        {['Lobby','Prep','Countdown','Running','Finished'].map((label, i) => {
          const active = (i===0&&inLobby)||(i===1&&(inIntermission&&inPrep))||(i===2&&inCountdown)||(i===3&&inRunning)||(i===4&&inFinished);
          return (
            <div key={label} style={{ display:'flex',alignItems:'center',gap:6 }}>
              <span className={`mr-dot ${active ? 'active' : ''}`} />
              <span style={{ color: active ? '#fff' : '#9df' }}>{label}</span>
              {i<4 && <span style={{ color:'#555' }}>→</span>}
            </div>
          );
        })}
      </div>

      {inPrep && (state?.prepMsRemaining ?? 0) > 0 && (
        <div
          style={{
            position: 'fixed', left: '50%', top: 12, transform: 'translateX(-50%)',
            background: 'rgba(15,17,21,0.9)', border: '4px solid #6cf', padding: '8px 14px',
            color: '#fff', fontWeight: 800, fontSize: 22, borderRadius: 8, zIndex: 15,
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)'
          }}
        >
          Prep ends in{' '}
          <span style={{ color: '#fc6', fontSize: 28 }}>
            {Math.max(0, Math.ceil((state?.prepMsRemaining || 0) / 1000))}s
          </span>
        </div>
      )}

      {inCountdown && (
        <div
          style={{
            position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', zIndex: 50
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 8, color: '#9df' }}>Get ready…</div>
            <div style={{ fontSize: 96, fontWeight: 900, color: '#fc6', textShadow: '0 0 12px #630' }}>
              {Math.max(0, Math.ceil((state?.countdownMsRemaining ?? 0) / 1000))}
            </div>
            {!me?.spawned && (
              <div style={{ marginTop: 12 }}>
                <Button onClick={() => room?.send('spawn')}>Spawn</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {scoreFx && (
        <div className="mr-fx">
          {Array.from({ length: 28 }).map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 0.2;
            const dur = 0.9 + Math.random() * 0.8;
            const colors = ['#fc6','#6cf','#f66','#6f6','#9df'];
            const color = colors[i % colors.length];
            const style: React.CSSProperties = {
              left: `${left}vw`,
              background: color,
              animation: `mrFall ${dur}s ease-in ${delay}s forwards`,
            };
            return <span key={i} className="mr-piece" style={style} />;
          })}
        </div>
      )}

      {waiting ? (
        <Panel title="Waiting">
          <div>Waiting for race… Ask the admin to create a race.</div>
        </Panel>
      ) : !me ? (
        <Panel title={lobbyOpen ? 'Join the Lobby' : (inLobby ? 'Lobby Closed' : 'Intermission')}>
          {lobbyOpen ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                {inLobby && <span>Enter your name and pick a color to join.</span>}
                {inPrep && <span>A stage is in preparation. Join now to customize and spawn.</span>}
                {inCountdown && <span>Countdown in progress. Join now and spawn before the start.</span>}
                {inRunning && <span>Race currently running. Join now and you’ll enter next stage.</span>}
                {inFinished && <span>Stage just finished. Join now for the next stage.</span>}
              </div>
              <input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                style={{ padding: 8, border: '3px solid #333', background: '#14161b', color: '#fff' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6cf' }}>Color</span>
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
                  }}
                  style={{ border: ((state)?.enforceUniqueColors && hasColorConflict) ? '3px solid #f66' : '3px solid #333' }}
                />
                <span title="Your marble" style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: colorHex }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button onClick={join} disabled={!!(state)?.enforceUniqueColors && hasColorConflict}>Join</Button>
                {!inLobby && inRunning && <span style={{ color: '#9df' }}>You’ll join the next stage.</span>}
                {!inLobby && inCountdown && <span style={{ color: '#9df' }}>Spawn is still open—be quick!</span>}
                {!!(state)?.enforceUniqueColors && hasColorConflict && (
                  <span style={{ color: '#f66' }}>Pick a distinct color to join</span>
                )}
              </div>
              {(hasColorConflict || colorDenied) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {suggestions.map((c, i) => {
                    const hx = `#${(c.r|0).toString(16).padStart(2,'0')}${(c.g|0).toString(16).padStart(2,'0')}${(c.b|0).toString(16).padStart(2,'0')}`;
                    return (
                      <button key={i} className="ux-swatch" style={{ background: hx }} onClick={() => {
                        setConfig((prev:any) => ({ ...prev, color: { r: c.r, g: c.g, b: c.b } }));
                      }} title={hx} />
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>Lobby is closed. Please wait for the admin to open it.</div>
          )}
        </Panel>
      ) : canConfigure ? (
          <div className="mr-grid">
            <Panel title="Prepare Your Marble">
              <div className="ux-grid">
                <div className="ux-left">
                  <div className="ux-preview" style={{ background: colorHex }} />
                  <div className="ux-section">
                    <div className="ux-label">Color</div>
                    <div className="ux-row">
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
                        style={{ width: 48, height: 32, border: ((state)?.enforceUniqueColors && hasColorConflict) ? '3px solid #f66' : '3px solid #333', background: '#14161b' }}
                      />
                      <div className="ux-swatches">
                        {['#ff4d4d','#ffb84d','#ffe84d','#66ff66','#66ccff','#cc99ff','#ffffff'].map((hex) => (
                          <button key={hex} className="ux-swatch" style={{ background: hex }} onClick={() => {
                            const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
                            setConfig((c: any) => ({ ...c, color: { r, g, b } }));
                            setHasInteracted(true);
                          }} />
                        ))}
                      </div>
                      <Button onClick={() => {
                        const s = suggestions[0];
                        if (s) setConfig((c: any) => ({ ...c, color: s }));
                        else {
                          const rand = () => Math.floor(Math.random()*256);
                          setConfig((c: any) => ({ ...c, color: { r: rand(), g: rand(), b: rand() } }));
                        }
                        setHasInteracted(true);
                      }}>Suggest Unique</Button>
                    </div>
                    {(hasColorConflict || colorDenied) && (
                      <div style={{ marginTop: 8, color: (state)?.enforceUniqueColors ? '#f66' : '#fc6', fontWeight: 700 }}>
                        {colorDenied || ((state)?.enforceUniqueColors ? 'Color too similar — pick a distinct one.' : 'Color is similar — consider changing.')}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {suggestions.map((c, i) => {
                            const hx = `#${(c.r|0).toString(16).padStart(2,'0')}${(c.g|0).toString(16).padStart(2,'0')}${(c.b|0).toString(16).padStart(2,'0')}`;
                            return (
                              <button key={i} className="ux-swatch" style={{ background: hx }} onClick={() => {
                                setConfig((prev:any) => ({ ...prev, color: { r: c.r, g: c.g, b: c.b } }));
                                setHasInteracted(true);
                              }} title={hx} />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="ux-help">Color is always adjustable before your marble spawns.</div>
                  </div>
                </div>
                <div className="ux-right">
                  <div className="ux-section">
                    <div className="ux-header">
                      <div className="ux-label">Allocate Points</div>
                      <div className="ux-points">Left: <strong className={pointsLeft === 0 ? 'ok' : 'warn'}>{pointsLeft}</strong> / {TOTAL_POINTS}</div>
                    </div>
                    <div className="ux-sliders">
                      {([
                        { key: 'radius', label: 'Diameter', desc: 'Bigger marble = more stability, less agility.' },
                        { key: 'density', label: 'Density', desc: 'Heavier marble preserves speed and momentum.' },
                        { key: 'friction', label: 'Friction', desc: 'Grip with surfaces; higher = better cornering.' },
                        { key: 'restitution', label: 'Bounciness', desc: 'How much energy is returned after impact.' },
                      ] as const).map(({ key, label, desc }) => {
                        const value = (alloc as any)[key];
                        const mapped = mapDelta(key as any, value);
                        const mappedText = key === 'radius' ? mapped.toFixed(3) : key === 'density' ? mapped.toFixed(1) : mapped.toFixed(2);
                        const canSpend = pointsLeft > 0;
                        const disabledMinus = !(value > -MAX_PER_STAT && (value > 0 || canSpend));
                        const disabledPlus = !(value < MAX_PER_STAT && (value < 0 || canSpend));
                        return (
                          <div key={key} className="ux-slider-row">
                            <div className="ux-slider-head">
                              <div className="ux-slider-label">{label}</div>
                              <div className="ux-slider-value">{mappedText}</div>
                            </div>
                            <input
                              type="range"
                              min={-MAX_PER_STAT}
                              max={MAX_PER_STAT}
                              step={1}
                              value={value}
                              onChange={(e) => setAllocClamped(key, Number(e.target.value))}
                              className="ux-range"
                            />
                            <div className="ux-slider-foot">
                              <div className="ux-desc">{desc}</div>
                              <div className="ux-bumpers">
                                <Button disabled={disabledMinus} onClick={() => setAllocClamped(key, value - 1)}>-</Button>
                                <Button disabled={disabledPlus} onClick={() => setAllocClamped(key, value + 1)}>+</Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="ux-actions">
                      {saving && <span className="ux-saving">Saving…</span>}
                      <Button onClick={() => {
                        setAlloc({ density: 0, friction: 0, restitution: 0, radius: 0 });
                        setHasInteracted(false);
                      }}>Reset</Button>
                      <Button onClick={() => room?.send('spawn')} disabled={me?.spawned || ((state)?.enforceUniqueColors && hasColorConflict)}>Spawn</Button>
                      {me?.spawned && <span style={{ color: '#9df' }}>Spawned ✓</span>}
                      {(!(me?.spawned) && (state)?.enforceUniqueColors && hasColorConflict) && <span style={{ color: '#f66' }}>Pick a distinct color to spawn</span>}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
            <Panel title="Status">
              <div style={{ display: 'grid', gap: 8 }}>
                <div>Players in lobby: {playersCount}</div>
                <div>Phase: {inPrep ? 'Preparation' : inCountdown ? 'Countdown' : state?.stagePhase}</div>
                <div>Stage: {currentStageName}</div>
              </div>
            </Panel>
          </div>
        ) : (
        <div>
          {flashSaved && (
            <>
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
          {state?.stagePhase === 'stage_finished' && (
            <Panel title="Stage Results">
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {Object.values((state?.players) || {})
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
          {state?.stagePhase === 'stage_finished' && (state?.postStageMsRemaining || 0) > 0 && (
            <div
              style={{
                position: 'fixed', left: '50%', top: 12, transform: 'translateX(-50%)',
                background: 'rgba(15,17,21,0.9)', border: '4px solid #6cf', padding: '8px 14px',
                color: '#fff', fontWeight: 800, fontSize: 22, borderRadius: 8, zIndex: 15,
                boxShadow: '0 6px 18px rgba(0,0,0,0.5)'
              }}
            >
              Next stage in{' '}
              <span style={{ color: '#fc6', fontSize: 28 }}>
                {Math.max(0, Math.ceil((state?.postStageMsRemaining || 0) / 1000))}s
              </span>
            </div>
          )}
        </div>
      )}
      <CheerPanel
        room={room}
        me={me}
        state={state}
        cheerEdit={cheerEdit}
        setCheerEdit={setCheerEdit}
        cheers={cheers}
        setCheers={setCheers}
        forceCheerUi={forceCheerUi}
        lastCheerSentAtRef={lastCheerSentAtRef}
      />
    </div>
  );
 

}
