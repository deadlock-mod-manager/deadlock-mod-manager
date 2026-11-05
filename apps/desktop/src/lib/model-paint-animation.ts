interface ModelPaintFrame {
  pixels: Uint8Array;
  durationMs: number;
}
export interface ModelPaintAnimation {
  frames: readonly ModelPaintFrame[];
  plays: number;
}
export function modelPaintFrameAt(
  animation: { frames: readonly { durationMs: number }[]; plays: number },
  seconds: number,
): number {
  const duration = animation.frames.reduce(
    (sum, frame) => sum + frame.durationMs,
    0,
  );
  if (!duration || !Number.isFinite(seconds)) return 0;
  const time = Math.max(0, seconds * 1000);
  if (animation.plays > 0 && time >= duration * animation.plays)
    return Math.max(0, animation.frames.length - 1);
  let local = time % duration;
  for (const [index, frame] of animation.frames.entries()) {
    if (local < frame.durationMs) return index;
    local -= frame.durationMs;
  }
  return Math.max(0, animation.frames.length - 1);
}
