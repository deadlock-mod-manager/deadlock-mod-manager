import { sameApplyOptions } from "@/lib/performance/overrides";
import {
  DEFAULT_APPLY_OPTIONS,
  isPresetConfigId,
  presetApplyRequest,
  presetConfigId,
  presetIdFromConfigId,
  userConfigApplyRequest,
} from "@/lib/performance/request";
import type {
  PerfVideoChoice,
  UserPerfConfig,
} from "@/lib/store/slices/performance";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { EditorDraft } from "./draft";

export type EditorConfigOption = {
  configId: string;
  name: string;
  group: "preset" | "user";
};

type PresetRef = Pick<PresetSummary, "id" | "name">;

/**
 * Every config the editor can open: catalog presets, then the user's own
 * newest first. The applied config is listed even when the catalog or the
 * store no longer has it, so it stays editable.
 */
export const editorConfigOptions = (
  presets: PresetRef[],
  userConfigs: Record<string, UserPerfConfig>,
  desired: PerfApplyRequest | null,
): EditorConfigOption[] => {
  const options: EditorConfigOption[] = [
    ...presets.map(
      (preset): EditorConfigOption => ({
        configId: presetConfigId(preset.id),
        name: preset.name,
        group: "preset",
      }),
    ),
    ...Object.values(userConfigs)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(
        (config): EditorConfigOption => ({
          configId: config.id,
          name: config.name,
          group: "user",
        }),
      ),
  ];
  if (
    desired &&
    !options.some((option) => option.configId === desired.configId)
  ) {
    options.push({
      configId: desired.configId,
      name: desired.name,
      group: isPresetConfigId(desired.configId) ? "preset" : "user",
    });
  }
  return options;
};

/** The request for a config without any tweaks, or `null` when it can't be found. */
export const editorBaseRequest = (
  configId: string,
  presets: PresetRef[],
  userConfigs: Record<string, UserPerfConfig>,
  desired: PerfApplyRequest | null,
): PerfApplyRequest | null => {
  const presetId = presetIdFromConfigId(configId);
  const preset =
    presetId === null ? undefined : presets.find((p) => p.id === presetId);
  if (preset) return presetApplyRequest(preset, DEFAULT_APPLY_OPTIONS);
  const userConfig = userConfigs[configId];
  if (userConfig) {
    return userConfigApplyRequest(userConfig, DEFAULT_APPLY_OPTIONS);
  }
  if (desired?.configId === configId) {
    return { ...desired, ...DEFAULT_APPLY_OPTIONS };
  }
  return null;
};

export const withDraft = (
  base: PerfApplyRequest,
  draft: EditorDraft,
): PerfApplyRequest => ({
  ...base,
  overrides: draft.overrides,
  includeEngineSections: draft.includeEngineSections,
  writeVideo: draft.writeVideo,
  videoVariant: draft.videoVariant,
});

/**
 * The tweaks saved for a config. Overrides fall back to what was applied, for a
 * config applied before the store had an entry for it (e.g. from History).
 * Engine sections are included unless the user turned them off, except that a
 * config applied with nothing left out keeps its applied choice: the toggle
 * changes nothing there, so it shouldn't show as a pending change. Video.txt
 * settings are written unless the user turned them off.
 */
export const savedDraftFor = (
  configId: string,
  saved: {
    overrides: Record<string, EntryOverride[]>;
    includeEngineSections: Record<string, boolean>;
    video: Record<string, PerfVideoChoice>;
  },
  desired: DesiredOverlay | null,
): EditorDraft => {
  const applied = desired?.request.configId === configId ? desired : null;
  const toggleChangesNothing = applied?.counts.engineSection === 0;
  const video = saved.video[configId];
  return {
    overrides: saved.overrides[configId] ?? applied?.request.overrides ?? [],
    includeEngineSections:
      saved.includeEngineSections[configId] ??
      (toggleChangesNothing ? applied.request.includeEngineSections : true),
    writeVideo: video?.write ?? applied?.request.writeVideo ?? true,
    videoVariant: video
      ? video.variant
      : (applied?.request.videoVariant ?? null),
  };
};

/** The file holds this config with exactly these tweaks. */
export const isAppliedAs = (
  configId: string,
  saved: EditorDraft,
  desired: PerfApplyRequest | null,
): boolean =>
  desired !== null &&
  desired.configId === configId &&
  sameApplyOptions(desired, saved);
