import React from 'react';

export interface CheerDef { icon: string; text: string }

export default function CheerPanel({ room, me, state, cheerEdit, setCheerEdit, cheers, setCheers, forceCheerUi: _forceCheerUi, lastCheerSentAtRef }:
  { room: any; me: any; state: any; cheerEdit: boolean; setCheerEdit: (v: boolean) => void; cheers: CheerDef[]; setCheers: React.Dispatch<React.SetStateAction<CheerDef[]>>; forceCheerUi: React.MutableRefObject<number>; lastCheerSentAtRef: React.MutableRefObject<number>; }) {
  const inRunning = state?.stagePhase === 'running';
  const inPrepCheer = (state?.globalPhase === 'intermission' && state?.stagePhase === 'prep');
  const inCountdown = state?.stagePhase === 'countdown';
  const inFinished = state?.stagePhase === 'stage_finished';
  const canCheer = !!me?.spawned && (inRunning || inPrepCheer || inCountdown || inFinished);
  if (!canCheer) return null;

  const [sentFx, setSentFx] = React.useState<{ id: number; icon: string }[]>([]);
  const [pickerIndex, setPickerIndex] = React.useState<number | null>(null);
  const commonEmojis = React.useMemo(() => Array.from('😀😃😄😁😆😅😂😊🙂🙃😉😍😘😜🤪🤩🤗😎😤😇😭😱😡🤯🤔🙌👏👍👎🙏💪🔥✨🎉🏁🚀💥⭐🌟💫💖💙💚💛💜🖤🤍🤎🍀🌈⚡🎶🎵🥳🫶🤝🏆🥇🥈🥉🎯'), []);
  const randomPool = React.useMemo(() => ([
    { icon: '😼', text: 'I can haz speed?' },
    { icon: '💨', text: 'Gotta go fast!' },
    { icon: '🧃', text: 'Juice up!' },
    { icon: '🧻', text: 'No brakes, no problem' },
    { icon: '🧠', text: 'Big brain line!' },
    { icon: '🕳️', text: 'Watch the pothole!' },
    { icon: '🧲', text: 'Magnetized to victory' },
    { icon: '🧟‍♂️', text: 'Undead momentum' },
    { icon: '🛸', text: 'Beamed to first!' },
    { icon: '🌀', text: 'Lag switch engaged' },
    { icon: '🧨', text: 'Boom—speed boost!' },
    { icon: '🦀', text: 'Crab rave approved' },
    { icon: '🦖', text: 'Dino speed!' },
    { icon: '📟', text: 'Dial-up engaged… jk' },
    { icon: '📼', text: 'Rewinding to win' },
    { icon: '🥷', text: 'Ninja overtake!' },
    { icon: '🛼', text: 'Rollin’ rollin’' },
    { icon: '🍌', text: 'Banana peel dodged!' },
    { icon: '👻', text: 'Spooky fast' },
    { icon: '🌮', text: 'Taco-fueled!' },
  ]), []);
  const randomCheer = React.useCallback(() => randomPool[Math.floor(Math.random() * randomPool.length)], [randomPool]);

  function defaultMsg(icon: string, name?: string): string {
    const who = name || 'Player';
    switch (icon) {
      case '👏': return `${who} applauds!`;
      case '🔥': return `${who} is fired up!`;
      case '🚀': return `${who} blasting ahead!`;
      case '💪': return `${who} says: stay strong!`;
      case '🎉': return `${who} celebrates!`;
      case '✨': return `${who} sprinkles some magic!`;
      case '🏁': return `${who} eyes the finish!`;
      case '🎶': return `${who} drops a beat!`;
      default: return `${who} cheers!`;
    }
  }

  const getMsgForIcon = (icon: string): string => {
    const found = (cheers || []).find((c) => c.icon === icon);
    return (found?.text || defaultMsg(icon, me?.name));
  };

  const send = (icon: string, ev?: React.MouseEvent<HTMLButtonElement>) => {
    lastCheerSentAtRef.current = Date.now();
    room?.send('cheer', { icon, text: getMsgForIcon(icon) });
    try { ev?.currentTarget?.blur(); } catch { void 0; }
    const fxId = Math.floor(Math.random()*1e9);
    setSentFx((prev) => [...prev, { id: fxId, icon }]);
    setTimeout(() => setSentFx((prev) => prev.filter((f) => f.id !== fxId)), 900);
  };

  return (
    <>
      <style>{`
        .cheer-panel{position:fixed;left:0;right:0;bottom:calc(48px + env(safe-area-inset-bottom, 0));transform:none;z-index:100;background:rgba(15,17,21,0.92);border:4px solid #6cf;border-radius:12px;padding:10px 12px;box-shadow:0 10px 32px rgba(0,0,0,.6), 0 0 0 2px #000 inset;backdrop-filter:saturate(120%) blur(6px)}
        .cheer-top{display:flex;justify-content:center;gap:8px;margin-bottom:8px}
        .cheer-btn{width:56px;height:56px;border:3px solid #333;background:#14161b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.4)}
        .cheer-btn-edit{border-color:#2a84ff;background:#0f1b2e;color:#cfe7ff;box-shadow:0 6px 18px rgba(0,40,120,.35), 0 0 0 2px #001628 inset}
        .cheer-btn-edit:hover{border-color:#6cf;box-shadow:0 0 0 2px #0a3b66 inset,0 8px 22px rgba(0,60,100,.55)}
        .cheer-btn-add{border-color:#28c76f;background:#0f2417;color:#dfffe9;box-shadow:0 6px 18px rgba(0,80,40,.35), 0 0 0 2px #001a0d inset}
        .cheer-btn-add:hover{border-color:#6f6;box-shadow:0 0 0 2px #0a662f inset,0 8px 22px rgba(0,100,60,.55)}
        .cheer-btn:hover{border-color:#6cf;box-shadow:0 0 0 2px #036 inset,0 8px 22px rgba(0,40,60,.6)}
        .cheer-grid{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
        .cheer-edit{position:fixed;left:50%;bottom:calc(112px + env(safe-area-inset-bottom, 0));transform:translateX(-50%);background:#0f1115;border:4px solid #6cf;padding:32px 12px 12px;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.5);z-index:101;max-width:min(680px, 96vw);max-height:min(60vh, calc(100vh - 240px));display:flex;flex-direction:column}
        .cheer-list{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
        .cheer-backdrop{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.25)}
        .cheer-row{display:grid;grid-template-columns:64px 1fr auto;gap:8px;align-items:center}
        .cheer-input{padding:8px;border:3px solid #333;background:#14161b;color:#fff}
        .emoji-picker{position:fixed;left:50%;bottom:calc(130px + env(safe-area-inset-bottom, 0));transform:translateX(-50%);z-index:102;background:#0f1115;border:4px solid #6cf;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.5);max-width:min(720px, 96vw);max-height:min(60vh, calc(100vh - 180px));overflow:auto;-webkit-overflow-scrolling:touch;padding:10px}
        .emoji-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow:auto;padding:6px;background:#0b0f15;border:3px solid #333;border-radius:8px}
        .emoji-btn{width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid #333;border-radius:10px;background:#14161b;color:#fff}
        .emoji-btn:hover{border-color:#6cf}
        @keyframes cheerPulse{0%{transform:translate(-50%,0) scale(.9);opacity:0}25%{transform:translate(-50%,-6px) scale(1);opacity:1}100%{transform:translate(-50%,-14px) scale(1.02);opacity:0}}
      `}</style>
      <div className="cheer-panel">
        <div className="cheer-top">
          <button className="cheer-btn cheer-btn-edit" onClick={() => setCheerEdit(!cheerEdit)} title="Customize cheer bar" aria-label="Customize cheers">📝</button>
          <button className="cheer-btn cheer-btn-add" onClick={() => setCheers((prev) => prev.length >= 16 ? prev : [randomCheer(), ...prev])} title="Add random cheer" aria-label="Add random cheer" disabled={cheers.length >= 16}>＋</button>
        </div>
        <div className="cheer-grid">
          {(cheers || []).map((c, idx) => (
            <button key={`${c.icon}-${idx}`} className="cheer-btn" onClick={(e) => send(c.icon, e)} title={c.text}>{c.icon}</button>
          ))}
        </div>
      </div>
      <div style={{ position:'fixed', left:'50%', bottom:112, transform:'translateX(-50%)', pointerEvents:'none', zIndex:101 }}>
        {sentFx.map((f) => (
          <div key={f.id} style={{ animation:'cheerPulse 900ms ease-out both', position:'absolute', left:'50%', transform:'translateX(-50%)', bottom: 0 }}>
            <span style={{ fontSize: 28, filter:'drop-shadow(0 1px 0 #000)' }}>{f.icon}</span>
          </div>
        ))}
      </div>
      {cheerEdit && (
        <>
        <div className="cheer-backdrop" onClick={() => setCheerEdit(false)} />
        <div className="cheer-edit" onClick={(e) => e.stopPropagation()}>
          <div style={{ position:'absolute', right:8, top:8 }}>
            <button onClick={() => setCheerEdit(false)} aria-label="Close" title="Close" style={{ background:'#201317', color:'#f66', border:'3px solid #f66', padding:'2px 8px', fontWeight:900, cursor:'pointer' }}>×</button>
          </div>
          <div style={{ fontSize:12, color:'#9df', marginBottom:6, paddingRight:28 }}>Customize your cheer bar (saved locally)</div>
          <div className="cheer-list">
            {(cheers || []).map((c, i) => (
              <div key={`edit-${i}`} className="cheer-row">
                <input className="cheer-input" style={{ width: 48, textAlign: 'center', padding: 6, cursor: 'pointer' }} value={c.icon} readOnly inputMode="none" onClick={() => setPickerIndex(i)} onTouchStart={() => setPickerIndex(i)} placeholder="😀" />
                <input className="cheer-input" value={c.text} onChange={(e) => setCheers((prev) => prev.map((x, idx) => idx===i ? { ...x, text: e.target.value } : x))} placeholder="Your message" />
                <button onClick={() => setCheers((prev) => prev.filter((_, idx) => idx !== i))} style={{ padding: '6px 10px', background: '#201317', color: '#f66', border: '3px solid #f66', cursor: 'pointer', fontWeight: 900 }} title="Remove">×</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
            <div style={{ fontSize: 12, color:'#9aa' }}>Up to 16 cheers • Tip: paste any emoji into icon</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setCheers([
                { icon: '👾', text: 'All your base!' },
                { icon: '🚀', text: 'To the moon!' },
                { icon: '🕹️', text: 'Do a barrel roll!' },
                { icon: '😹', text: 'LOLcats approved!' },
                { icon: '💾', text: 'Save point!' },
                { icon: '🔥', text: 'It’s over 9000!' },
                { icon: '🧱', text: '404: brakes not found' },
                { icon: '🎉', text: 'WinRAR activated!' },
              ])} style={{ background: '#122', color: '#9df', border: '3px solid #6cf', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>Reset Defaults</button>
              <button onClick={() => setCheers((prev) => prev.length >= 16 ? prev : [...prev, randomCheer()])} style={{ background: '#121a12', color: '#9f9', border: '3px solid #6f6', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }} disabled={cheers.length >= 16}>Add (+)</button>
            </div>
          </div>
        </div>
        </>
      )}
      {pickerIndex != null && (
        <>
          <div className="cheer-backdrop" onClick={() => setPickerIndex(null)} />
          <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <input className="cheer-input" placeholder="Paste emoji here or tap below" onChange={(e) => {
                const v = (e.target.value || '').trim().slice(0,3);
                if (v) { setCheers((prev) => prev.map((x, i) => i===pickerIndex ? { ...x, icon: v } : x)); setPickerIndex(null); (e.currentTarget as HTMLInputElement).value=''; }
              }} />
              <button onClick={() => setPickerIndex(null)} style={{ padding:'6px 10px', background:'#201317', color:'#f66', border:'3px solid #f66', cursor:'pointer', fontWeight:900 }}>×</button>
            </div>
            <div className="emoji-grid">
              {commonEmojis.map((e, i) => (
                <button key={`${e}-${i}`} className="emoji-btn" onClick={() => { setCheers((prev) => prev.map((x, idx) => idx===pickerIndex ? { ...x, icon: e } : x)); setPickerIndex(null); }}>{e}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
