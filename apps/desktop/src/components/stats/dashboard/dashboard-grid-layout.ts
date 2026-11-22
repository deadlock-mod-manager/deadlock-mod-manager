import { GRID_COLUMNS } from "@/lib/stats/dashboard/layout";

export const GAP_PX = 16;

export const TRACK_PX = 8;

export const responsiveSpan = (w: number, gridWidth: number) => {
  if (gridWidth < 640) {
    return GRID_COLUMNS;
  }
  if (gridWidth < 960) {
    return Math.min(GRID_COLUMNS, Math.max(w, 6));
  }
  return w;
};
