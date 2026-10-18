import type { UIState } from "@/lib/store/slices/ui";

export const TOUR_FEATURES = [
  { id: "server-browser", path: "/servers" },
  { id: "custom-maps", path: "/maps" },
  { id: "performance-configs", path: "/performance" },
] as const;

export type TourFeature = (typeof TOUR_FEATURES)[number]["id"];

export const enableTourFeatures = (
  current: UIState["experimentalFeatures"],
  selected: readonly TourFeature[],
): UIState["experimentalFeatures"] => ({
  ...current,
  ...Object.fromEntries(selected.map((feature) => [feature, true])),
});
