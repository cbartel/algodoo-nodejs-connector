import React, { useEffect, useMemo, useState } from 'react';
import { Button, Panel, Table, Badge } from 'marblerace-ui-kit';
import { connectRoom } from '../lib/colyseus';

export default function Admin() {
  const [room, setRoom] = useState<any>(null);
  const [stagesText, setStagesText] = useState('');
  const [points, setPoints] = useState('25,18,15,12,10,8,6,4,2,1');
  const [state, setState] = useState<any>(null);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [token, setToken] = useState<string>(() => localStorage.getItem('mr_admin_token') || 'changeme');

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

  // Allow passing token via URL, e.g. /admin?token=SECRET
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const t = qp.get('token');
    if (t) {
      setToken(t);
      localStorage.setItem('mr_admin_token', t);
    }
  }, []);

  const players = useMemo(() => (state ? Object.values((state.players as any) ?? {}) : []), [state]);
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

  function createRace() {
    const source = selectedScenes.length ? selectedScenes : stagesText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const stages = source.map((id) => ({ id }));
    const pointsTable = points
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n));
    sendAdmin('createRace', { stages, pointsTable });
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
              <div style={{ marginBottom: 8 }}>Available scenes from Algodoo client ({scenes.length})</div>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '3px solid #333', padding: 8 }}>
                {scenes.map((s) => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedScenes.includes(s)}
                      onChange={(e) => {
                        setSelectedScenes((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s));
                      }}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#9df', marginTop: 8 }}>Tip: Select scenes or fall back to manual list below.</div>
            </div>
          ) : (
            <div style={{ color: '#fc6' }}>No scenes received from client yet.</div>
          )}
          <div style={{ marginTop: 8 }}>Or enter stages (one id per line)</div>
          <textarea value={stagesText} onChange={(e) => setStagesText(e.target.value)} rows={4} style={{ width: '100%' }} />
          <div style={{ marginTop: 8 }}>Points Table (csv)</div>
          <input value={points} onChange={(e) => setPoints(e.target.value)} style={{ width: '100%' }} />
          <div style={{ marginTop: 8 }}>
            <Button onClick={createRace}>Create</Button>
          </div>
        </Panel>
        <Panel title="Controls">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={() => sendAdmin('openLobby')}>Open Lobby</Button>
            <Button onClick={() => sendAdmin('lockLobby')}>Lock Lobby</Button>
            <Button onClick={() => sendAdmin('start')}>Start</Button>
            <Button onClick={() => sendAdmin('reset')}>Reset</Button>
            <Button onClick={() => sendAdmin('finish')}>Finish Race</Button>
            <Button onClick={() => sendAdmin('nextStage')}>Next Stage</Button>
            <Button onClick={() => sendAdmin('setAutoAdvance', { auto: !(state?.autoAdvance) })}>
              Auto-advance: {state?.autoAdvance ? 'ON' : 'OFF'}
            </Button>
          </div>
          <div style={{ marginTop: 8 }}>
            <Badge>Global: {state?.globalPhase}</Badge>
            <Badge>Stage: {state?.stagePhase}</Badge>
            <Badge>
              Stage Index: {typeof state?.stageIndex === 'number' ? state.stageIndex + 1 : '-'} / {state?.stages?.length || 0}
            </Badge>
            <div style={{ marginTop: 8 }}>
              <Badge tone={clientAliveAgo != null && clientAliveAgo <= 6 ? 'success' : 'warn'}>
                Algodoo Client: {clientAliveAgo == null ? 'unknown' : clientAliveAgo <= 6 ? 'connected' : `last alive ${clientAliveAgo}s ago`}
              </Badge>
            </div>
          </div>
        </Panel>
      </div>
      <Panel title="Players" >
        <Table
          headers={["Name", "Total", "Best", "Earliest"]}
          rows={(players as any[]).map((p) => [p.name, p.totalPoints, p.bestPlacement || '-', p.earliestBestStageIndex >= 0 ? (p.earliestBestStageIndex + 1) : '-'])}
        />
      </Panel>
    </div>
  );
}
