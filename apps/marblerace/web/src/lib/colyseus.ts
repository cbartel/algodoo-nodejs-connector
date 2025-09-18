import * as Colyseus from 'colyseus.js';
import { protocolVersion } from 'marblerace-protocol';

export async function connectRoom(): Promise<Colyseus.Room> {
  const loc = window.location;
  let endpoint: string;
  let cfg: any = null;
  try {
    const res = await fetch('/mr/config', { credentials: 'include' });
    cfg = await res.json();
    endpoint = cfg.colyseusUrl as string;
  } catch {
    // Fallback: same host, default Colyseus port
    const host = loc.hostname;
    const scheme = loc.protocol === 'https:' ? 'https' : 'http';
    endpoint = `${scheme}://${host}:2567`;
  }
  const client = new Colyseus.Client(endpoint);
  try {
    const room = await client.joinOrCreate('marblerace', {});
    room.onError((code, message) => console.error('[web] room error', { code, message }));
    room.onLeave((code) => console.warn('[web] room left', { code }));
    room.send('handshake', { protocolVersion });
    return room;
  } catch (err) {
    console.error('[web] joinOrCreate failed', err);
    throw err;
  }
}

export async function getServerConfig(): Promise<{ colyseusUrl?: string; publicHttpUrl?: string } | null> {
  try {
    const res = await fetch('/mr/config', { credentials: 'include' });
    return await res.json();
  } catch {
    return null;
  }
}
