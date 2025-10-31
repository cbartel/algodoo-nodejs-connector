export function formatPoints(value: unknown, fractionDigits = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 0.001) return String(rounded);
  return n.toFixed(fractionDigits);
}

export function safeMultiplier(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
