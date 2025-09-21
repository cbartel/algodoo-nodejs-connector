import * as Colyseus from 'colyseus.js';
import { protocolVersion } from 'marblerace-protocol';

const MR_PLAYER_KEY = 'mr_player_key';
const MR_ROOM_ID = 'mr_room_id';
const MR_SESSION_ID = 'mr_session_id';

function getOrCreatePlayerKey(): string {
  const existing = localStorage.getItem(MR_PLAYER_KEY);
  if (existing && existing.length >= 8) return existing;
  const rand = crypto.getRandomValues(new Uint8Array(16));
  const key = Array.from(rand).map((b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(MR_PLAYER_KEY, key);
  return key;
}

export async function connectRoom(): Promise<Colyseus.Room> {
  async function resolveEndpoint(): Promise<string> {
    const loc = window.location;
    try {
      const res = await fetch('/mr/config', { credentials: 'include' });
      const cfg = await res.json();
      return String(cfg.colyseusUrl || '').trim();
    } catch {
      const host = loc.hostname;
      const scheme = loc.protocol === 'https:' ? 'https' : 'http';
      return `${scheme}://${host}:2567`;
    }
  }
  const endpoint = await resolveEndpoint();
  const playerKey = getOrCreatePlayerKey();
  localStorage.setItem('mr_endpoint', endpoint);

  async function openNewRoom(): Promise<Colyseus.Room> {
    const client = new Colyseus.Client(await resolveEndpoint());
    const prevRoomId = localStorage.getItem(MR_ROOM_ID) || undefined;
    const prevSessionId = localStorage.getItem(MR_SESSION_ID) || undefined;
    let r: Colyseus.Room | null = null;
    if (prevRoomId && prevSessionId) {
      try {
        r = await client.reconnect(prevRoomId, prevSessionId);
        console.log('[web] reconnected to room', r.id);
      } catch {}
    }
    if (!r) {
      r = await client.joinOrCreate('marblerace', {});
      console.log('[web] joined new room', r.id);
    }
    // Identify ourselves so server can associate stable player
    try { r.send('handshake', { protocolVersion, playerKey }); } catch {}
    // Persist session for future reconnects
    try {
      localStorage.setItem(MR_ROOM_ID, r.id);
      localStorage.setItem(MR_SESSION_ID, r.sessionId);
    } catch {}
    return r;
  }

  function dispatchReconnected(newRoom: Colyseus.Room) {
    try {
      window.dispatchEvent(new CustomEvent('mr:room.reconnected', { detail: { room: newRoom } }));
    } catch {}
  }

  async function attachResilience(r: Colyseus.Room): Promise<Colyseus.Room> {
    r.onError((_code, _message) => {
      console.warn('[web] room error; scheduling reconnect');
      scheduleReconnect();
    });
    r.onLeave((_code) => {
      console.warn('[web] room left; scheduling reconnect');
      scheduleReconnect();
    });
    return r;
  }

  let reconnecting = false;
  async function scheduleReconnect() {
    if (reconnecting) return;
    reconnecting = true;
    let delay = 500;
    while (true) {
      try {
        await new Promise((res) => setTimeout(res, delay));
        const newRoom = await openNewRoom();
        await attachResilience(newRoom);
        reconnecting = false;
        dispatchReconnected(newRoom);
        return;
      } catch (e) {
        console.warn('[web] reconnect failed; retrying', e);
        delay = Math.min(delay * 2, 5000);
      }
    }
  }

  const firstRoom = await openNewRoom();
  await attachResilience(firstRoom);
  return firstRoom;
}

export async function getServerConfig(): Promise<{ colyseusUrl?: string; publicHttpUrl?: string } | null> {
  try {
    const res = await fetch('/mr/config', { credentials: 'include' });
    return await res.json();
  } catch {
    return null;
  }
}

export function getPlayerKey(): string {
  return getOrCreatePlayerKey();
}
