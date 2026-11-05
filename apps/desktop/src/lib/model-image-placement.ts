import type { ModelImageProjectionFrame } from "./model-image-projection";

export interface ModelImageCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface ModelImageAlignment {
  center: [number, number];
  scale: number;
  rotation: number;
  crop: ModelImageCrop;
}
export const fullImageCrop: ModelImageCrop = {
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
};
export const defaultImageAlignment = (): ModelImageAlignment => ({
  center: [0.5, 0.5],
  scale: 0.3,
  rotation: 0,
  crop: { ...fullImageCrop },
});
const clampImageValue = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function imageCropBounds(
  image: { width: number; height: number },
  crop: ModelImageCrop = fullImageCrop,
) {
  const x = clampImageValue(
    Math.round(crop.left * image.width),
    0,
    image.width - 1,
  );
  const y = clampImageValue(
    Math.round(crop.top * image.height),
    0,
    image.height - 1,
  );
  return {
    x,
    y,
    width:
      clampImageValue(
        Math.round(crop.right * image.width),
        x + 1,
        image.width,
      ) - x,
    height:
      clampImageValue(
        Math.round(crop.bottom * image.height),
        y + 1,
        image.height,
      ) - y,
  };
}

/** Uses the same rounded crop pixels for the viewport and the UV bake. */
export function imagePlacementGeometry(
  image: { width: number; height: number },
  alignment: Pick<ModelImageAlignment, "center" | "scale" | "rotation"> & {
    crop?: ModelImageCrop;
  },
  viewport: { width: number; height: number },
) {
  const crop = imageCropBounds(image, alignment.crop);
  const width = viewport.width * alignment.scale;
  const height = (width * image.height) / image.width;
  const dx = width * ((crop.x + crop.width / 2) / image.width - 0.5);
  const dy = height * ((crop.y + crop.height / 2) / image.height - 0.5);
  const cos = Math.cos(alignment.rotation),
    sin = Math.sin(alignment.rotation);
  return {
    center: {
      x: alignment.center[0] * viewport.width + dx * cos - dy * sin,
      y: alignment.center[1] * viewport.height + dx * sin + dy * cos,
    },
    size: {
      width: (width * crop.width) / image.width,
      height: (height * crop.height) / image.height,
    },
  };
}

export function cropModelImageFrames(
  frames: readonly ModelImageProjectionFrame[],
  crop: ModelImageCrop = fullImageCrop,
): ModelImageProjectionFrame[] {
  return frames.map((frame) => {
    const { x, y, width, height } = imageCropBounds(frame, crop);
    if (width === frame.width && height === frame.height) return frame;
    const rgba = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      const start = ((y + row) * frame.width + x) * 4;
      rgba.set(frame.rgba.subarray(start, start + width * 4), row * width * 4);
    }
    return { rgba, width, height, durationMs: frame.durationMs };
  });
}

export type ImagePlacementHandle =
  | "move"
  | "rotate"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export function createImagePlacementUpdates(
  publish: (alignment: ModelImageAlignment) => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
) {
  let frame: number | null = null;
  let pending: ModelImageAlignment | null = null;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    const value = pending;
    pending = null;
    if (value) publish(value);
  };
  return {
    queue(value: ModelImageAlignment) {
      pending = value;
      if (frame === null) frame = schedule(flush);
    },
    flush,
    cancel() {
      if (frame !== null) cancel(frame);
      frame = null;
      pending = null;
    },
  };
}

export function dragImagePlacement(
  start: ModelImageAlignment,
  handle: ImagePlacementHandle,
  delta: { x: number; y: number },
  viewport: { width: number; height: number },
  image: { width: number; height: number },
  cropping: boolean,
): ModelImageAlignment {
  if (handle === "move")
    return {
      ...start,
      center: [
        clampImageValue(start.center[0] + delta.x / viewport.width, 0, 1),
        clampImageValue(start.center[1] + delta.y / viewport.height, 0, 1),
      ],
    };
  const cos = Math.cos(start.rotation),
    sin = Math.sin(start.rotation);
  const dx = delta.x * cos + delta.y * sin;
  const dy = -delta.x * sin + delta.y * cos;
  const width = viewport.width * start.scale;
  const height = (width * image.height) / image.width;
  if (cropping) {
    const crop = { ...start.crop };
    if (handle.includes("w"))
      crop.left = clampImageValue(
        crop.left + dx / width,
        0,
        crop.right - 1 / image.width,
      );
    if (handle.includes("e"))
      crop.right = clampImageValue(
        crop.right + dx / width,
        crop.left + 1 / image.width,
        1,
      );
    if (handle.includes("n"))
      crop.top = clampImageValue(
        crop.top + dy / height,
        0,
        crop.bottom - 1 / image.height,
      );
    if (handle.includes("s"))
      crop.bottom = clampImageValue(
        crop.bottom + dy / height,
        crop.top + 1 / image.height,
        1,
      );
    return { ...start, crop };
  }
  const sx = handle.includes("w") ? -1 : 1;
  const sy = handle.includes("n") ? -1 : 1;
  const factor =
    1 +
    (sx * width * dx + sy * height * dy) / (width * width + height * height);
  const scale = clampImageValue(start.scale * factor, 0.05, 2);
  const shiftX = (sx * viewport.width * (scale - start.scale)) / 2;
  const shiftY =
    (sy * viewport.width * (scale - start.scale) * image.height) /
    image.width /
    2;
  return {
    ...start,
    scale,
    center: [
      clampImageValue(
        start.center[0] + (shiftX * cos - shiftY * sin) / viewport.width,
        0,
        1,
      ),
      clampImageValue(
        start.center[1] + (shiftX * sin + shiftY * cos) / viewport.height,
        0,
        1,
      ),
    ],
  };
}
