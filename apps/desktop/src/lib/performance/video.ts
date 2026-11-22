import { VIDEO_MENU, videoDisplay } from "@deadlock-mods/perf-catalog/video";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { VideoSetting } from "@/types/generated/VideoSetting";
import type { VideoVariant } from "@/types/generated/VideoVariant";

export type ConfigVideo = {
  settings: VideoSetting[];
  variants: VideoVariant[];
};

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

export const videoLabel = (key: string): string | null =>
  VIDEO_MENU.get(key.toLowerCase())?.label ?? null;

export const videoValueText = (key: string, value: string): string => {
  const option = VIDEO_MENU.get(key.toLowerCase());
  return (option && videoDisplay(option, value)) ?? value;
};
