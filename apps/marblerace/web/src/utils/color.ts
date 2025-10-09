export function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function rgbToOKLab(r8: number, g8: number, b8: number) {
  const r = srgbToLinear(r8), g = srgbToLinear(g8), b = srgbToLinear(b8);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    A: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    B: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function okLabDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }) {
  const a = rgbToOKLab(c1.r, c1.g, c1.b);
  const b = rgbToOKLab(c2.r, c2.g, c2.b);
  return Math.hypot(a.L - b.L, a.A - b.A, a.B - b.B);
}

export function rgbToHex(col: any, fallback = '#6cf') {
  try {
    const r = (col?.r | 0).toString(16).padStart(2, '0');
    const g = (col?.g | 0).toString(16).padStart(2, '0');
    const b = (col?.b | 0).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  } catch { return fallback; }
}

