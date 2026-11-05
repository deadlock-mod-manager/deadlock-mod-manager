import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { OverrideAction } from "@/types/generated/OverrideAction";
import { type EditorDraft, sameOverrides } from "./editor/draft";
import { pathKey } from "./request";

export const findOverride = (
  overrides: EntryOverride[],
  path: string[],
): EntryOverride | null => {
  const key = pathKey(path);
  return overrides.find((override) => pathKey(override.path) === key) ?? null;
};

/** Whether two requests carry the same tweaks, ignoring their order. */
export const sameApplyOptions = (a: EditorDraft, b: EditorDraft) =>
  a.includeEngineSections === b.includeEngineSections &&
  a.writeVideo === b.writeVideo &&
  a.videoVariant === b.videoVariant &&
  sameOverrides(a.overrides, b.overrides);

/** Replaces the override for `path`, or drops it when `action` is null. */
export const withOverride = (
  overrides: EntryOverride[],
  path: string[],
  action: OverrideAction | null,
): EntryOverride[] => {
  const key = pathKey(path);
  const others = overrides.filter((override) => pathKey(override.path) !== key);
  return action ? [...others, { path, action }] : others;
};
