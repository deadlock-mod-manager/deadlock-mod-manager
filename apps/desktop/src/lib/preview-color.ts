import { particleHex } from "./particle-colors";

export function previewPixel(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  width: number,
  height: number,
) {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    width <= 0 ||
    height <= 0 ||
    clientX < rect.left ||
    clientY < rect.top ||
    clientX >= rect.left + rect.width ||
    clientY >= rect.top + rect.height
  )
    return null;
  return {
    x: Math.floor(((clientX - rect.left) / rect.width) * width),
    y: height - 1 - Math.floor(((clientY - rect.top) / rect.height) * height),
  };
}

export function previewPixelHex(rgba: Uint8Array): string | null {
  const [r, g, b, alpha] = rgba;
  return r === undefined || g === undefined || b === undefined || !alpha
    ? null
    : particleHex([r, g, b]);
}
