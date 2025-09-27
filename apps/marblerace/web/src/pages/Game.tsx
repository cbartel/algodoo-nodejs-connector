import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clampRanges, defaultMarbleConfig } from 'marblerace-protocol';
import { Button, Panel, Badge } from 'marblerace-ui-kit';
import { connectRoom, getPlayerKey } from '../lib/colyseus';

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
  const lastSentRef = useRef<{ radius: number; density: number; friction: number; restitution: number; color: { r: number; g: number; b: number } } | null>(null);
  const EPS = 1e-3;
  const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
  // Points-based allocation (gamified)
  const TOTAL_POINTS = 10;
  const MAX_PER_STAT = 10; // max deviation per stat (points), each step costs 1 budget
  // Signed deltas around defaults (negative/positive)
  const [alloc, setAlloc] = useState<{ density: number; friction: number; restitution: number; radius: number }>({ density: 0, friction: 0, restitution: 0, radius: 0 });
  const [hasInteracted, setHasInteracted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    connectRoom().then((r) => {
      setRoom(r);
      setState(r.state);
      r.onStateChange((newState: any) => setState({ ...newState }));
      r.onMessage('color.denied', (msg: any) => {
        const who = msg?.conflictWith?.name || 'someone';
        setColorDenied(`Color too similar to ${who}. Pick a different color.`);
        setTimeout(() => setColorDenied(null), 2500);
      });
    });
  }, []);

  // Rebind on managed reconnection (preserve playerKey)
  useEffect(() => {
    const onReconnected = (ev: any) => {
      const r2 = ev?.detail?.room;
      if (!r2) return;
      setRoom(r2);
      setState(r2.state);
      r2.onStateChange((newState: any) => setState({ ...newState }));
    };
    window.addEventListener('mr:room.reconnected', onReconnected);
    return () => window.removeEventListener('mr:room.reconnected', onReconnected);
  }, []);

  // Auto-join if a name is remembered and lobby is open
  // (placed after `me` is computed)

  function join() {
    if (!room) return;
    if ((state as any)?.enforceUniqueColors && hasColorConflict) {
      setColorDenied('Color too similar. Pick one of the suggestions.');
      return;
    }
    localStorage.setItem('mr_name', name);
    room.send('join', { name, playerKey: playerKeyRef.current, color: { r: config.color.r|0, g: config.color.g|0, b: config.color.b|0 } });
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
    const pid = playerKeyRef.current;
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
    if (me && me.config) {
      setConfig((c: any) => ({
        ...c,
        radius: typeof me.config.radius === 'number' ? me.config.radius : c.radius,
        density: typeof me.config.density === 'number' ? me.config.density : c.density,
        friction: typeof me.config.friction === 'number' ? me.config.friction : c.friction,
        restitution: typeof me.config.restitution === 'number' ? me.config.restitution : c.restitution,
        color: me.config.color ? { r: me.config.color.r, g: me.config.color.g, b: me.config.color.b } : c.color,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.config?.radius, me?.config?.density, me?.config?.friction, me?.config?.restitution, me?.config?.color?.r, me?.config?.color?.g, me?.config?.color?.b]);

  // Points UI helpers
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const ease = (t: number) => Math.pow(t, 1.15);
  const toLevel = (v: number) => Math.max(0, Math.min(MAX_PER_STAT, v|0));
  const usedPoints = Math.abs(alloc.density) + Math.abs(alloc.friction) + Math.abs(alloc.restitution) + Math.abs(alloc.radius);
  const pointsLeft = TOTAL_POINTS - usedPoints;
  const setAllocClamped = (key: 'density' | 'friction' | 'restitution' | 'radius', value: number) => {
    // clamp to [-MAX_PER_STAT, MAX_PER_STAT] integer
    let v = Math.max(-MAX_PER_STAT, Math.min(MAX_PER_STAT, Math.round(value)));
    setAlloc((prev) => {
      const next = { ...prev, [key]: v } as typeof prev;
      let used = Math.abs(next.density) + Math.abs(next.friction) + Math.abs(next.restitution) + Math.abs(next.radius);
      if (used > TOTAL_POINTS) {
        // Reduce other stats towards zero until within budget
        const order: Array<keyof typeof next> = ['radius', 'density', 'friction', 'restitution']
          .filter((k) => k !== key)
          .sort((a, b) => Math.abs(next[b]) - Math.abs(next[a]));
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
  // Map signed delta in [-MAX..MAX] to numeric value around default, with mild ease
  const mapDelta = (key: 'density' | 'friction' | 'restitution' | 'radius', delta: number): number => {
    const base = defaultMarbleConfig[key];
    const r = (clampRanges as any)[key];
    const dir = delta >= 0 ? 1 : -1;
    const t = ease(Math.min(1, Math.abs(delta) / MAX_PER_STAT));
    if (dir >= 0) return base + t * (r.max - base);
    return base - t * (base - r.min);
  };

  // Map allocation deltas to server config
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

  // No auto-join on lobby open; require explicit user action

  const colorHex = `#${(config.color.r|0).toString(16).padStart(2,'0')}${(config.color.g|0).toString(16).padStart(2,'0')}${(config.color.b|0).toString(16).padStart(2,'0')}`;

  // Gather other players' colors
  const otherColors = useMemo(() => {
    const meId = playerKeyRef.current;
    const arr: Array<{ r:number; g:number; b:number }> = [];
    try {
      const players: any = (state as any)?.players;
      if (players && typeof players.forEach === 'function') {
        players.forEach((p: any) => { if (p && p.id !== meId) arr.push({ r: p.config?.color?.r|0, g: p.config?.color?.g|0, b: p.config?.color?.b|0 }); });
      } else {
        Object.values((state as any)?.players || {}).forEach((p: any) => { if (p && p.id !== meId) arr.push({ r: p.config?.color?.r|0, g: p.config?.color?.g|0, b: p.config?.color?.b|0 }); });
      }
    } catch {}
    return arr;
  }, [state?.players, config.color.r, config.color.g, config.color.b]);

  // Perceptual color distance (OKLab)
  const srgbToLinear = (c: number) => (c/255) <= 0.04045 ? (c/255)/12.92 : Math.pow(((c/255)+0.055)/1.055, 2.4);
  const rgbToOKLab = (r8: number, g8: number, b8: number) => {
    const r = srgbToLinear(r8), g = srgbToLinear(g8), b = srgbToLinear(b8);
    const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
    const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
    const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return { L: 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_, A: 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_, B: 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_ };
  };
  const okLabDistance = (c1: any, c2: any) => {
    const a = rgbToOKLab(c1.r, c1.g, c1.b);
    const b = rgbToOKLab(c2.r, c2.g, c2.b);
    return Math.hypot(a.L-b.L, a.A-b.A, a.B-b.B);
  };
  const hasColorConflict = useMemo(() => {
    const mine = config.color;
    for (const oc of otherColors) {
      if (okLabDistance(mine, oc) < 0.12) return true;
    }
    return false;
  }, [otherColors, config.color.r, config.color.g, config.color.b]);

  const generateSuggestions = useMemo(() => (n = 5) => {
    const res: Array<{ r:number; g:number; b:number }> = [];
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
  const locked = !canConfigure;

  const stageIdx = typeof state?.stageIndex === 'number' ? state.stageIndex : -1;
  const myStagePoints = (me as any)?.results?.[stageIdx]?.points ?? 0;
  const myTotal = (me as any)?.totalPoints ?? 0;
  const currentStageName = stageIdx >= 0 ? (state?.stages?.[stageIdx]?.name || state?.stages?.[stageIdx]?.id) : '-';
  // Score FX when total increases
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

  // Debounce pushing STAT changes only during PREP (pre-spawn)
  useEffect(() => {
    if (!me || !inPrep || me?.spawned) return;
    const t = setTimeout(() => {
      if (!room) return;
      room.send('setConfig', { partial: { radius: config.radius, density: config.density, friction: config.friction, restitution: config.restitution } });
    }, 300);
    return () => clearTimeout(t);
  }, [config.radius, config.density, config.friction, config.restitution, inPrep, me?.spawned, room]);

  // Debounce pushing COLOR changes in lobby/prep/countdown (pre-spawn)
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
      <style>{`
        .mr-header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
        .mr-right{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .mr-greeting{color:#9df;font-weight:700;display:flex;align-items:center;gap:8px}
        .mr-grid{display:grid;gap:12px;grid-template-columns:1fr}
        @media(min-width:900px){.mr-grid{grid-template-columns:1.4fr 1fr}}
        .mr-bar{height:12px;background:#191b20;border:3px solid #333;position:relative}
        .mr-fill{height:100%;background:linear-gradient(90deg,#49f,#9cf);box-shadow:0 0 0 2px #036 inset}
        .mr-pts{font-size:12px;color:#9df}
        .mr-alloc{display:grid;gap:8px}
        .mr-prepare{display:flex;align-items:center;gap:16px}
        .mr-preview{width:96px;height:96px;border-radius:50%;border:4px solid #333}
        .mr-row{display:grid;grid-template-columns:140px 1fr 120px;gap:8px;align-items:center}
        .mr-value{color:#9df}
        .mr-flow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0}
        .mr-dot{width:10px;height:10px;border-radius:50%;border:3px solid #6cf;display:inline-block}
        .mr-dot.active{background:#6cf}
        .mr-fx{position:fixed;inset:0;pointer-events:none;overflow:hidden}
        .mr-piece{position:absolute;top:-10px;width:8px;height:14px;opacity:0.9}
        @keyframes mrFall{0%{transform:translateY(-10px) rotate(0deg)}100%{transform:translateY(120vh) rotate(720deg)}}
        @media(max-width:480px){h2{font-size:18px}.mr-right{gap:4px}}
        /* New UX styles */
        .ux-grid{display:grid;grid-template-columns:1fr 2fr;gap:16px}
        .ux-left{display:grid;gap:12px;align-content:start}
        .ux-right{display:grid;gap:12px}
        .ux-preview{width:140px;height:140px;border-radius:50%;border:6px solid #333;box-shadow:0 0 0 3px #0b0f15 inset}
        .ux-section{display:grid;gap:8px}
        .ux-label{color:#9df;font-weight:700}
        .ux-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .ux-swatches{display:flex;gap:6px;flex-wrap:wrap}
        .ux-swatch{width:22px;height:22px;border-radius:50%;border:3px solid #333;cursor:pointer}
        .ux-header{display:flex;justify-content:space-between;align-items:center}
        .ux-points strong.ok{color:#9df}
        .ux-points strong.warn{color:#fc6}
        .ux-sliders{display:grid;gap:10px}
        .ux-slider-row{display:grid;gap:6px}
        .ux-slider-head{display:flex;justify-content:space-between;align-items:center}
        .ux-slider-label{color:#6cf}
        .ux-slider-value{color:#9df;font-weight:700}
        .ux-range{appearance:none;width:100%;height:10px;background:#191b20;border:3px solid #333;border-radius:8px}
        .ux-range::-webkit-slider-thumb{appearance:none;width:18px;height:18px;border-radius:50%;background:#6cf;border:3px solid #036;box-shadow:0 0 0 2px #0b0f15}
        .ux-slider-foot{display:flex;justify-content:space-between;align-items:center}
        .ux-desc{color:#9aa4b2;font-size:12px;max-width:60%}
        .ux-bumpers{display:flex;gap:6px}
        .ux-actions{display:flex;gap:8px;align-items:center}
        .ux-saving{color:#fc6}
        @media(max-width: 900px){.ux-grid{grid-template-columns:1fr}.ux-preview{width:96px;height:96px;border-width:4px}}
      `}</style>
      <header className="mr-header">
        {/* Caption: Title — Current Stage */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
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
        </div>
        <style>{`
          @keyframes neonShift { to { background-position: 200% center } }
          @keyframes neonGlow { 0% { text-shadow: 0 0 8px #069 } 100% { text-shadow: 0 0 18px #0bf } }
        `}</style>
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
          {me && (
            <>
              <Badge>Stage Pts: {myStagePoints}</Badge>
              <Badge>Total: {myTotal}</Badge>
            </>
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
                  style={{ border: ((state as any)?.enforceUniqueColors && hasColorConflict) ? '3px solid #f66' : '3px solid #333' }}
                />
                <span title="Your marble" style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: colorHex }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button onClick={join} disabled={!!(state as any)?.enforceUniqueColors && hasColorConflict}>Join</Button>
                {!inLobby && inRunning && <span style={{ color: '#9df' }}>You’ll join the next stage.</span>}
                {!inLobby && inCountdown && <span style={{ color: '#9df' }}>Spawn is still open—be quick!</span>}
                {!!(state as any)?.enforceUniqueColors && hasColorConflict && (
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
                        style={{ width: 48, height: 32, border: ((state as any)?.enforceUniqueColors && hasColorConflict) ? '3px solid #f66' : '3px solid #333', background: '#14161b' }}
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
                      <div style={{ marginTop: 8, color: (state as any)?.enforceUniqueColors ? '#f66' : '#fc6', fontWeight: 700 }}>
                        {colorDenied || ((state as any)?.enforceUniqueColors ? 'Color too similar — pick a distinct one.' : 'Color is similar — consider changing.')}
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
                      <Button onClick={() => room?.send('spawn')} disabled={me?.spawned || ((state as any)?.enforceUniqueColors && hasColorConflict)}>Spawn</Button>
                      {me?.spawned && <span style={{ color: '#9df' }}>Spawned ✓</span>}
                      {(!(me?.spawned) && (state as any)?.enforceUniqueColors && hasColorConflict) && <span style={{ color: '#f66' }}>Pick a distinct color to spawn</span>}
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
          {/* Race HUD removed per spec */}
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
    </div>
  );
}
