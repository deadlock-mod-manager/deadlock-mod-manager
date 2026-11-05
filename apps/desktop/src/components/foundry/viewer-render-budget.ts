export const VIEWER_RESOLUTIONS = ["auto", "native", "half"] as const;
export type ViewerResolution = (typeof VIEWER_RESOLUTIONS)[number];

/** Limit framebuffer work independently of the CSS viewport and editor UI. */
export const viewerPixelRatio = (
  width: number,
  height: number,
  deviceRatio: number,
  resolution: ViewerResolution,
) => {
  const ratio = Math.min(deviceRatio, 2);
  if (resolution === "native") return ratio;
  if (resolution === "half") return ratio * 0.5;
  return Math.min(ratio, Math.sqrt(2_073_600 / Math.max(1, width * height)));
};

export const createViewerFrameBudget = () => {
  const interval = 1000 / 60;
  let previous: number | null = null;
  return {
    ready(now: number, dirty = false) {
      if (previous === null || dirty) {
        previous = now;
        return true;
      }
      const elapsed = now - previous;
      if (elapsed + 0.1 < interval) return false;
      previous += Math.floor((elapsed + 0.1) / interval) * interval;
      return true;
    },
  };
};

/** Avoid submitting different WebGL contexts in the same composited frame. */
export const createViewerDrawBudget = () => {
  const waiting = new Set<symbol>();
  let frame: number | null = null;
  return {
    createSlot() {
      const id = Symbol();
      return {
        ready(frameTime: number) {
          waiting.add(id);
          if (frame === frameTime || waiting.values().next().value !== id)
            return false;
          waiting.delete(id);
          frame = frameTime;
          return true;
        },
        idle() {
          waiting.delete(id);
        },
      };
    },
  };
};

export const viewerDrawBudget = createViewerDrawBudget();
