#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

// Renders the NSIS installer bitmaps from the app icon:
//   sidebar.bmp (164x314) - welcome and finish pages
//   header.bmp  (150x57)  - all other installer and uninstaller pages
// Re-run after changing the app icon. Text uses Segoe UI, so run on Windows.

const SRC_TAURI = resolve(import.meta.dirname, "../src-tauri");
// Matches the default NSIS page background so the art blends into the dialog.
const BACKGROUND = "#ffffff";
const TEXT = "#1d1d1d";

type Pixels = { width: number; height: number; rgba: Buffer };
type Label = { text: string; x: number; y: number; size: number };

const renderSvg = (svg: string, background?: string): Pixels => {
  const image = new Resvg(svg, {
    background,
    font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" },
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

const renderBitmap = (
  name: string,
  width: number,
  height: number,
  iconBox: { x: number; y: number; size: number },
  labels: Label[],
  anchor: "start" | "middle",
) => {
  const text = labels
    .map(
      ({ text, x, y, size }) =>
        `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${text}</text>`,
    )
    .join("");
  const bitmap = renderSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="Segoe UI" font-weight="600" fill="${TEXT}">${text}</g></svg>`,
    BACKGROUND,
  );
  drawOver(bitmap, downscale(icon, iconBox.size), iconBox.x, iconBox.y);
  writeFileSync(resolve(SRC_TAURI, "installer", name), encodeBmp(bitmap));
};

renderBitmap(
  "sidebar.bmp",
  164,
  314,
  { x: 32, y: 70, size: 100 },
  [
    { text: "Deadlock", x: 82, y: 201, size: 16 },
    { text: "Mod Manager", x: 82, y: 223, size: 16 },
  ],
  "middle",
);

renderBitmap(
  "header.bmp",
  150,
  57,
  { x: 8, y: 8, size: 41 },
  [
    { text: "Deadlock", x: 56, y: 25, size: 11.33 },
    { text: "Mod Manager", x: 56, y: 40, size: 11.33 },
  ],
  "start",
);
