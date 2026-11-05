import type { ModdingProjectedImageFrame } from "@/types/generated/ModdingProjectedImageFrame";
import type { ModelImageProjectionFrame } from "./model-image-projection";

const base64Constructor: Uint8ArrayConstructor & {
  fromBase64?: (value: string) => Uint8Array;
} = Uint8Array;

export function decodeImagePixels(value: string): Uint8Array {
  if (base64Constructor.fromBase64) return base64Constructor.fromBase64(value);
  const binary = atob(value);
  const pixels = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    pixels[index] = binary.charCodeAt(index);
  return pixels;
}

function encodeImagePixels(pixels: Uint8Array): string {
  const native: Uint8Array & { toBase64?: () => string } = pixels;
  if (native.toBase64) return native.toBase64();
  const chunks: string[] = [];
  for (let offset = 0; offset < pixels.length; offset += 8192)
    chunks.push(String.fromCharCode(...pixels.subarray(offset, offset + 8192)));
  return btoa(chunks.join(""));
}

export function decodeModelImageFrames(
  frames: readonly ModdingProjectedImageFrame[],
): ModelImageProjectionFrame[] {
  return frames.map((frame) => ({
    rgba: decodeImagePixels(frame.rgbaBase64),
    width: frame.width,
    height: frame.height,
    durationMs: frame.durationMs,
  }));
}

export function encodeModelImageFrames(
  frames: readonly ModelImageProjectionFrame[],
): ModdingProjectedImageFrame[] {
  return frames.map((frame) => ({
    rgbaBase64: encodeImagePixels(frame.rgba),
    width: frame.width,
    height: frame.height,
    durationMs: frame.durationMs,
  }));
}
