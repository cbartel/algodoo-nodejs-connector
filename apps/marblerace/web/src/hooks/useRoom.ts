/* eslint-env browser */

import { useEffect, useRef, useState } from 'react';
import { connectRoom } from '../lib/colyseus';

/**
 * useRoom: Connects to the Colyseus room and exposes { room, state } with
 * automatic reconnection handling and state change propagation.
 */
export function useRoom<TState = any>() {
  const [room, setRoom] = useState<any>(null);
  const [state, setState] = useState<TState | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    const bind = (r: any) => {
      // Cleanup previous binding if any
    if (unsubRef.current) { try { unsubRef.current(); } catch { void 0; } }
      const onState = (s: any) => setState({ ...(s as any) });
      r.onStateChange(onState);
      unsubRef.current = () => {
        try { r.onStateChange(() => {}); } catch { void 0; }
      };
      setRoom(r);
      setState(r.state);
    };
    connectRoom().then((r) => { if (mounted) bind(r); });
    const onReconnected = (ev: any) => {
      const r2 = ev?.detail?.room;
      if (!r2) return;
      bind(r2);
    };
    window.addEventListener('mr:room.reconnected', onReconnected);
    return () => {
      mounted = false;
      window.removeEventListener('mr:room.reconnected', onReconnected);
      if (unsubRef.current) { try { unsubRef.current(); } catch { void 0; } }
    };
  }, []);

  return { room, state } as const;
}
