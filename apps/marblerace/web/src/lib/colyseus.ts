import { protocolVersion } from 'marblerace-protocol';

type MRRoom = {
  state: any;
  onStateChange(cb: (state: any) => void): void;
  onMessage(type: string, cb: (message: any) => void): void;
  onError(cb: (code: number, message?: string) => void): void;
  onLeave(cb: (code: number) => void): void;
  send(type: string, payload?: any): void;
  reconnectionToken?: string;
};

const MR_PLAYER_KEY = 'mr_player_key';
const MR_RECON_TOKEN = 'mr_recon_token';

/** Return a stable per-browser player key, generating one if missing. */
function getOrCreatePlayerKey(): string {
  const existing = localStorage.getItem(MR_PLAYER_KEY);
  if (existing && existing.length >= 8) return existing;
  let randBytes: Uint8Array;
  try {
    const cryptoApi = (globalThis as any).crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      randBytes = cryptoApi.getRandomValues(new Uint8Array(16));
    } else {
      throw new Error('no-web-crypto');
    }
  } catch {
    // Fallback (non-cryptographic) for environments without WebCrypto during dev
    randBytes = new Uint8Array(16);
    for (let i = 0; i < randBytes.length; i++) randBytes[i] = Math.floor(Math.random() * 256);
  }
  const key = Array.from(randBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(MR_PLAYER_KEY, key);
  return key;
}

/** Connect to the Marble Race Colyseus room with reconnection support. */
export async function connectRoom(): Promise<MRRoom> {
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

  async function openNewRoom(): Promise<MRRoom> {
    const mod: any = await import('colyseus.js');
    const ClientCtor = mod?.Client || mod?.default?.Client || mod?.default || mod;
    const client: any = new ClientCtor(await resolveEndpoint());
    const token = localStorage.getItem(MR_RECON_TOKEN) || undefined;
    let roomAny: any = null;
    if (token) {
      try { roomAny = await client.reconnect(token); } catch {}
    }
    if (!roomAny) {
      roomAny = await client.joinOrCreate('marblerace');
    }
    const room = roomAny as MRRoom;
    console.log('[web]', token ? 'reconnected to room' : 'joined new room');
    // Identify ourselves so server can associate stable player
    try { room.send('handshake', { protocolVersion, playerKey }); } catch {}
    // Persist reconnection token for future reconnects
    const recon = typeof roomAny?.reconnectionToken === 'string' ? (roomAny.reconnectionToken as string) : undefined;
    if (recon) localStorage.setItem(MR_RECON_TOKEN, recon);
    return room;
  }

  function dispatchReconnected(newRoom: MRRoom) {
    try {
      window.dispatchEvent(new CustomEvent('mr:room.reconnected', { detail: { room: newRoom } }));
    } catch {}
  }

  async function attachResilience(r: MRRoom): Promise<MRRoom> {
    r.onError((_code: number, _message?: string) => {
      console.warn('[web] room error; scheduling reconnect');
      scheduleReconnect();
    });
    r.onLeave((_code: number) => {
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
