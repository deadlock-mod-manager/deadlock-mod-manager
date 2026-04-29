export type HslTriplet = {
  h: number;
  s: number;
  l: number;
};

export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (full.length !== 6) return null;
  const bigint = Number.parseInt(full, 16);
  if (Number.isNaN(bigint)) return null;
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export function rgbToHslTriplet(r: number, g: number, b: number): HslTriplet {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr:
        h = (gg - bb) / d + (gg < bb ? 6 : 0);
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      default:
        h = (rr - gg) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function formatHslTriple(t: HslTriplet): string {
  return `${t.h} ${t.s}% ${t.l}%`;
}

export function hexToHslTripleString(hex: string): string {
  const rgb = hexToRgb(hex);
  if (rgb === null) {
    return "0 0% 50%";
  }
  const t = rgbToHslTriplet(rgb.r, rgb.g, rgb.b);
  return formatHslTriple(t);
}

export function hslTripletFromHex(hex: string): HslTriplet {
  const rgb = hexToRgb(hex);
  if (rgb === null) {
    return { h: 0, s: 0, l: 50 };
  }
  return rgbToHslTriplet(rgb.r, rgb.g, rgb.b);
}

export function darkenAccentFromPrimary(primary: HslTriplet): HslTriplet {
  return {
    h: primary.h,
    s: Math.min(Math.max(primary.s - 20, 0), 50),
    l: Math.max(primary.l - 10, 38),
  };
}

export function ringFromPrimary(primary: HslTriplet): HslTriplet {
  return {
    h: primary.h,
    s: Math.min(Math.max(primary.s - 5, 0), 65),
    l: Math.min(primary.l, 45),
  };
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (rgb === null) {
    return `rgba(128, 128, 128, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function hslToRgbComponents(
  hDeg: number,
  sPct: number,
  lPct: number,
): { r: number; g: number; b: number } {
  const h = ((hDeg % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, sPct)) / 100;
  const l = Math.min(100, Math.max(0, lPct)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh >= 0 && hh < 1) {
    rp = c;
    gp = x;
    bp = 0;
  } else if (hh >= 1 && hh < 2) {
    rp = x;
    gp = c;
    bp = 0;
  } else if (hh >= 2 && hh < 3) {
    rp = 0;
    gp = c;
    bp = x;
  } else if (hh >= 3 && hh < 4) {
    rp = 0;
    gp = x;
    bp = c;
  } else if (hh >= 4 && hh < 5) {
    rp = x;
    gp = 0;
    bp = c;
  } else {
    rp = c;
    gp = 0;
    bp = x;
  }
  const m = l - c / 2;
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  return { r, g, b };
}

export function hslToHex(hDeg: number, sPct: number, lPct: number): string {
  const { r, g, b } = hslToRgbComponents(hDeg, sPct, lPct);
  const channelHex = (channel: number) =>
    Math.min(255, Math.max(0, channel)).toString(16).padStart(2, "0");
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

export function hslTripletStringToHex(hslTriple: string): string {
  const parts = hslTriple.trim().split(/\s+/);
  if (parts.length < 3) {
    return "#808080";
  }
  const h = Number.parseFloat(parts[0].replace(",", ""));
  const s = Number.parseFloat(parts[1].replace("%", ""));
  const l = Number.parseFloat(parts[2].replace("%", ""));
  if (
    Number.isNaN(h) ||
    Number.isNaN(s) ||
    Number.isNaN(l)
  ) {
    return "#808080";
  }
  return hslToHex(h, s, l);
}

export function hslCssTripleWithOpacity(
  hslTripleSpaceSeparated: string,
  opacityPct: number,
): string {
  const alpha = Math.min(100, Math.max(0, opacityPct)) / 100;
  return `${hslTripleSpaceSeparated} / ${alpha}`;
}
