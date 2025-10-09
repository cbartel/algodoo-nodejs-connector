import { useEffect, useState } from 'react';

const KEY = 'mr_admin_token';

export function useAdminToken() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(KEY) || 'changeme');

  // Persist changes
  useEffect(() => {
    try { localStorage.setItem(KEY, token); } catch { void 0; }
  }, [token]);

  // Allow passing token via URL (?token=...)
  useEffect(() => {
    try {
      const qp = new URLSearchParams(window.location.search);
      const t = qp.get('token');
      if (t) setToken(t);
    } catch { void 0; }
  }, []);

  return { token, setToken } as const;
}
