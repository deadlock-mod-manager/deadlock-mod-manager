import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { OverrideAction } from "@/types/generated/OverrideAction";
import { sameOverrides } from "./editor/draft";
import { pathKey } from "./request";

export const findOverride = (
  overrides: EntryOverride[],
  path: string[],
): EntryOverride | null => {
  const key = pathKey(path);
  return overrides.find((override) => pathKey(override.path) === key) ?? null;
};

/** Developer and hideout tools stay off unless the user enables them or sets a value. */
export const isDevtoolEnabled = (override: EntryOverride | null | undefined) =>
  override?.action.kind === "enable" || override?.action.kind === "set";

/** Whether two requests carry the same tweaks, ignoring their order. */
export const sameApplyOptions = (
  a: { overrides: EntryOverride[]; includeEngineSections: boolean },
  b: { overrides: EntryOverride[]; includeEngineSections: boolean },
) =>
  a.includeEngineSections === b.includeEngineSections &&
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
