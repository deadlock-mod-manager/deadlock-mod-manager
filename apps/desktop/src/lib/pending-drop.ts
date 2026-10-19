import type { DetectedSource } from "@/lib/file-utils";

// Files dropped outside the Add Mods page, waiting for that page to open them.
// Held in memory because a path-backed File does not survive history state.
let pendingDrop: DetectedSource | null = null;

export const setPendingDrop = (source: DetectedSource) => {
  pendingDrop = source;
};

export const takePendingDrop = (): DetectedSource | null => {
  const source = pendingDrop;
  pendingDrop = null;
  return source;
};
