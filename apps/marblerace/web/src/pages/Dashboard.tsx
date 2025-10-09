/* eslint-env browser */
import { Panel, QR } from 'marblerace-ui-kit';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import ClaimBurstsOverlay from '../components/dashboard/ClaimBurstsOverlay';
import HeaderBar from '../components/dashboard/HeaderBar';
import RewardsCompact from '../components/dashboard/RewardsCompact';
import StandingsTable from '../components/dashboard/StandingsTable';
import StatusRow from '../components/dashboard/StatusRow';
import TickerLatest from '../components/dashboard/TickerLatest';
import { useNoPageScroll } from '../hooks/useNoPageScroll';
import { useRewardsPool } from '../hooks/useRewards';
import { useRoom } from '../hooks/useRoom';
import { useStandings } from '../hooks/useStandings';
import { getServerConfig } from '../lib/colyseus';
import { rgbToHex } from '../utils/color';
import './Dashboard.css';

export default function Dashboard() {
  const [room, setRoom] = useState<any>(null);
  const [ver, setVer] = useState(0);
  const [publicBase, setPublicBase] = useState<string | null>(null);
  const [eventsObs, setEventsObs] = useState<string[]>([]);
  // Reward claim burst system (handles many simultaneous claims)
  const [claimBursts, setClaimBursts] = useState<{ id: number; pts: number; name: string; color: string; left: number; top: number }[]>([]);
  const burstIdRef = useRef(1);
  const lastStageRef = useRef<number>(-1);
  const lastStagePointsByPlayerRef = useRef<Record<string, number>>({});
  const nameRefs = useRef<Record<string, HTMLElement | null>>({});
  const standingsRef = useRef<HTMLDivElement | null>(null);
  const [rowHighlights, setRowHighlights] = useState<{ id: number; left: number; top: number; width: number; height: number; color: string }[]>([]);
  const [cheerFx, setCheerFx] = useState<{ id: number; icon: string; text: string; color: string; left: number; top: number; playerName: string }[]>([]);
  const seenCheerIdsRef = useRef<Set<number>>(new Set());
  const s: any = room?.state;

  // Prevent page scroll; keep dashboard within one viewport
  useNoPageScroll();

  const roomState = useRoom<any>();
  useEffect(() => {
    const r = roomState.room;
    if (!r) return;
    setRoom(r);
    // ticker now carries formatted strings; no special number handling required
    const applyFromState = () => {
      const sAny: any = r.state;
      const t: any = sAny?.ticker;
      const acc: string[] = [];
      try {
        const n = Number((t?.length) || 0);
        for (let i = 0; i < n; i++) {
          const it: any = t[i];
          acc.push(String(it));
        }
      } catch { void 0; }
      setEventsObs(acc);
      setVer((v) => v + 1);
    };
    applyFromState();
    r.onStateChange((_newState: any) => {
      applyFromState();
      // Fallback: scan cheers for any not yet animated
      try {
        const cheers: any = (r.state)?.cheers;
        const set = seenCheerIdsRef.current;
        const n = Number((cheers?.length) || 0);
        for (let i = Math.max(0, n - 5); i < n; i++) {
          const it: any = cheers[i];
          const id = Number(it?.id || 0);
          if (id && !set.has(id)) { set.add(id); spawnCheer(it); }
        }
        if (set.size > 200) { seenCheerIdsRef.current = new Set(Array.from(set).slice(-100)); }
      } catch { void 0; }
    });
    try {
      const t: any = (r.state)?.ticker;
      if (t) {
        t.onAdd = (_it: any, _index: number) => applyFromState();
        t.onRemove = (_it: any, _index: number) => applyFromState();
        t.onChange = (_it: any, _index: number) => applyFromState();
      }
      const cheers: any = (r.state)?.cheers;
      if (cheers) {
        cheers.onAdd = (it: any, _idx: number) => spawnCheer(it);
      }
    } catch { void 0; }
  }, [roomState.room]);
  useEffect(() => {
    getServerConfig().then((cfg) => { if (cfg?.publicHttpUrl) setPublicBase(cfg.publicHttpUrl); });
  }, []);
  // Helpers

  function spawnCheer(it: any) {
    try {
      const rect = standingsRef.current?.getBoundingClientRect();
      const left = Math.round((rect?.left ?? 80) + (rect?.width ?? 600) * (0.45 + Math.random() * 0.1));
      const top = Math.round((rect?.bottom ?? (window.innerHeight - 80)) - 6);
      const col = it?.color ? rgbToHex(it.color) : '#6cf';
      const id = (it?.id|0) || Math.floor(Math.random()*1e9);
      const icon = String(it?.icon || '🎉');
      const text = String(it?.text || 'Cheers!');
      const playerName = String(it?.playerName || '');
      seenCheerIdsRef.current.add(id);
      setCheerFx((prev) => [...prev, { id, icon, text, color: col, left, top, playerName }]);
      setTimeout(() => setCheerFx((prev) => prev.filter((p) => p.id !== id)), 3600);
    } catch { void 0; }
  }
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
      } catch { void 0; }
      lastStagePointsByPlayerRef.current = baseline;
      lastStageRef.current = idx;
      return;
    }
    // Compare and emit bursts for increases
    const newly: { id: number; pts: number; name: string; color: string; left: number; top: number }[] = [];
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
            } catch { void 0; }
          } else {
            // Fallback: scatter in a non-intrusive band
            left = Math.round(window.innerWidth * (0.6 + ((id * 17) % 30) / 100));
            top = Math.round(window.innerHeight * (0.12 + ((id * 23) % 24) / 100));
          }
          newly.push({ id, pts: delta, name: String(p?.name || 'Player'), color, left, top });
        }
        lastStagePointsByPlayerRef.current[pid] = curr;
      });
    } catch { void 0; }
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

  const standings = useStandings(s, ver);

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

  const link = `${publicBase || window.location.origin}/game`;
  const displayEvents = eventsObs;
  const [goFlash, setGoFlash] = useState(false);
  const [lastCdMs, setLastCdMs] = useState<number>(0);
  const isPostStageOverlay = (s?.stagePhase === 'stage_finished') && (Number(s?.postStageMsRemaining || 0) > 0);
  // Resizable split between Standings (left) and Preview (right)
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const n = Number(localStorage.getItem('mr_dash_left_width') || 640);
    return Number.isFinite(n) && n > 300 ? n : 640;
  });
  const [resizing, setResizing] = useState(false);
  const [, setMainHeight] = useState<number>(480);
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
      } catch { void 0; }
    }
    if (v && !captureStream) {
      try { (v as any).srcObject = null; } catch { void 0; }
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
        } catch { void 0; }
      }
    } catch (e) {
      console.warn('capture cancelled', e);
    }
  };
  const stopCapture = () => {
    try { captureStream?.getTracks().forEach((t) => t.stop()); } catch { void 0; }
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
    if (!s) return [] as { id: string; name: string; placement: number; points: number; colorHex: string }[];
    const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
    const arr: any[] = [];
    const players = s?.players;
    try {
      if (players && typeof players.forEach === 'function') {
        players.forEach((p: any) => {
          const r = p?.results?.[idx];
          const points = Number(r?.points ?? 0);
          const placement = Number(r?.placement ?? 0);
          const colorHex = rgbToHex(p?.config?.color || { r: 255, g: 255, b: 255 }, '#fff');
          if (points > 0) arr.push({ id: p?.id, name: p?.name, placement, points, colorHex });
        });
      } else {
        Object.values(players || {}).forEach((p: any) => {
          const r = p?.results?.[idx];
          const points = Number(r?.points ?? 0);
          const placement = Number(r?.placement ?? 0);
          const colorHex = rgbToHex(p?.config?.color || { r: 255, g: 255, b: 255 }, '#fff');
          if (points > 0) arr.push({ id: p?.id, name: p?.name, placement, points, colorHex });
        });
      }
    } catch { void 0; }
    // Sort by points descending, break ties by better placement then name
    return arr
      .sort((a, b) => (b.points - a.points) || ((a.placement || 9999) - (b.placement || 9999)) || String(a.name||'').localeCompare(String(b.name||'')))
      .slice(0, 3);
  }, [s, ver]);

  // Compute current stage reward pool and remaining unclaimed rewards as badges
  const rewards = useRewardsPool(s, ver);

  // Note: reward pool/claimedCount still used for on-screen badges, but
  // animations now react to per-player deltas for better concurrency.


  return (
    <div className="dash-root">
      <ClaimBurstsOverlay bursts={claimBursts} highlights={rowHighlights} />
      {(() => {
        const ms = Number(s?.countdownMsRemaining || 0);
        if (!(ms > 0)) return null;
        const sec = Math.max(1, Math.ceil(ms / 1000));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', filter: 'blur(1px)', opacity: 0.9, animation: 'spinA 10s linear infinite', background: `conic-gradient(from 0deg, #6cf 0%, transparent 30%, #9cf 50%, transparent 60%, #6cf 100%)` }} />
            <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', filter: 'blur(1px)', opacity: 0.8, animation: 'spinB 7s linear infinite reverse', background: `conic-gradient(from 45deg, #fc6 0%, transparent 40%, #f96 65%, transparent 80%, #fc6 100%)` }} />
            <div style={{ position: 'absolute', width: 640, height: 640, borderRadius: '50%', boxShadow: '0 0 120px #09f, inset 0 0 120px #036', opacity: 0.2 }} />
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
            <div style={{ position: 'relative', textAlign: 'center', zIndex: 2 }}>
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
            <BoostedCheerLayer items={cheerFx} rMin={240} rMax={420} animation="boostPop" keyPrefix="boost" chipBg="#081019" />
            <style>{`
              @keyframes spinA { to { transform: rotate(360deg) } }
              @keyframes spinB { to { transform: rotate(-360deg) } }
              @keyframes fallFast { 0% { transform: translateY(-10%) } 100% { transform: translateY(120vh) } }
              @keyframes countPop { 0% { transform: scale(.6); opacity: 0 } 50% { transform: scale(1.05); opacity: 1 } 100% { transform: scale(1.0); opacity: 1 } }
            `}</style>
          </div>
        );
      })()}

      {goFlash && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', background: '#6cf', filter: 'blur(10px)', opacity: 0.8, animation: 'burst 900ms ease-out forwards' }} />
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
            <div style={{ position: 'absolute', inset: -200, background: `conic-gradient(from 0deg, transparent, ${accent}22, transparent 20%)`, filter: 'blur(16px)', opacity: 0.6, animation: 'spinSlow 18s linear infinite' }} />
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
            <div style={{ position: 'relative', textAlign: 'center', padding: 24, zIndex: 2 }}>
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
            <BoostedCheerLayer items={cheerFx} rMin={280} rMax={520} animation="cerCheer" keyPrefix="cer-cheer" chipBg="#0b0f15" saturate={1.6} />
            <style>{`
              @keyframes popIn { 0% { transform: translateY(30px) scale(.95); opacity: 0 } 100% { transform: translateY(0) scale(1); opacity: 1 } }
              @keyframes glowPulse { 0%,100% { text-shadow: 0 0 10px ${accent}55 } 50% { text-shadow: 0 0 18px ${accent}aa } }
              @keyframes spinSlow { to { transform: rotate(360deg) } }
              @keyframes fall { 0% { transform: translateY(-6%) rotate(0deg); opacity: .9 } 100% { transform: translateY(110vh) rotate(360deg); opacity: .9 } }
            `}</style>
          </div>
        );
      })()}

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
            <BoostedCheerLayer items={cheerFx} rMin={200} rMax={360} animation="podCheer" keyPrefix="pod-cheer" chipBg="#0b0f15" saturate={1.6} />
          </div>
        );
      })()}
      {s?.stagePhase === 'stage_finished' && (s?.postStageMsRemaining || 0) > 0 && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
            overflow: 'hidden'
          }}
        >
          <div style={{ position: 'relative', textAlign: 'center', padding: 16, border: '4px solid #6cf', background: '#0f1115', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 2 }}>
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
          <BoostedCheerLayer items={cheerFx} rMin={220} rMax={420} animation="postCheer" keyPrefix="post-cheer" chipBg="#0b0f15" />
        </div>
      )}
      {(() => {
        const idx = typeof s?.stageIndex === 'number' ? s.stageIndex : -1;
        const stageName = idx >= 0 ? (s?.stages?.[idx]?.name || s?.stages?.[idx]?.id) : '-';
        const playlistId = String((s)?.spotifyPlaylistId || '').trim();
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 12, alignItems: 'stretch', height: 'calc(100vh - 32px)' }}>
            <div style={{ position: 'relative', minHeight: 0, minWidth: 0, background: '#000', border: '4px solid #222', overflow: 'hidden' }}>
              {captureStream ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ height: '100%', width: 'auto', maxWidth: '100%', aspectRatio: '16 / 10', background: 'black', position: 'relative' }}>
                    <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    <button onClick={stopCapture} aria-label="Stop" title="Stop" style={{ position: 'absolute', top: 8, right: 8, background: '#200', color: '#f66', border: '3px solid #f66', cursor: 'pointer', fontWeight: 900, zIndex: 5 }}>×</button>
                  </div>
                </div>
              ) : (
                <div style={{ position: 'absolute', inset: 0, padding: 12 }}>
                  <Panel title="Live Preview" style={{ height: '100%' } as any}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ color: '#9aa', fontSize: 12 }}>Capture your Algodoo window locally</div>
                      <div>
                        <button onClick={startCapture} style={{ background: '#122', color: '#9df', border: '3px solid #6cf', padding: '4px 8px', cursor: 'pointer', fontWeight: 700 }}>Share Window</button>
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: '100%', display: 'grid', placeItems: 'center', background: '#0b0f15' }}>
                      <div style={{ width: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: '16 / 10', display: 'grid', placeItems: 'center', color: '#567', padding: 12, textAlign: 'center' }}>
                        {(s?.stages?.length || 0) === 0 ? (
                          <div>
                            <div style={{ fontSize: 18, color: '#9df', marginBottom: 6 }}>Waiting for race…</div>
                            <div style={{ fontSize: 14, color: '#9aa' }}>Admin has not created a race yet.</div>
                          </div>
                        ) : (
                          <div>Click “Share Window” to preview Algodoo locally</div>
                        )}
                      </div>
                    </div>
                  </Panel>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateRows: 'auto auto auto 1fr auto auto', gap: 12, minHeight: 0, minWidth: 0 }}>
              <HeaderBar title={String(s?.title || 'Marble Race')} stageName={stageName} />
              <StatusRow s={s} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <TickerLatest line={displayEvents[0] || null} players={buildPlayerColorMap(s)} width={300} height={96} />
                <div style={{ height: 96, display: 'flex', alignItems: 'center' }}>
                  <QR url={link} size={80} />
                </div>
              </div>
              {null}
              <div style={{ display: 'grid', gridTemplateRows: '1fr 84px', minHeight: 0, gap: 8, minWidth: 0 }}>
                <StandingsTable standings={standings as any} nameRefs={nameRefs as any} tableRef={standingsRef as any} />
                <RewardsCompact pool={rewards.pool} remaining={rewards.remaining} />
              </div>
              {playlistId && (
                <div>
                  <iframe
                    title="Spotify Playlist"
                    style={{ borderRadius: 12, border: '0px solid transparent' }}
                    src={`https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`}
                    width={420}
                    height={96}
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {null}
      {!(Number(s?.countdownMsRemaining || 0) > 0) && !ceremonyRunning && !showPodium && !isPostStageOverlay && (
      <div className="mr-fx" style={{ pointerEvents: 'none' }}>
        {cheerFx.map((c) => (
          <div key={c.id}
            style={{
              position: 'fixed', left: c.left, top: c.top,
              transform: 'translate(-50%, 0)',
              background: '#0f1115', border: `3px solid ${c.color}`, color: '#cde',
              padding: '6px 10px', borderRadius: 12, boxShadow: `0 8px 24px ${c.color}44, 0 0 0 2px #000 inset`,
              animation: 'mrCheerFly 3.5s cubic-bezier(0.35,0.00,0.80,1.00) forwards'
            }}
          >
            <span style={{ color: c.color, fontWeight: 1000, marginRight: 10 }}>{c.playerName || 'Player'}</span>
            <span style={{ fontSize: 22, marginRight: 8 }}>{c.icon}</span>
            <span style={{ opacity: 0.9 }}>{c.text}</span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// RollingTicker extracted to components/dashboard/RollingTicker

// Stable position helper for boosted cheers (module scope ensures consistent component identity)
function seedFromId(id: any): number {
  const str = String(id);
  let h = 2166136261 >>> 0; // FNV-1a seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function posForCheer(id: any, rMin: number, rMax: number): { x: number; y: number } {
  const s = seedFromId(id);
  const angle = ((s % 360) * Math.PI) / 180;
  const range = Math.max(1, (rMax - rMin) | 0);
  const r = rMin + (Math.floor(s / 1024) % range);
  const cx = (typeof window !== 'undefined' ? window.innerWidth : 1920) / 2;
  const cy = (typeof window !== 'undefined' ? window.innerHeight : 1080) / 2;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

// Reusable boosted cheer layer used by overlays
function BoostedCheerLayer({ items, rMin, rMax, animation, keyPrefix, chipBg = '#0b0f15', saturate = 1.5 }: {
  items: { id: number; icon: string; text: string; color: string; playerName: string }[];
  rMin: number;
  rMax: number;
  animation: string;
  keyPrefix?: string;
  chipBg?: string;
  saturate?: number;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      {items.map((c) => {
        const { x, y } = posForCheer(c.id, rMin, rMax);
        return (
          <div
            key={`${keyPrefix || 'boost'}-${c.id}`}
            style={{
              position: 'fixed', left: x, top: y,
              transform: 'translate(-50%, -50%)',
              padding: '10px 14px', borderRadius: 14,
              background: chipBg, border: `4px solid ${c.color}`, color: '#fff',
              boxShadow: `0 0 28px ${c.color}AA, 0 0 0 2px #000 inset`, filter: `saturate(${Math.round(saturate*100)}%)`,
              animation: `${animation} 2000ms cubic-bezier(.2,.9,.2,1) both`,
            }}
          >
            <span style={{ color: c.color, fontWeight: 1000, marginRight: 12 }}>{c.playerName || 'Player'}</span>
            <span style={{ fontSize: 28, marginRight: 10 }}>{c.icon}</span>
            <span>{c.text}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes boostPop {
          0% { transform: translate(-50%, -50%) scale(.8); opacity: 0 }
          20% { opacity: 1 }
          70% { transform: translate(-50%, -50%) scale(1.08); opacity: 1 }
          100% { transform: translate(-50%, -60%) scale(1.1); opacity: 0 }
        }
        @keyframes cerCheer {
          0% { transform: translate(-50%, -50%) scale(.8); opacity: 0 }
          20% { opacity: 1 }
          70% { transform: translate(-50%, -50%) scale(1.1); opacity: 1 }
          100% { transform: translate(-50%, -65%) scale(1.12); opacity: 0 }
        }
        @keyframes podCheer {
          0% { transform: translate(-50%, -50%) scale(.82); opacity: 0 }
          20% { opacity: 1 }
          70% { transform: translate(-50%, -48%) scale(1.06); opacity: 1 }
          100% { transform: translate(-50%, -40%) scale(1.08); opacity: 0 }
        }
        @keyframes postCheer {
          0% { transform: translate(-50%, -50%) scale(.82); opacity: 0 }
          20% { opacity: 1 }
          70% { transform: translate(-50%, -50%) scale(1.06); opacity: 1 }
          100% { transform: translate(-50%, -60%) scale(1.08); opacity: 0 }
        }
      `}</style>
    </div>
  );
}

function buildPlayerColorMap(s: any): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const players = s?.players;
    const each = (fn: (p: any) => void) => {
      if (players && typeof players.forEach === 'function') { players.forEach(fn); }
      else { Object.values(players || {}).forEach((p: any) => fn(p)); }
    };
    each((p: any) => {
      if (!p) return;
      const col = p?.config?.color || { r: 108, g: 207, b: 255 };
      const hex = `#${(col.r|0).toString(16).padStart(2,'0')}${(col.g|0).toString(16).padStart(2,'0')}${(col.b|0).toString(16).padStart(2,'0')}`;
      out[String(p.name || p.id)] = hex;
    });
  } catch { void 0; }
  return out;
}

// TickerLatest extracted to components/dashboard/TickerLatest

// iconForKind in TickerLatest

// RewardsCompact extracted to components/dashboard/RewardsCompact

// highlightMessage moved into TickerLatest
