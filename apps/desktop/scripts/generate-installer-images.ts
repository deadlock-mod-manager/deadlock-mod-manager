#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

// Renders the NSIS installer bitmaps from the app icon:
//   sidebar.bmp (164x314) - welcome and finish pages
//   sidebar-nightly.bmp   - the same, tagged for nightly builds
//   header.bmp  (150x57)  - all other installer and uninstaller pages
// Re-run after changing the app icon. Text uses the app's Forevs Demo font.

const SRC_TAURI = resolve(import.meta.dirname, "../src-tauri");
const FONT = "Forevs Demo";
const FONT_FILES = ["forevsdemo-bold.otf", "forevsdemo-medium.otf"].map(
  (file) => resolve(import.meta.dirname, "../src/assets/fonts/primary", file),
);

// Theme colors from src/index.css
const DARK = "#110f0e"; // --background
const CREAM = "#fdf8f0"; // --foreground
const ACCENT = "#efe2c0"; // --primary
const INK = "#2c2624"; // .light --foreground

type Pixels = { width: number; height: number; rgba: Buffer };

const renderSvg = (svg: string, background?: string): Pixels => {
  const image = new Resvg(svg, {
    background,
    font: {
      loadSystemFonts: false,
      fontFiles: FONT_FILES,
      defaultFontFamily: FONT,
    },
  }).render();
  return { width: image.width, height: image.height, rgba: image.pixels };
};

const loadIcon = (): Pixels => {
  const png = readFileSync(resolve(SRC_TAURI, "icons/icon.png"));
  const size = 512;
  return renderSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="data:image/png;base64,${png.toString("base64")}" width="${size}" height="${size}"/></svg>`,
  );
};

// resvg samples large downscales without prefiltering, which leaves the icon
// jagged at 41px. Average every covered source pixel instead, weighted by
// coverage and in premultiplied alpha.
const downscale = (src: Pixels, size: number): Pixels => {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = src.width / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      let total = 0;
      for (
        let sy = Math.floor(y * scale);
        sy < Math.ceil((y + 1) * scale);
        sy++
      ) {
        const wy = Math.min(sy + 1, (y + 1) * scale) - Math.max(sy, y * scale);
        for (
          let sx = Math.floor(x * scale);
          sx < Math.ceil((x + 1) * scale);
          sx++
        ) {
          const wx =
            Math.min(sx + 1, (x + 1) * scale) - Math.max(sx, x * scale);
          const weight = wx * wy;
          const i = (sy * src.width + sx) * 4;
          const alpha = src.rgba[i + 3] / 255;
          sum[0] += src.rgba[i] * alpha * weight;
          sum[1] += src.rgba[i + 1] * alpha * weight;
          sum[2] += src.rgba[i + 2] * alpha * weight;
          sum[3] += alpha * weight;
          total += weight;
        }
      }
      const o = (y * size + x) * 4;
      const alpha = sum[3] / total;
      for (let c = 0; c < 3; c++) {
        rgba[o + c] = alpha > 0 ? Math.round(sum[c] / total / alpha) : 0;
      }
      rgba[o + 3] = Math.round(alpha * 255);
    }
  }
  return { width: size, height: size, rgba };
};

const drawOver = (dest: Pixels, src: Pixels, left: number, top: number) => {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4;
      const d = ((top + y) * dest.width + left + x) * 4;
      const alpha = src.rgba[s + 3] / 255;
      for (let c = 0; c < 3; c++) {
        dest.rgba[d + c] = Math.round(
          src.rgba[s + c] * alpha + dest.rgba[d + c] * (1 - alpha),
        );
      }
    }
  }
};

// NSIS needs uncompressed 24-bit BMPs: bottom-up BGR rows padded to 4 bytes.
const encodeBmp = ({ width, height, rgba }: Pixels) => {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const bmp = Buffer.alloc(54 + pixelBytes);

  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(pixelBytes, 34);
  // 96 DPI
  bmp.writeInt32LE(3780, 38);
  bmp.writeInt32LE(3780, 42);

  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = row + x * 3;
      bmp[dst] = rgba[src + 2];
      bmp[dst + 1] = rgba[src + 1];
      bmp[dst + 2] = rgba[src];
    }
  }
  return bmp;
};

const icon = loadIcon();

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="${FONT}" font-weight="700">${body}</svg>`;

const renderBitmap = (
  name: string,
  art: string,
  background: string,
  iconBox: { x: number; y: number; size: number },
) => {
  const bitmap = renderSvg(art, background);
  drawOver(bitmap, downscale(icon, iconBox.size), iconBox.x, iconBox.y);
  writeFileSync(resolve(SRC_TAURI, "installer", name), encodeBmp(bitmap));
};

// Welcome and finish pages: the app's dark sidebar, with the icon's crosshair
// lines echoed faintly behind it. Nightly builds swap in a variant with a
// tag under the name (see scripts/update-nightly-version.ts).
const sidebarIcon = { x: 50, y: 88, size: 64 };
const cx = sidebarIcon.x + sidebarIcon.size / 2;
const cy = sidebarIcon.y + sidebarIcon.size / 2;

const renderSidebar = (name: string, tag: string) =>
  renderBitmap(
    name,
    svg(
      164,
      314,
      `<path d="M${cx} 0V${cy - 40}M0 ${cy}H${cx - 40}M${cx + 40} ${cy}H164" stroke="${ACCENT}" stroke-opacity="0.09"/>
      <text x="${cx}" y="196" font-size="23" fill="${CREAM}" text-anchor="middle">Deadlock</text>
      <text x="${cx}" y="218" font-size="17" fill="${ACCENT}" text-anchor="middle" letter-spacing="0.5">Mod Manager</text>
      ${tag}
      <text x="${cx}" y="296" font-size="11" font-weight="500" fill="${CREAM}" fill-opacity="0.45" text-anchor="middle" letter-spacing="0.3">by Stormix</text>
      <rect x="163" width="1" height="314" fill="${ACCENT}" fill-opacity="0.35"/>`,
    ),
    DARK,
    sidebarIcon,
  );

renderSidebar(
  "sidebar.bmp",
  `<rect x="${cx - 14}" y="234" width="28" height="2" fill="${ACCENT}" fill-opacity="0.5"/>`,
);
renderSidebar(
  "sidebar-nightly.bmp",
  `<rect x="${cx - 25.5}" y="229.5" width="51" height="15" rx="4" fill="none" stroke="${ACCENT}" stroke-opacity="0.6"/>
  <text x="${cx}" y="240.5" font-size="10" fill="${ACCENT}" text-anchor="middle" letter-spacing="0.4">Nightly</text>`,
);

// The header sits on the white title strip, so it stays light and leaves a
// gap before the page title NSIS draws to its right.
renderBitmap(
  "header.bmp",
  svg(
    150,
    57,
    `<text x="52" y="27" font-size="14" fill="${INK}">Deadlock</text>
    <text x="52" y="40" font-size="11" fill="${INK}" fill-opacity="0.7" letter-spacing="0.2">Mod Manager</text>`,
  ),
  "#ffffff",
  { x: 9, y: 11, size: 36 },
);
