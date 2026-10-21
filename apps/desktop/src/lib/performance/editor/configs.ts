import { sameApplyOptions } from "@/lib/performance/overrides";
import {
  isPresetConfigId,
  presetApplyRequest,
  presetConfigId,
  presetIdFromConfigId,
  userConfigApplyRequest,
} from "@/lib/performance/request";
import type { UserPerfConfig } from "@/lib/store/slices/performance";
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

const NO_TWEAKS: EditorDraft = { overrides: [], includeEngineSections: true };

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
  if (preset) return presetApplyRequest(preset, NO_TWEAKS);
  const userConfig = userConfigs[configId];
  if (userConfig) return userConfigApplyRequest(userConfig, NO_TWEAKS);
  if (desired?.configId === configId) return { ...desired, ...NO_TWEAKS };
  return null;
};

export const withDraft = (
  base: PerfApplyRequest,
  draft: EditorDraft,
): PerfApplyRequest => ({
  ...base,
  overrides: draft.overrides,
  includeEngineSections: draft.includeEngineSections,
});

/**
 * The tweaks saved for a config. Overrides fall back to what was applied, for a
 * config applied before the store had an entry for it (e.g. from History).
 * Engine sections are included unless the user turned them off, except that a
 * config applied with nothing left out keeps its applied choice: the toggle
 * changes nothing there, so it shouldn't show as a pending change.
 */
export const savedDraftFor = (
  configId: string,
  savedOverrides: Record<string, EntryOverride[]>,
  savedIncludeEngineSections: Record<string, boolean>,
  desired: DesiredOverlay | null,
): EditorDraft => {
  const applied = desired?.request.configId === configId ? desired : null;
  const toggleChangesNothing = applied?.counts.engineSection === 0;
  return {
    overrides: savedOverrides[configId] ?? applied?.request.overrides ?? [],
    includeEngineSections:
      savedIncludeEngineSections[configId] ??
      (toggleChangesNothing ? applied.request.includeEngineSections : true),
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
