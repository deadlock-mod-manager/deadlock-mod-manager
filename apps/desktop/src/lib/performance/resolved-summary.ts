import type { CategoryInfo } from "@/types/generated/CategoryInfo";
import type { EntryStatus } from "@/types/generated/EntryStatus";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { isConvarPath } from "./editor/values";

export const UNREAD_STATUSES: ReadonlySet<EntryStatus> = new Set([
  "blocked",
  "removed",
  "notConvar",
]);

export const LEFT_OUT_STATUSES: ReadonlySet<EntryStatus> = new Set([
  "denied",
  "excluded",
  "unsupported",
]);

const ENGINE_EDIT_STATUSES: ReadonlySet<EntryStatus> = new Set([
  "engineSection",
  "applies",
  "unchanged",
]);

const NOT_WRITTEN_STATUSES: ReadonlySet<EntryStatus> = new Set([
  ...LEFT_OUT_STATUSES,
  "engineSection",
]);

export const entriesWithStatus = (
  entries: ResolvedEntry[],
  statuses: ReadonlySet<EntryStatus>,
) => entries.filter((entry) => statuses.has(entry.status));

type CategoryComparisonRow = {
  id: string;
  label: string;
  config: number;
  current: number | null;
};

const writtenByCategory = (entries: ResolvedEntry[]) => {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status !== "applies") continue;
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return counts;
};

export const compareCategories = (
  categories: CategoryInfo[],
  configEntries: ResolvedEntry[],
  currentEntries: ResolvedEntry[] | null,
): CategoryComparisonRow[] => {
  const config = writtenByCategory(configEntries);
  const current = currentEntries ? writtenByCategory(currentEntries) : null;
  const ids = new Set([
    ...categories.map((category) => category.id),
    ...config.keys(),
    ...(current?.keys() ?? []),
  ]);
  return [...ids]
    .map((id) => ({
      id,
      label: categories.find((category) => category.id === id)?.label ?? id,
      config: config.get(id) ?? 0,
      current: current ? (current.get(id) ?? 0) : null,
    }))
    .filter((row) => row.config > 0 || (row.current ?? 0) > 0)
    .sort((a, b) => b.config - a.config || (b.current ?? 0) - (a.current ?? 0));
};

export const engineSectionEdits = (entries: ResolvedEntry[]) => {
  const edits = entries.filter(
    (entry) =>
      !isConvarPath(entry.path) && ENGINE_EDIT_STATUSES.has(entry.status),
  );
  const sections = new Map<string, string>();
  for (const { path } of edits) {
    const section = path[0];
    if (section && !sections.has(section.toLowerCase())) {
      sections.set(section.toLowerCase(), section);
    }
  }
  return { count: edits.length, sections: [...sections.values()], edits };
};

export const authorViewEntries = (entries: ResolvedEntry[]) =>
  entries.filter(
    (entry) =>
      (entry.gameplay === "camera" || entry.gameplay === "visibility") &&
      (entry.status === "applies" || entry.status === "omitted"),
  );

export const devtoolEntries = (entries: ResolvedEntry[]) =>
  entries.filter(
    (entry) =>
      entry.gameplay === "devtools" && !NOT_WRITTEN_STATUSES.has(entry.status),
  );
