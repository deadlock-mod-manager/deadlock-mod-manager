import { type ScreenId } from "./store";

export const IMAGE_SCREENS = {
  foundry: "/home/screens/mod-foundry.webp",
  autoexec: "/home/screens/autoexec.webp",
  stats: "/home/screens/stats.webp",
} satisfies Partial<Record<ScreenId, string>>;
