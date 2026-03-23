export type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type Hsv = {
  h: number;
  s: number;
  v: number;
};

const HEX_REGEX = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isValidHex(hex: string): boolean {
  return HEX_REGEX.test(hex);
}

export function normalizeHex(hex: string, fallbackHex: string): string {
  const raw = isValidHex(hex)
    ? hex
    : isValidHex(fallbackHex)
      ? fallbackHex
      : "#000000";
  const clean = raw.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return `#${full.toLowerCase()}`;
}

export function hexToRgb(hexStr: string): Rgb {
  const m = hexStr.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const bigint = Number.parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rN:
        h = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
        break;
      case gN:
        h = ((bN - rN) / d + 2) * 60;
        break;
      default:
        h = ((rN - gN) / d + 4) * 60;
    }
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const sN = s / 100;
  const vN = v / 100;
  const c = vN * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m2 = vN - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  const hSeg = Math.floor((h % 360) / 60);
  switch (hSeg) {
    case 0:
      r1 = c;
      g1 = x;
      b1 = 0;
      break;
    case 1:
      r1 = x;
      g1 = c;
      b1 = 0;
      break;
    case 2:
      r1 = 0;
      g1 = c;
      b1 = x;
      break;
    case 3:
      r1 = 0;
      g1 = x;
      b1 = c;
      break;
    case 4:
      r1 = x;
      g1 = 0;
      b1 = c;
      break;
    default:
      r1 = c;
      g1 = 0;
      b1 = x;
      break;
  }
  return {
    r: Math.round((r1 + m2) * 255),
    g: Math.round((g1 + m2) * 255),
    b: Math.round((b1 + m2) * 255),
  };
}

export function hexToHsv(hex: string, fallbackHex: string): Hsv {
  const normalized = normalizeHex(hex, fallbackHex);
  const { r, g, b } = hexToRgb(normalized);
  return rgbToHsv(r, g, b);
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}
