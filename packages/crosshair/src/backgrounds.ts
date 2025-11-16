export const BACKGROUND_PATHS = {
  bg1: "/backgrounds/bg-1.jpg",
  bg2: "/backgrounds/bg-2.jpg",
} as const;

export type BackgroundKey = keyof typeof BACKGROUND_PATHS | null;

export const BACKGROUND_LABELS: Record<NonNullable<BackgroundKey>, string> = {
  bg1: "Background 1",
  bg2: "Background 2",
} as const;

export const getBackgroundPath = (key: NonNullable<BackgroundKey>): string => {
  return BACKGROUND_PATHS[key];
};

export const getAllBackgroundPaths = (): string[] => {
  return Object.values(BACKGROUND_PATHS);
};
