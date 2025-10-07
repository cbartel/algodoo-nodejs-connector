import os from 'node:os';
import path from 'node:path';

/**
 * Return an appropriate Content-Type header value for a given filename.
 * Falls back to undefined when unknown to let the client infer.
 */
export function contentTypeFor(file: string): string | undefined {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return undefined;
}

/**
 * Safely join a URL path to a base directory, preventing path traversal.
 * Returns null if the resolved path escapes the base directory.
 */
export function safeJoin(baseDir: string, urlPath: string): string | null {
  const cleaned = urlPath.replace(/^\/+/, '');
  const resolved = path.resolve(baseDir, cleaned);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null;
  }
  return resolved;
}

/** Determine whether the host string refers to localhost. */
export function isLocalhost(host: string): boolean {
  let h = host.trim().toLowerCase();
  // Strip bracketed IPv6
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end > 0) h = h.slice(1, end);
  }
  // Strip :port for any hostname/IPv4
  const idx = h.indexOf(':');
  if (idx > -1) h = h.slice(0, idx);
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Pick a best-effort local IPv4 address for development when advertising URLs.
 * Prefers RFC1918 ranges when available.
 */
export function pickLocalIPv4(): string | null {
  try {
    const ifaces = os.networkInterfaces();
    const all: string[] = [];
    for (const name of Object.keys(ifaces)) {
      for (const i of ifaces[name] || []) {
        if ((i as any).family === 'IPv4' && !(i as any).internal) all.push((i as any).address);
      }
    }
    const prefer = all.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip));
    return prefer || all[0] || null;
  } catch {
    return null;
  }
}

/**
 * Extract the hostname component from a Host header-like string.
 * Supports IPv6 forms like "[::1]:8080".
 */
export function extractHostname(hostHeaderOrHost: string): string {
  const src = hostHeaderOrHost.trim();
  if (!src) return 'localhost';
  if (src.startsWith('[')) {
    const end = src.indexOf(']');
    if (end > 0) return src.slice(1, end);
    return src.replace(/^\[|\]$/g, '');
  }
  return src.split(':')[0];
}
