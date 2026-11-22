import type { EditorDraft } from "@/lib/performance/editor/draft";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { UserPerfConfig } from "@/lib/store/slices/performance";

export const presetConfigId = (presetId: string) => `preset:${presetId}`;

export const isPresetConfigId = (configId: string) =>
  configId.startsWith("preset:");

export const presetIdFromConfigId = (configId: string): string | null =>
  isPresetConfigId(configId) ? configId.slice("preset:".length) : null;

export const newUserConfigId = () => `user:${crypto.randomUUID()}`;

export const presetApplyRequest = (
  preset: Pick<PresetSummary, "id" | "name">,
  options: EditorDraft,
): PerfApplyRequest => ({
  configId: presetConfigId(preset.id),
  name: preset.name,
  source: { kind: "preset", id: preset.id },
  ...applyOptions(options),
});

export const userConfigApplyRequest = (
  config: Pick<UserPerfConfig, "id" | "name" | "entries" | "videoSettings">,
  options: EditorDraft,
): PerfApplyRequest => ({
  configId: config.id,
  name: config.name,
  source: {
    kind: "inline",
    definition: {
      id: config.id,
      name: config.name,
      entries: config.entries,
      videoSettings: config.videoSettings,
    },
  },
  ...applyOptions(options),
});

const applyOptions = ({
  overrides,
  includeEngineSections,
  writeVideo,
  videoVariant,
}: EditorDraft): EditorDraft => ({
  overrides,
  includeEngineSections,
  writeVideo,
  videoVariant,
});

export const DEFAULT_APPLY_OPTIONS: EditorDraft = {
  overrides: [],
  includeEngineSections: true,
  writeVideo: true,
  videoVariant: null,
};

export const pathKey = (path: string[]) =>
  path.map((part) => part.toLowerCase()).join("/");
