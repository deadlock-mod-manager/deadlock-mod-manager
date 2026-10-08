import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { UserPerfConfig } from "@/lib/store/slices/performance";

/** Config ids are namespaced so presets and the user's own configs never collide. */
export const presetConfigId = (presetId: string) => `preset:${presetId}`;

export const isPresetConfigId = (configId: string) =>
  configId.startsWith("preset:");

export const presetIdFromConfigId = (configId: string): string | null =>
  isPresetConfigId(configId) ? configId.slice("preset:".length) : null;

export const newUserConfigId = () => `user:${crypto.randomUUID()}`;

type RequestOptions = {
  overrides: EntryOverride[];
  includeEngineSections: boolean;
};

export const presetApplyRequest = (
  preset: Pick<PresetSummary, "id" | "name">,
  { overrides, includeEngineSections }: RequestOptions,
): PerfApplyRequest => ({
  configId: presetConfigId(preset.id),
  name: preset.name,
  source: { kind: "preset", id: preset.id },
  overrides,
  includeEngineSections,
});

export const userConfigApplyRequest = (
  config: Pick<UserPerfConfig, "id" | "name" | "entries">,
  { overrides, includeEngineSections }: RequestOptions,
): PerfApplyRequest => ({
  configId: config.id,
  name: config.name,
  source: {
    kind: "inline",
    definition: { id: config.id, name: config.name, entries: config.entries },
  },
  overrides,
  includeEngineSections,
});

/** Stable key for an entry path, matching the backend's case-insensitive comparison. */
export const pathKey = (path: string[]) =>
  path.map((part) => part.toLowerCase()).join("/");
