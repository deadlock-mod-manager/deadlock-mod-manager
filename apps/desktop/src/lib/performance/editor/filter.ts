import { pathKey } from "@/lib/performance/request";
import type { CategoryInfo } from "@/types/generated/CategoryInfo";
import type { EntryStatus } from "@/types/generated/EntryStatus";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { entryKeyLabel, isConvarPath } from "./values";

export type EditorFilter = "differs" | "changed" | "attention" | "all";

export type EntryQuery = {
  search: string;
  filter: EditorFilter;
  /** Path keys the draft overrides. */
  changedKeys: ReadonlySet<string>;
};

export type CategoryGroup = {
  id: string;
  label: string;
  /** Entries passing the query, active ones first. */
  entries: ResolvedEntry[];
  /** Counts over every entry in the category, ignoring the query. */
  total: number;
  differs: number;
  changed: number;
  attention: number;
};

/** The config asks for something the game won't do at all. */
const ATTENTION_STATUSES: ReadonlySet<EntryStatus> = new Set([
  "blocked",
  "removed",
  "notConvar",
  "denied",
  "unsupported",
]);

/** Never written whatever the user does, so the row is read-only. */
const INERT_STATUSES: ReadonlySet<EntryStatus> = new Set([
  "blocked",
  "removed",
  "notConvar",
  "excluded",
  "denied",
  "unsupported",
]);

export const needsAttention = (entry: Pick<ResolvedEntry, "status">) =>
  ATTENTION_STATUSES.has(entry.status);

/**
 * The entry does something beyond the game's own value. Leaves out lines that
 * match the game and developer tools nobody enabled.
 */
export const differsFromGame = (
  entry: Pick<ResolvedEntry, "status" | "overridden">,
) =>
  entry.status !== "unchanged" &&
  !(entry.status === "omitted" && !entry.overridden);

export const isInert = (entry: Pick<ResolvedEntry, "status">) =>
  INERT_STATUSES.has(entry.status);

/** Edits outside ConVars that the include-engine-sections toggle controls. */
export const isEngineSectionEntry = (
  entry: Pick<ResolvedEntry, "path" | "status">,
) =>
  !isConvarPath(entry.path) &&
  entry.status !== "excluded" &&
  entry.status !== "denied";

export const matchesSearch = (entry: ResolvedEntry, search: string) => {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    entry.meta?.label,
    entryKeyLabel(entry.path),
    entry.meta?.help,
    entry.meta?.description,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const matchesQuery = (
  entry: ResolvedEntry,
  key: string,
  { search, filter, changedKeys }: EntryQuery,
) => {
  if (filter === "differs" && !differsFromGame(entry)) return false;
  if (filter === "changed" && !changedKeys.has(key)) return false;
  if (filter === "attention" && !needsAttention(entry)) return false;
  return matchesSearch(entry, search);
};

const emptyGroup = (id: string, label: string): CategoryGroup => ({
  id,
  label,
  entries: [],
  total: 0,
  differs: 0,
  changed: 0,
  attention: 0,
});

/**
 * Groups entries by the catalog's categories, in the catalog's order. Unknown
 * category ids get their own group at the end so nothing is hidden.
 */
export const groupEntries = (
  entries: ResolvedEntry[],
  categories: CategoryInfo[],
  query: EntryQuery,
): CategoryGroup[] => {
  const groups = new Map<string, CategoryGroup>(
    categories.map((category) => [
      category.id,
      emptyGroup(category.id, category.label),
    ]),
  );
  for (const entry of entries) {
    let group = groups.get(entry.category);
    if (!group) {
      group = emptyGroup(entry.category, entry.category);
      groups.set(entry.category, group);
    }
    const key = pathKey(entry.path);
    group.total += 1;
    if (differsFromGame(entry)) group.differs += 1;
    if (query.changedKeys.has(key)) group.changed += 1;
    if (needsAttention(entry)) group.attention += 1;
    if (matchesQuery(entry, key, query)) group.entries.push(entry);
  }
  for (const group of groups.values()) {
    group.entries.sort((a, b) => Number(isInert(a)) - Number(isInert(b)));
  }
  return [...groups.values()];
};

export type FilterCounts = Record<EditorFilter, number>;

export const filterCounts = (groups: CategoryGroup[]): FilterCounts =>
  groups.reduce(
    (counts, group) => ({
      all: counts.all + group.total,
      differs: counts.differs + group.differs,
      changed: counts.changed + group.changed,
      attention: counts.attention + group.attention,
    }),
    { all: 0, differs: 0, changed: 0, attention: 0 },
  );
