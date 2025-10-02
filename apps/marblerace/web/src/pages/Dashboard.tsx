import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Table, Badge, Countdown, QR } from 'marblerace-ui-kit';
import { connectRoom, getServerConfig } from '../lib/colyseus';

export default function Dashboard() {
  const [room, setRoom] = useState<any>(null);
  const [ver, setVer] = useState(0);
  const [publicBase, setPublicBase] = useState<string | null>(null);
  const [eventsObs, setEventsObs] = useState<string[]>([]);
  // Reward claim burst system (handles many simultaneous claims)
  const [claimBursts, setClaimBursts] = useState<Array<{ id: number; pts: number; name: string; color: string; left: number; top: number }>>([]);
  const burstIdRef = useRef(1);
  const lastStageRef = useRef<number>(-1);
  const lastStagePointsByPlayerRef = useRef<Record<string, number>>({});
  const nameRefs = useRef<Record<string, HTMLElement | null>>({});
  const standingsRef = useRef<HTMLDivElement | null>(null);
  const [rowHighlights, setRowHighlights] = useState<Array<{ id: number; left: number; top: number; width: number; height: number; color: string }>>([]);
  const s: any = room?.state as any;

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
  // Detect per-player stage points increases and spawn bursts
  useEffect(() => {
    if (!s) return;
    const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
    const prevStage = lastStageRef.current;
    // If stage changed, snapshot current points and reset baseline without animating
    if (idx !== prevStage) {
      const baseline: Record<string, number> = {};
      try {
        const players = s?.players;
        const each = (fn: (p: any) => void) => {
          if (players && typeof players.forEach === 'function') { players.forEach(fn); }
          else { Object.values(players || {}).forEach((p: any) => fn(p)); }
        };
        each((p: any) => { baseline[p?.id] = Number(p?.results?.[idx]?.points || 0); });
      } catch {}
      lastStagePointsByPlayerRef.current = baseline;
      lastStageRef.current = idx;
      return;
    }
    // Compare and emit bursts for increases
    const newly: Array<{ id: number; pts: number; name: string; color: string; left: number; top: number }> = [];
    try {
      const players = s?.players;
      const each = (fn: (p: any) => void) => {
        if (players && typeof players.forEach === 'function') { players.forEach(fn); }
        else { Object.values(players || {}).forEach((p: any) => fn(p)); }
      };
      each((p: any) => {
        if (!p) return;
        const pid = String(p?.id || '');
        const curr = Number(p?.results?.[idx]?.points || 0);
        const prev = Number(lastStagePointsByPlayerRef.current[pid] || 0);
        if (curr > prev) {
          const delta = curr - prev;
          const col = p?.config?.color || { r: 108, g: 207, b: 255 };
          const color = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
          const id = burstIdRef.current++;
          // Try to anchor to the player's name cell in Standings
          const el = nameRefs.current[pid] as HTMLElement | undefined | null;
          let left = 0, top = 0;
          if (el) {
            const r = el.getBoundingClientRect();
            left = Math.round(r.right + 16);
            top = Math.round(r.top + r.height / 2);
            // Also add a subtle row highlight spanning the standings table width
            try {
              const tableRect = standingsRef.current?.getBoundingClientRect();
              const hlLeft = Math.round((tableRect?.left ?? (r.left - 8)));
              const hlWidth = Math.round((tableRect?.width ?? (r.width + 16)));
              const hlTop = Math.round(r.top - 4);
              const hlHeight = Math.round(r.height + 8);
              const hlId = id * 1000 + 1;
              setRowHighlights((arr) => [...arr, { id: hlId, left: hlLeft, top: hlTop, width: hlWidth, height: hlHeight, color }]);
              setTimeout(() => {
                setRowHighlights((arr) => arr.filter((it) => it.id !== hlId));
              }, 1400);
            } catch {}
          } else {
            // Fallback: scatter in a non-intrusive band
            left = Math.round(window.innerWidth * (0.6 + ((id * 17) % 30) / 100));
            top = Math.round(window.innerHeight * (0.12 + ((id * 23) % 24) / 100));
          }
          newly.push({ id, pts: delta, name: String(p?.name || 'Player'), color, left, top });
        }
        lastStagePointsByPlayerRef.current[pid] = curr;
      });
    } catch {}
    if (newly.length) {
      setClaimBursts((arr) => [...arr, ...newly]);
      // Schedule auto-remove for each new burst
      newly.forEach((b) => {
        const ttl = 1600 + ((b.id % 4) * 120);
        setTimeout(() => {
          setClaimBursts((arr) => arr.filter((it) => it.id !== b.id));
        }, ttl);
      });
    }
  }, [s, ver]);

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

  // Award Ceremony: admin-triggered via state.ceremonyActive/Version with dwellMs
  const [ceremonyIdx, setCeremonyIdx] = useState<number>(-1);
  const [ceremonyRunning, setCeremonyRunning] = useState(false);
  const [lastCeremonyVersion, setLastCeremonyVersion] = useState<number>(-1);
  const [showPodium, setShowPodium] = useState(false);
  const ceremonyList = useMemo(() => standings.slice().reverse(), [standings]);

  useEffect(() => {
    if (!s) return;
    const active = !!s?.ceremonyActive;
    const ver = Number(s?.ceremonyVersion || 0);
    if (active && ceremonyList.length > 0 && ver !== lastCeremonyVersion) {
      setCeremonyRunning(true);
      setCeremonyIdx(0);
      setShowPodium(false);
      setLastCeremonyVersion(ver);
    }
    if (!active && ceremonyRunning) {
      // If admin stopped, end immediately and show podium
      setCeremonyRunning(false);
      setCeremonyIdx(-1);
      setShowPodium(true);
    }
  }, [s?.ceremonyActive, s?.ceremonyVersion, ceremonyList.length, lastCeremonyVersion, ceremonyRunning]);

  useEffect(() => {
    if (!ceremonyRunning) return;
    if (ceremonyIdx < 0) return;
    if (ceremonyIdx >= ceremonyList.length) { setCeremonyRunning(false); setShowPodium(true); return; }
    const isWinner = ceremonyIdx === ceremonyList.length - 1;
    const dwellBase = Math.max(300, Math.min(60000, Number(s?.ceremonyDwellMs || 10000)));
    const dwell = isWinner ? Math.round(dwellBase * 2.2) : dwellBase; // winner lingers longer
    const t = setTimeout(() => {
      setCeremonyIdx((i) => (i + 1));
    }, dwell);
    return () => clearTimeout(t);
  }, [ceremonyRunning, ceremonyIdx, ceremonyList.length, s?.ceremonyDwellMs]);

  const roomId = s?.roomId;
  const link = `${publicBase || window.location.origin}/game`;
  const displayEvents = eventsObs;
  const compactEvents = useMemo(() => displayEvents.slice(0, 4), [displayEvents]);
  const [goFlash, setGoFlash] = useState(false);
  const [lastCdMs, setLastCdMs] = useState<number>(0);
  // Resizable split between Standings (left) and Preview (right)
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const n = Number(localStorage.getItem('mr_dash_left_width') || 640);
    return Number.isFinite(n) && n > 300 ? n : 640;
  });
  const [resizing, setResizing] = useState(false);
  const [mainHeight, setMainHeight] = useState<number>(480);
  useEffect(() => { localStorage.setItem('mr_dash_left_width', String(leftWidth)); }, [leftWidth]);
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const row = splitRef.current; if (!row) return;
      const rect = row.getBoundingClientRect();
      const minLeft = 360; // min width for standings
      const minRight = 320; // min width for preview
      const total = rect.width;
      let next = e.clientX - rect.left; // width for left column
      if (next < minLeft) next = minLeft;
      if (next > total - minRight) next = total - minRight;
      setLeftWidth(Math.round(next));
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);
  // Compute available height for the bottom split to fill viewport without page scroll
  useEffect(() => {
    const compute = () => {
      const row = splitRef.current;
      const top = row ? row.getBoundingClientRect().top : 0;
      const h = Math.max(240, Math.floor(window.innerHeight - top - 16));
      setMainHeight(h);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  // Local window/application capture preview (Phase 1)
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (v && captureStream) {
      try {
        v.srcObject = captureStream;
        v.muted = true;
        // best-effort to auto-start
        Promise.resolve(v.play()).catch(() => {});
      } catch {}
    }
    if (v && !captureStream) {
      try { (v as any).srcObject = null; } catch {}
    }
  }, [captureStream]);
  const startCapture = async () => {
    try {
      // Browser will prompt to select a screen/window/tab. We do not request audio.
      const stream = await (navigator.mediaDevices as any).getDisplayMedia?.({ video: true, audio: false });
      if (stream) {
        setCaptureStream(stream);
        // Clean up when the user stops sharing from the browser UI
        try {
          const [track] = stream.getVideoTracks();
          if (track) track.addEventListener('ended', () => {
            setCaptureStream(null);
            const v2 = videoRef.current; if (v2) v2.srcObject = null;
          });
        } catch {}
      }
    } catch (e) {
      console.warn('capture cancelled', e);
    }
  };
  const stopCapture = () => {
    try { captureStream?.getTracks().forEach((t) => t.stop()); } catch {}
    setCaptureStream(null);
    const v = videoRef.current; if (v) v.srcObject = null;
  };
  useEffect(() => {
    const ms = Number(s?.countdownMsRemaining || 0);
    // detect transition from counting (>0) to go (<=0)
    if (lastCdMs > 0 && ms <= 0) {
      setGoFlash(true);
      setTimeout(() => setGoFlash(false), 900);
    }
    setLastCdMs(ms);
  }, [s?.countdownMsRemaining]);

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

  // Note: reward pool/claimedCount still used for on-screen badges, but
  // animations now react to per-player deltas for better concurrency.

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
      {/* Reward Claim Bursts (supports many simultaneous claims) */}
      {claimBursts.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: 'none' }}>
          {/* row highlights */}
          {rowHighlights.map((h) => (
            <div key={`hl-${h.id}`} style={{
              position: 'fixed',
              left: h.left,
              top: h.top,
              width: h.width,
              height: h.height,
              background: `${h.color}22`,
              boxShadow: `inset 0 0 0 2px ${h.color}55, 0 0 14px ${h.color}33` ,
              borderRadius: 6,
              animation: 'rowPulse 1s ease-in-out 1'
            }} />
          ))}
          {claimBursts.map((b) => (
            <div key={b.id} style={{ position: 'fixed', left: b.left, top: b.top, transform: 'translate(-50%,-50%)' }}>
              {/* badge chip */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#0e131a', border: `4px solid ${b.color}`,
                boxShadow: `0 0 0 2px #000 inset, 0 0 20px ${b.color}55`,
                padding: '6px 10px', borderRadius: 6,
                animation: 'burstPop 260ms cubic-bezier(.2,1.4,.3,1) both, burstFloat 1.3s ease-out 260ms both'
              }}>
                <span style={{ width: 10, height: 10, background: b.color, borderRadius: '50%', boxShadow: `0 0 8px ${b.color}aa` }} />
                <span style={{ color: '#cde', fontSize: 13, fontWeight: 700, textShadow: '0 1px 0 #000' }}>{b.name}</span>
                <span style={{ color: b.color, fontWeight: 1000, fontSize: 18, textShadow: '0 1px 0 #000' }}>+{b.pts}</span>
              </div>
              {/* confetti fan */}
              <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
                {Array.from({ length: 24 }).map((_, i) => {
                  const a = (360 / 24) * i;
                  const dist = 40 + ((i * 13) % 20);
                  const hue = (i * 33) % 360;
                  return (
                    <span key={i} style={{
                      position: 'absolute',
                      width: 6, height: 3,
                      background: `hsl(${hue} 90% 60%)`,
                      borderRadius: 2,
                      transform: `translate(-50%,-50%) rotate(${a}deg) translateX(${dist}px)`,
                      animation: `confFan 900ms ease-out ${i*0.008}s both`
                    }} />
                  );
                })}
              </div>
            </div>
          ))}
          <style>{`
            @keyframes burstPop { 0% { transform: scale(.7) } 80% { transform: scale(1.06) } 100% { transform: scale(1) } }
            @keyframes burstFloat { to { transform: translate(-50%,-85%) } }
            @keyframes confFan { 0% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--a,0)) translateX(0) } 10% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--a,0)) translateX(80px) } }
            @keyframes rowPulse { 0%,100% { opacity: .0 } 20% { opacity: .9 } 60% { opacity: .5 } }
          `}</style>
        </div>
      )}
      {/* Big Fancy Countdown Overlay */}
      {(() => {
        const ms = Number(s?.countdownMsRemaining || 0);
        if (!(ms > 0)) return null;
        const sec = Math.max(1, Math.ceil(ms / 1000));
        return (
          <div key={`cd-${sec}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* rotating neon rings */}
            <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', filter: 'blur(1px)', opacity: 0.9, animation: 'spinA 10s linear infinite', background: `conic-gradient(from 0deg, #6cf 0%, transparent 30%, #9cf 50%, transparent 60%, #6cf 100%)` }} />
            <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', filter: 'blur(1px)', opacity: 0.8, animation: 'spinB 7s linear infinite reverse', background: `conic-gradient(from 45deg, #fc6 0%, transparent 40%, #f96 65%, transparent 80%, #fc6 100%)` }} />
            {/* sweeping arcs */}
            <div style={{ position: 'absolute', width: 640, height: 640, borderRadius: '50%', boxShadow: '0 0 120px #09f, inset 0 0 120px #036', opacity: 0.2 }} />
            {/* streaks */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5 }}>
              {Array.from({ length: 36 }).map((_, i) => (
                <span key={i} style={{
                  position: 'absolute',
                  left: ((i * 277) % 100) + '%',
                  top: '-10%',
                  width: 2,
                  height: 120,
                  background: i % 3 === 0 ? '#6cf' : i % 3 === 1 ? '#9cf' : '#fc6',
                  filter: 'blur(0.5px)',
                  animation: `fallFast ${(3 + (i % 5) * 0.2)}s cubic-bezier(.2,.7,.3,1) ${(i%10)*0.08}s infinite`
                }} />
              ))}
            </div>
            {/* big number */}
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <div style={{ color: '#9df', fontWeight: 700, letterSpacing: 2, marginBottom: 8, textShadow: '0 0 10px #036' }}>RACE STARTS IN</div>
              <div style={{
                fontSize: 220,
                fontWeight: 900,
                color: '#fff',
                textShadow: '0 0 30px #08f, 0 0 60px #08f',
                lineHeight: 1,
                animation: 'countPop 700ms cubic-bezier(.2,1.2,.2,1)'
              }}>{sec}</div>
              <div style={{ marginTop: 10, fontSize: 16, color: '#cde' }}>Get Ready!</div>
            </div>
            <style>{`
              @keyframes spinA { to { transform: rotate(360deg) } }
              @keyframes spinB { to { transform: rotate(-360deg) } }
              @keyframes fallFast { 0% { transform: translateY(-10%) } 100% { transform: translateY(120vh) } }
              @keyframes countPop {
                0% { transform: scale(.6); opacity: 0 }
                50% { transform: scale(1.05); opacity: 1 }
                100% { transform: scale(1.0); opacity: 1 }
              }
            `}</style>
          </div>
        );
      })()}

      {/* GO! flash right after countdown completes */}
      {goFlash && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {/* radial burst */}
          <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', background: '#6cf', filter: 'blur(10px)', opacity: 0.8, animation: 'burst 900ms ease-out forwards' }} />
          {/* confetti burst */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from({ length: 120 }).map((_, i) => {
              const ang = (i / 120) * Math.PI * 2;
              const dx = Math.cos(ang) * 640;
              const dy = Math.sin(ang) * 420;
              return (
                <span key={i} style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 8, height: 12,
                  background: i % 3 === 0 ? '#ffd700' : i % 3 === 1 ? '#6cf' : '#fc6',
                  transform: `translate(-50%, -50%) rotate(${(i*37)%360}deg)`,
                  animation: `confBurst 900ms ease-out ${(i%8)*0.01}s forwards`,
                  opacity: 0.95,
                  ['--dx' as any]: `${dx}px`,
                  ['--dy' as any]: `${dy}px`,
                } as any} />
              );
            })}
          </div>
          <div style={{ fontSize: 160, fontWeight: 1000, color: '#fff', textShadow: '0 0 24px #0bf, 0 0 48px #09f', letterSpacing: 4, transform: 'scale(0.7)', animation: 'goPop 900ms cubic-bezier(.2,1.2,.2,1) forwards' }}>
            GO!
          </div>
          <style>{`
            @keyframes goPop {
              0% { transform: scale(.3); opacity: 0 }
              40% { transform: scale(1.2); opacity: 1 }
              100% { transform: scale(1.0); opacity: 0.95 }
            }
            @keyframes burst {
              0% { width: 40px; height: 40px; opacity: 0.9 }
              100% { width: 1200px; height: 1200px; opacity: 0 }
            }
            @keyframes confBurst {
              0% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1 }
              100% { transform: translate(calc(-50% + (var(--dx, 0px))), calc(-50% + (var(--dy, 0px)))) scale(.9) rotate(360deg); opacity: 0 }
            }
          `}</style>
        </div>
      )}
      {/* Global Award Ceremony Overlay (admin-triggered) */}
      {(ceremonyRunning && ceremonyIdx >= 0 && ceremonyIdx < ceremonyList.length) && (() => {
        const p: any = ceremonyList[ceremonyIdx];
        const finalRank = standings.findIndex((x: any) => x.id === p.id) + 1; // 1-based rank
        const isTop3 = finalRank <= 3;
        const isWinner = finalRank === 1;
        const medal = isWinner ? '🏆' : finalRank === 2 ? '🥈' : finalRank === 3 ? '🥉' : '🎖️';
        const accent = p.colorHex || '#6cf';
        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2000,
              overflow: 'hidden'
            }}
          >
            {/* Ambient rays */}
            <div style={{ position: 'absolute', inset: -200, background: `conic-gradient(from 0deg, transparent, ${accent}22, transparent 20%)`, filter: 'blur(16px)', opacity: 0.6, animation: 'spinSlow 18s linear infinite' }} />
            {/* Confetti for top 3 and winner */}
            {isTop3 && (
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {Array.from({ length: isWinner ? 160 : 90 }).map((_, i) => (
                  <span key={i} style={{
                    position: 'absolute',
                    left: (i * 37) % 100 + '%',
                    top: '-5%',
                    width: 8, height: 12,
                    background: i % 3 === 0 ? '#ffd700' : i % 3 === 1 ? '#c0c0c0' : '#cd7f32',
                    transform: `rotate(${(i*47)%360}deg)`,
                    animation: `fall ${(6 + (i % 5))}s cubic-bezier(.2,.7,.3,1) ${(i%10)*0.1}s infinite`,
                    opacity: 0.9
                  }} />
                ))}
              </div>
            )}
            <div style={{ position: 'relative', textAlign: 'center', padding: 24 }}>
              <div style={{ color: '#9df', marginBottom: 8, fontWeight: 700, letterSpacing: 2 }}>AWARD CEREMONY</div>
              <div style={{ fontSize: 14, color: '#8aa', marginBottom: 16 }}>Celebrating final standings (low → high)</div>
              <div style={{
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: '#0f1115', border: `6px solid ${accent}`, boxShadow: `0 0 0 3px #000 inset, 0 0 28px ${accent}99`,
                padding: '18px 24px', minWidth: 420, transform: 'translateY(0)', animation: 'popIn 480ms ease-out'
              }}>
                <div style={{ fontSize: 28, marginBottom: 8, color: '#9df', textShadow: '0 2px 0 #000' }}>Rank #{finalRank}</div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10,
                  filter: isTop3 ? 'drop-shadow(0 0 12px rgba(255,215,0,0.6))' : undefined
                }}>
                  <span style={{ fontSize: isWinner ? 48 : 40 }}>{medal}</span>
                  <span title="player color" style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: p.colorHex }} />
                  <span style={{ fontSize: isWinner ? 42 : 32, fontWeight: 900, color: accent, textShadow: '0 2px 0 #000' }}>{p.name}</span>
                </div>
                <div style={{ fontSize: 16, color: '#cde' }}>Total Points</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', textShadow: '0 2px 0 #000', animation: 'glowPulse 1.8s ease-in-out infinite' }}>{p.total}</div>
                {isWinner && (
                  <div style={{ marginTop: 10, fontSize: 20, color: '#ffd700', textShadow: '0 0 10px #b58a00' }}>Champion! 👑</div>
                )}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => { setCeremonyRunning(false); setCeremonyIdx(-1); setShowPodium(true); }} style={{ padding: '8px 12px', background: '#1a1f28', border: '3px solid #333', color: '#cde' }}>Skip</button>
                {ceremonyIdx >= ceremonyList.length - 1 && (
                  <button onClick={() => { setCeremonyIdx(0); setCeremonyRunning(true); }} style={{ padding: '8px 12px', background: '#14212b', border: '3px solid #036', color: '#9df' }}>Replay</button>
                )}
              </div>
            </div>
            {/* Ceremony keyframes */}
            <style>{`
              @keyframes popIn { 0% { transform: translateY(30px) scale(.95); opacity: 0 } 100% { transform: translateY(0) scale(1); opacity: 1 } }
              @keyframes glowPulse { 0%,100% { text-shadow: 0 0 10px ${accent}55 } 50% { text-shadow: 0 0 18px ${accent}aa } }
              @keyframes spinSlow { to { transform: rotate(360deg) } }
              @keyframes fall { 0% { transform: translateY(-6%) rotate(0deg); opacity: .9 } 100% { transform: translateY(110vh) rotate(360deg); opacity: .9 } }
            `}</style>
          </div>
        );
      })()}

      {/* Podium summary after ceremony */}
      {showPodium && (() => {
        const podium = standings.slice(0, 3);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#0f1115', border: '6px solid #6cf', boxShadow: '0 0 0 3px #000 inset, 0 12px 40px rgba(0,0,0,0.65)', padding: 18, minWidth: 520, textAlign: 'center' }}>
              <div style={{ color: '#9df', letterSpacing: 2, marginBottom: 8, fontWeight: 700 }}>FINAL PODIUM</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'center', marginTop: 8 }}>
                {podium.map((p, i) => {
                  const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉';
                  const height = i === 0 ? 140 : i === 1 ? 110 : 95;
                  const accent = p.colorHex || '#6cf';
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: i===0 ? 40 : 32, marginBottom: 6 }}>{medal}</div>
                      <div style={{ fontWeight: 900, fontSize: i===0 ? 28 : 22, color: accent, textShadow: '0 2px 0 #000' }}>{p.name}</div>
                      <div style={{ fontSize: 14, color: '#cde', marginTop: 2 }}>Total: {p.total}</div>
                      <div style={{ width: 120, height: height, background: '#16212a', border: `4px solid ${accent}`, boxShadow: `0 0 0 2px #000 inset, 0 6px 18px ${accent}55`, marginTop: 8 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setShowPodium(false)} style={{ padding: '8px 12px', background: '#1a1f28', border: '3px solid #333', color: '#cde' }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
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
      {/* Caption: Title — Current Stage */}
      {(() => {
        const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
        const stageName = idx >= 0 ? (s?.stages?.[idx]?.name || s?.stages?.[idx]?.id) : '-';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              fontWeight: 1000,
              fontSize: 32,
              background: 'linear-gradient(90deg,#9cf,#fff,#9cf)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              textShadow: '0 0 12px #069',
              backgroundSize: '200% auto',
              animation: 'neonShift 6s linear infinite, neonGlow 2.4s ease-in-out infinite alternate',
              letterSpacing: 1.2,
            }}>{String(s?.title || 'Marble Race')}</span>
            <span style={{ color: '#555' }}>—</span>
            <span style={{
              border: '4px solid #fc6',
              padding: '3px 10px',
              color: '#fc6',
              fontWeight: 900,
              background: 'rgba(40,30,0,0.35)',
              boxShadow: '0 0 12px #630',
            }}>{stageName}</span>
            <style>{`
              @keyframes neonShift { to { background-position: 200% center } }
              @keyframes neonGlow { 0% { text-shadow: 0 0 8px #069 } 100% { text-shadow: 0 0 18px #0bf } }
            `}</style>
          </div>
        );
      })()}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Badge>Global: {s?.globalPhase}</Badge>
        <Badge>Stage: {s?.stagePhase}</Badge>
        <Badge>Stage {typeof s?.stageIndex === 'number' ? s.stageIndex + 1 : '-'} / {s?.stages?.length || 0}</Badge>
        <Countdown msRemaining={s?.countdownMsRemaining} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Compact events to the left of QR, fixed height to avoid layout shifts */}
          <div style={{
            border: '3px solid #333', background: '#0b0f15', width: 420, height: 128, padding: 6,
            color: '#9aa', fontSize: 12, lineHeight: 1.2, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center'
          }}>
            {compactEvents.length === 0 ? (
              <div style={{ opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>No recent events</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 14 }}>
                {compactEvents.map((line, i) => (
                  <li key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</li>
                ))}
              </ul>
            )}
          </div>
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
      <div ref={splitRef} style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'stretch', height: mainHeight, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 auto', width: leftWidth, minWidth: 360, height: '100%', overflow: 'auto' }}>
          <Panel title="Standings">
            <div ref={standingsRef}>
              <Table
                headers={["#", "Player", ...Array.from({ length: s?.stages?.length || 0 }).map((_, i) => `S${i+1}`), "Total"]}
                rows={standings.map((p: any, i: number) => [
                  i+1,
                  <span
                    key={`${p.id||p.name}-name`}
                    ref={(el) => { if (el) nameRefs.current[String(p.id||p.name)] = el; }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span title="player color" style={{ width: 14, height: 14, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: p.colorHex }} />
                    <span>{p.name}</span>
                  </span>,
                  ...(p.perStage || []),
                  p.total
                ])}
              />
            </div>
          </Panel>
        </div>
        {/* Resizer */}
        <div
          onMouseDown={() => setResizing(true)}
          style={{ width: 8, cursor: 'col-resize', background: '#222', border: '3px solid #333', borderTop: 0, borderBottom: 0 }}
          title="Drag to resize"
          role="separator"
          aria-orientation="vertical"
        />
        <div style={{ flex: 1, minWidth: 320, height: '100%', overflow: 'hidden' }}>
          {captureStream ? (
            <div
              style={{
                position: 'relative',
                background: 'black',
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              <button onClick={stopCapture} aria-label="Stop" title="Stop" style={{
                position: 'absolute', top: 6, right: 6, background: '#200', color: '#f66', border: '3px solid #f66', cursor: 'pointer', fontWeight: 900
              }}>×</button>
            </div>
          ) : (
            <Panel title="Live Preview">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ color: '#9aa', fontSize: 12 }}>Capture your Algodoo window locally</div>
                <div>
                  <button onClick={startCapture} style={{ background: '#122', color: '#9df', border: '3px solid #6cf', padding: '4px 8px', cursor: 'pointer', fontWeight: 700 }}>Share Window</button>
                </div>
              </div>
              <div
                style={{
                  position: 'relative',
                  background: '#0b0f15',
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#567' }}>
                  Click “Share Window” to preview Algodoo locally
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
