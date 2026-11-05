import { VIDEO_MENU, videoDisplay } from "@deadlock-mods/perf-catalog/video";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import type { VideoVariant } from "@/types/generated/VideoVariant";

export type ConfigVideo = {
  /** The first (or only) video.txt the author ships. */
  settings: VideoSetting[];
  /** Every video.txt when the author ships several, in their order. */
  variants: VideoVariant[];
};

/** The video.txt settings a config carries: a preset's from the catalog, an import's own. */
export const configVideo = (
  request: PerfApplyRequest,
  presets: PresetSummary[],
): ConfigVideo => {
  const { source } = request;
  if (source.kind === "inline") {
    return { settings: source.definition.videoSettings, variants: [] };
  }
  const preset = presets.find((candidate) => candidate.id === source.id);
  return {
    settings: preset?.videoSettings ?? [],
    variants: preset?.videoVariants ?? [],
  };
};

/** A video.txt key's name in the game's menu, when it has one. */
export const videoLabel = (key: string): string | null =>
  VIDEO_MENU.get(key.toLowerCase())?.label ?? null;

/** A video.txt value as the game's menu shows it, else as the file holds it. */
export const videoValueText = (key: string, value: string): string => {
  const option = VIDEO_MENU.get(key.toLowerCase());
  return (option && videoDisplay(option, value)) ?? value;
};
