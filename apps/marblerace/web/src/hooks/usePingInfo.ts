/* eslint-env browser */
import { useEffect, useState } from 'react';

export interface PingInfo { ok: boolean; rtt: number; age: number }

export function usePingInfo(pollMs = 3000) {
  const [ping, setPing] = useState<PingInfo | null>(null);

  useEffect(() => {
    let t: any;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/mr/health');
        const j = await res.json();
        const last = Number(j?.ping?.lastPingAt || 0);
        const rtt = Number(j?.ping?.lastPingRtt || -1);
        const ok = !!j?.ping?.pingOk;
        const age = last > 0 ? Math.round((Date.now() - last) / 1000) : -1;
        if (!cancelled) setPing({ ok, rtt, age });
      } catch { void 0; }
      t = setTimeout(poll, pollMs);
    }
    poll();
    return () => { cancelled = true; if (t) clearTimeout(t); };
  }, [pollMs]);

  return ping;
}
