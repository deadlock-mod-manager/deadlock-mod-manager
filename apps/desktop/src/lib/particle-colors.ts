import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import type { ModdingParticleColor } from "@/types/generated/ModdingParticleColor";

export type ParticleRgb = ModdingParticleColor["rgb"];
export const particleHex = (rgb: ParticleRgb) =>
  `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
export function particleRgb(hex: string): ParticleRgb | null {
  const match = hex.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (!match?.[1]) return null;
  const value =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
export interface ParticleColorGroup {
  hex: string;
  rgb: ParticleRgb;
  fields: { file: string; color: ModdingParticleColor }[];
  files: string[];
}
export interface ParticleFileSelection {
  active: string;
  anchor: string;
  paths: Set<string>;
}
export function initialParticleSelection(
  files: ModdingParticleFile[],
  initialPath?: string,
): ParticleFileSelection {
  const active = files.find((file) => file.path === initialPath)?.path;
  return active
    ? { active, anchor: active, paths: new Set([active]) }
    : selectParticleFolder(files, "");
}

export function selectParticleFolder(
  files: ModdingParticleFile[],
  folder: string,
): ParticleFileSelection {
  const paths = files
    .filter((file) => particleInFolder(file.path, folder))
    .map((file) => file.path);
  const active = paths[0] ?? "";
  return { active, anchor: active, paths: new Set(paths) };
}
export function selectParticleFile(
  state: ParticleFileSelection,
  path: string,
  visible: string[],
  modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
): ParticleFileSelection {
  const additive = modifiers.ctrlKey || modifiers.metaKey;
  const anchor = visible.indexOf(state.anchor);
  const target = visible.indexOf(path);
  if (modifiers.shiftKey && anchor >= 0 && target >= 0) {
    const paths = new Set(additive ? state.paths : []);
    for (const item of visible.slice(
      Math.min(anchor, target),
      Math.max(anchor, target) + 1,
    ))
      paths.add(item);
    return { active: path, anchor: state.anchor, paths };
  }
  const paths = new Set(additive ? state.paths : []);
  if (additive && paths.has(path)) paths.delete(path);
  else paths.add(path);
  return { active: path, anchor: path, paths };
}
export function particleFolders(
  files: Iterable<ModdingParticleFile>,
): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index++)
      folders.add(parts.slice(0, index).join("/"));
  }
  return [...folders].sort();
}
export const particleInFolder = (path: string, folder: string) =>
  !folder || path.startsWith(`${folder}/`);
export function recolorParticleFiles(
  files: ModdingParticleFile[],
  rgb: ParticleRgb,
) {
  return files
    .filter((file) => !file.diagnostic)
    .map((file) => ({
      path: file.path,
      text: file.text,
      changes: file.colors
        .filter((color) =>
          color.rgb.some((channel, index) => channel !== rgb[index]),
        )
        .map((color) => ({ path: color.path, rgb })),
    }))
    .filter((file) => file.changes.length);
}

export interface ParticleColorDraft {
  selection: string;
  hex: string;
  threshold: number;
  all: boolean;
}

export const emptyParticleColorDraft = (): ParticleColorDraft => ({
  selection: "",
  hex: "#ff8800",
  threshold: 0,
  all: false,
});

export function planParticleColors(
  files: ModdingParticleFile[],
  rgb: ParticleRgb,
  fields?: { file: string; path: string }[],
) {
  const allowed = new Map<string, Set<string>>();
  for (const field of fields ?? []) {
    let paths = allowed.get(field.file);
    if (!paths) {
      paths = new Set();
      allowed.set(field.file, paths);
    }
    paths.add(field.path);
  }
  const edits = recolorParticleFiles(files, rgb)
    .map((edit) => ({
      path: edit.path,
      text: edit.text,
      changes: fields
        ? edit.changes.filter((change) =>
            allowed.get(edit.path)?.has(change.path),
          )
        : edit.changes,
    }))
    .filter((edit) => edit.changes.length > 0);
  return {
    edits,
    files: edits.map((edit) => edit.path),
    fields: edits.reduce((sum, edit) => sum + edit.changes.length, 0),
  };
}
export function sharedParticleColors(
  files: Iterable<ModdingParticleFile>,
  threshold: number,
): ParticleColorGroup[] {
  const exact = new Map<
    string,
    { group: ParticleColorGroup; paths: Set<string> }
  >();
  for (const file of files) {
    for (const color of file.colors) {
      const hex = particleHex(color.rgb);
      let entry = exact.get(hex);
      if (!entry) {
        entry = {
          group: { hex, rgb: color.rgb, fields: [], files: [] },
          paths: new Set(),
        };
        exact.set(hex, entry);
      }
      entry.group.fields.push({ file: file.path, color });
      entry.paths.add(file.path);
    }
  }
  const groups: ParticleColorGroup[] = [];
  for (const { group, paths } of [...exact.values()].sort((a, b) =>
    a.group.hex.localeCompare(b.group.hex),
  )) {
    group.files = [...paths];
    const match =
      threshold > 0
        ? groups.find(
            (candidate) =>
              (Math.hypot(
                ...candidate.rgb.map(
                  (channel, index) => channel - (group.rgb[index] ?? 0),
                ),
              ) /
                Math.sqrt(3 * 255 ** 2)) *
                100 <=
              threshold,
          )
        : undefined;
    if (match) {
      match.fields.push(...group.fields);
      match.files = [...new Set([...match.files, ...group.files])];
    } else groups.push(group);
  }
  return groups
    .filter((group) => group.files.length > 1)
    .sort(
      (a, b) => b.fields.length - a.fields.length || a.hex.localeCompare(b.hex),
    );
}

interface ParticleHistoryChange {
  before: ModdingParticleFile;
  after: ModdingParticleFile;
}
interface ParticleHistoryEntry {
  label: string;
  at: number;
  changes: ParticleHistoryChange[];
}
export interface ParticleSession {
  files: Map<string, ModdingParticleFile>;
  baseline: Map<string, ModdingParticleFile>;
  past: ParticleHistoryEntry[];
  future: ParticleHistoryEntry[];
  sequence: number;
  log: { id: number; label: string; at: number; count: number }[];
}
export function particleSession(files: ModdingParticleFile[]): ParticleSession {
  const documents = new Map(files.map((file) => [file.path, file]));
  return {
    files: documents,
    baseline: documents,
    past: [],
    future: [],
    log: [],
    sequence: 0,
  };
}
export type ParticleAction =
  | { type: "edit"; files: ModdingParticleFile[]; label: string; at: number }
  | { type: "undo" | "redo"; label?: string; at?: number }
  | { type: "saved"; label: string; at: number; paths: string[] }
  | { type: "reload"; files: ModdingParticleFile[] };
export function particleReducer(
  state: ParticleSession,
  action: ParticleAction,
): ParticleSession {
  if (action.type === "reload") return particleSession(action.files);
  if (action.type === "saved") {
    const baseline = new Map(state.baseline);
    for (const path of action.paths) {
      const file = state.files.get(path);
      if (file) baseline.set(path, file);
    }
    return {
      ...state,
      baseline,
      sequence: state.sequence + 1,
      log: [
        ...state.log,
        {
          id: state.sequence,
          label: action.label,
          at: action.at,
          count: action.paths.length,
        },
      ].slice(-100),
    };
  }
  if (action.type === "edit") {
    const changes = action.files.flatMap((after) => {
      const before = state.files.get(after.path);
      return before && before.text !== after.text ? [{ before, after }] : [];
    });
    if (!changes.length) return state;
    const files = new Map(state.files);
    for (const change of changes) files.set(change.after.path, change.after);
    const past = [
      ...state.past,
      { label: action.label, at: action.at, changes },
    ];
    let bytes = past.reduce(
      (sum, entry) =>
        sum +
        entry.changes.reduce(
          (total, change) =>
            total + (change.before.text.length + change.after.text.length) * 2,
          0,
        ),
      0,
    );
    while (past.length > 1 && (past.length > 50 || bytes > 32 * 1024 * 1024)) {
      const removed = past.shift();
      if (removed)
        bytes -= removed.changes.reduce(
          (sum, change) =>
            sum + (change.before.text.length + change.after.text.length) * 2,
          0,
        );
    }
    return {
      ...state,
      files,
      past,
      future: [],
      sequence: state.sequence + 1,
      log: [
        ...state.log,
        {
          id: state.sequence,
          label: action.label,
          at: action.at,
          count: changes.length,
        },
      ].slice(-100),
    };
  }
  const entry =
    action.type === "undo" ? state.past.at(-1) : state.future.at(-1);
  if (!entry) return state;
  const files = new Map(state.files);
  for (const change of entry.changes)
    files.set(
      change.before.path,
      action.type === "undo" ? change.before : change.after,
    );
  const log = action.label
    ? [
        ...state.log,
        {
          id: state.sequence,
          label: action.label,
          at: action.at ?? entry.at,
          count: entry.changes.length,
        },
      ].slice(-100)
    : state.log;
  const sequence = action.label ? state.sequence + 1 : state.sequence;
  return action.type === "undo"
    ? {
        ...state,
        files,
        log,
        sequence,
        past: state.past.slice(0, -1),
        future: [...state.future, entry],
      }
    : {
        ...state,
        files,
        log,
        sequence,
        future: state.future.slice(0, -1),
        past: [...state.past, entry],
      };
}
export const dirtyParticleFiles = (state: ParticleSession) =>
  [...state.files.values()].filter(
    (file) => file.text !== state.baseline.get(file.path)?.text,
  );
