import { pathKey } from "@/lib/performance/request";
import type { ConvarKind } from "@/types/generated/ConvarKind";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { OverrideAction } from "@/types/generated/OverrideAction";
import { sameValue } from "./values";

/** The editor's working copy of a config's tweaks, before Apply saves it. */
export type EditorDraft = {
  overrides: EntryOverride[];
  includeEngineSections: boolean;
};

export type DraftAction =
  | { kind: "set"; path: string[]; value: string }
  | { kind: "omit"; path: string[] }
  | { kind: "enable"; path: string[] }
  | { kind: "reset"; path: string[] }
  | { kind: "includeEngineSections"; include: boolean };

/** What the editor needs to know about an entry to turn a picked value into an override. */
export type ValueTarget = {
  path: string[];
  configValue: string | null;
  kind: ConvarKind | null;
  /** Developer tools are off unless enabled, so going back to the config's value keeps them on. */
  offByDefault: boolean;
};

type OverrideChange = {
  path: string[];
  before: OverrideAction | null;
  after: OverrideAction | null;
};

const toOverrideAction = (
  action: Extract<DraftAction, { kind: "set" | "omit" | "enable" }>,
): OverrideAction => {
  if (action.kind === "set") return { kind: "set", value: action.value };
  return action.kind === "omit" ? { kind: "omit" } : { kind: "enable" };
};

export const applyDraftAction = (
  draft: EditorDraft,
  action: DraftAction,
): EditorDraft => {
  if (action.kind === "includeEngineSections") {
    return { ...draft, includeEngineSections: action.include };
  }
  const key = pathKey(action.path);
  const index = draft.overrides.findIndex(
    (override) => pathKey(override.path) === key,
  );
  if (action.kind === "reset") {
    if (index === -1) return draft;
    return {
      ...draft,
      overrides: draft.overrides.filter((_, position) => position !== index),
    };
  }
  const next: EntryOverride = {
    path: index === -1 ? action.path : draft.overrides[index].path,
    action: toOverrideAction(action),
  };
  if (index === -1) {
    return { ...draft, overrides: [...draft.overrides, next] };
  }
  const overrides = draft.overrides.slice();
  overrides[index] = next;
  return { ...draft, overrides };
};

/** Picking the config's own value drops the override instead of storing a no-op. */
export const actionForValue = (
  target: ValueTarget,
  value: string,
): DraftAction => {
  const matchesConfig =
    target.configValue !== null &&
    sameValue(value, target.configValue, target.kind);
  if (!matchesConfig) return { kind: "set", path: target.path, value };
  return target.offByDefault
    ? { kind: "enable", path: target.path }
    : { kind: "reset", path: target.path };
};

export const overridesByKey = (
  overrides: EntryOverride[],
): Map<string, EntryOverride> =>
  new Map(overrides.map((override) => [pathKey(override.path), override]));

const sameAction = (a: OverrideAction, b: OverrideAction) =>
  a.kind === "set" && b.kind === "set"
    ? a.value === b.value
    : a.kind === b.kind;

/** Per-path differences between saved and draft overrides; order doesn't matter. */
export const diffOverrides = (
  saved: EntryOverride[],
  draft: EntryOverride[],
): OverrideChange[] => {
  const savedByKey = overridesByKey(saved);
  const draftByKey = overridesByKey(draft);
  const changes: OverrideChange[] = [];
  for (const [key, after] of draftByKey) {
    const before = savedByKey.get(key);
    if (!before || !sameAction(before.action, after.action)) {
      changes.push({
        path: after.path,
        before: before?.action ?? null,
        after: after.action,
      });
    }
  }
  for (const [key, before] of savedByKey) {
    if (!draftByKey.has(key)) {
      changes.push({ path: before.path, before: before.action, after: null });
    }
  }
  return changes;
};

export const sameOverrides = (a: EntryOverride[], b: EntryOverride[]) =>
  diffOverrides(a, b).length === 0;

export const countUnsavedChanges = (
  saved: EditorDraft,
  draft: EditorDraft,
): number =>
  diffOverrides(saved.overrides, draft.overrides).length +
  (saved.includeEngineSections === draft.includeEngineSections ? 0 : 1);
