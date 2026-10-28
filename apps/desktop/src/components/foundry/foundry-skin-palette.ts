import { useEffect, useState } from "react";
import { decodeFoundryTexture } from "@/lib/foundry";
import logger from "@/lib/logger";
import type { FoundryPaintPart } from "@/types/foundry";

/** Pixels sampled per texture; plenty to find its main color. */
const SAMPLE_SIZE = 32;
const cache = new Map<string, Promise<string | null>>();

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * The most common color in an image, ignoring near-black and transparent
 * pixels: color maps carry dark crevices and empty UV space that would
 * otherwise win.
 */
const dominantColor = async (dataUrl: string): Promise<string | null> => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  // Bucket at 4 bits a channel, then average the winning bucket's pixels.
  const buckets = new Map<
    number,
    { count: number; sum: [number, number, number] }
  >();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128 || r + g + b < 60) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] };
    bucket.count++;
    bucket.sum[0] += r;
    bucket.sum[1] += g;
    bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  let best: { count: number; sum: [number, number, number] } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  return best
    ? toHex(
        best.sum[0] / best.count,
        best.sum[1] / best.count,
        best.sum[2] / best.count,
      )
    : null;
};

/**
 * One color per paintable section, read from the skin's original color maps,
 * so the brush can offer the colors the skin already wears.
 */
export const useSkinPalette = (
  filePath: string | null,
  parts: readonly FoundryPaintPart[],
): string[] | null => {
  const [palette, setPalette] = useState<string[] | null>(null);

  useEffect(() => {
    setPalette(null);
    if (!filePath || parts.length === 0) return;
    let cancelled = false;
    const textures = [...new Set(parts.map((part) => part.texture))];
    void Promise.all(
      textures.map((texture) => {
        const key = `${filePath}\n${texture}`;
        let pending = cache.get(key);
        if (!pending) {
          pending = decodeFoundryTexture(filePath, texture)
            .then((decoded) => dominantColor(decoded.dataUrl))
            .catch((err) => {
              logger.withError(err).warn("[Foundry] Palette color failed");
              return null;
            });
          cache.set(key, pending);
        }
        return pending;
      }),
    ).then((colors) => {
      if (cancelled) return;
      setPalette([
        ...new Set(colors.filter((color): color is string => color !== null)),
      ]);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath, parts]);

  return palette;
};
