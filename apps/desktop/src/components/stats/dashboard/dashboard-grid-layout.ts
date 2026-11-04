import { GRID_COLUMNS } from "@/lib/stats/dashboard/layout";

/** Column gap, and the bottom padding every item carries in place of a row gap. */
export const GAP_PX = 16;

/**
 * Fine row track the items span. Auto-height widgets measure themselves and
 * span as many tracks as they need, which packs them masonry-style without a
 * layout engine; fixed heights are multiples of ROW_HEIGHT_PX, which this divides.
 */
export const TRACK_PX = 8;

/** Narrow windows widen small widgets instead of squeezing them into slivers. */
export const responsiveSpan = (w: number, gridWidth: number) => {
  if (gridWidth < 640) {
    return GRID_COLUMNS;
  }
  if (gridWidth < 960) {
    return Math.min(GRID_COLUMNS, Math.max(w, 6));
  }
  return w;
};
