import type { ModdingPatchBackground } from "@/types/generated/ModdingPatchBackground";
import type { ModelImageProjectionFrame } from "./model-image-projection";

export function modelPatchBackground(
  frame: ModelImageProjectionFrame,
  key: ModdingPatchBackground,
): ModelImageProjectionFrame {
  const rgba = frame.rgba.slice();
  const color = [1, 3, 5].map((offset) =>
    Number.parseInt(key.color.slice(offset, offset + 2), 16),
  );
  const distance = (index: number) => {
    const i = index * 4;
    return (
      Math.max(
        Math.abs(rgba[i] - color[0]),
        Math.abs(rgba[i + 1] - color[1]),
        Math.abs(rgba[i + 2] - color[2]),
      ) / 255
    );
  };
  const count = frame.width * frame.height;
  const connected = new Uint8Array(count);
  if (key.edgeConnected ?? true) {
    const radius = Math.round(
      Math.min(frame.width, frame.height) * (key.gapProtection ?? 0.01),
    );
    const foreground = new Uint8Array(count);
    for (let i = 0; i < count; i++)
      foreground[i] = Number(
        rgba[i * 4 + 3] > 0 && distance(i) > key.tolerance,
      );
    const protectedPixels = closeSilhouette(foreground, frame.width, radius);
    const queue = new Uint32Array(count);
    let head = 0,
      tail = 0;
    const visit = (index: number) => {
      if (
        connected[index] ||
        protectedPixels[index] ||
        distance(index) > key.tolerance
      )
        return;
      connected[index] = 1;
      queue[tail++] = index;
    };
    for (let x = 0; x < frame.width; x++) {
      visit(x);
      visit(count - frame.width + x);
    }
    for (let y = 0; y < frame.height; y++) {
      visit(y * frame.width);
      visit(y * frame.width + frame.width - 1);
    }
    while (head < tail) {
      const index = queue[head++];
      if (index % frame.width > 0) visit(index - 1);
      if ((index % frame.width) + 1 < frame.width) visit(index + 1);
      if (index >= frame.width) visit(index - frame.width);
      if (index + frame.width < count) visit(index + frame.width);
    }
  } else connected.fill(1);
  const feather = Math.min(key.softness, key.tolerance);
  for (let i = 0; i < count; i++) {
    if (!connected[i]) continue;
    const d = distance(i);
    const alpha =
      feather === 0
        ? Number(d > key.tolerance)
        : Math.max(0, Math.min(1, (d - key.tolerance + feather) / feather));
    rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * alpha);
  }
  return { ...frame, rgba };
}

function closeSilhouette(mask: Uint8Array, width: number, radius: number) {
  if (radius === 0) return mask;
  return boxMask(boxMask(mask, width, radius, true), width, radius, false);
}

function boxMask(
  mask: Uint8Array,
  width: number,
  radius: number,
  expand: boolean,
) {
  const height = mask.length / width;
  const prefix = new Uint32Array(Math.max(width, height) + 1);
  let input = mask;
  for (const vertical of [false, true]) {
    const length = vertical ? height : width;
    const lines = vertical ? width : height;
    const output = new Uint8Array(mask.length);
    for (let line = 0; line < lines; line++) {
      const index = (i: number) =>
        vertical ? i * width + line : line * width + i;
      for (let i = 0; i < length; i++)
        prefix[i + 1] = prefix[i] + input[index(i)];
      for (let i = 0; i < length; i++) {
        const start = Math.max(0, i - radius);
        const end = Math.min(length, i + radius + 1);
        const sum = prefix[end] - prefix[start];
        output[index(i)] = Number(expand ? sum > 0 : sum === end - start);
      }
    }
    input = output;
  }
  return input;
}
