import type { ModdingProjectedImageFrame } from "@/types/generated/ModdingProjectedImageFrame";
import type { ModelImageProjectionFrame } from "./model-image-projection";

export function decodeModelImageFrames(
  frames: readonly ModdingProjectedImageFrame[],
): ModelImageProjectionFrame[] {
  return frames.map((frame) => ({
    rgba: Uint8Array.from(atob(frame.rgbaBase64), (character) =>
      character.charCodeAt(0),
    ),
    width: frame.width,
    height: frame.height,
    durationMs: frame.durationMs,
  }));
}

export function encodeModelImageFrames(
  frames: readonly ModelImageProjectionFrame[],
): ModdingProjectedImageFrame[] {
  return frames.map((frame) => {
    const chunks: string[] = [];
    for (let offset = 0; offset < frame.rgba.length; offset += 8192)
      chunks.push(
        String.fromCharCode(...frame.rgba.subarray(offset, offset + 8192)),
      );
    return {
      rgbaBase64: btoa(chunks.join("")),
      width: frame.width,
      height: frame.height,
      durationMs: frame.durationMs,
    };
  });
}
