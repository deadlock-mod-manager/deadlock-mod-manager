import { isConvarPath } from "@/lib/performance/editor/values";
import type { ImportVariant } from "@/types/generated/ImportVariant";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";

/** Where each resolved entry of an import shows up in the review. */
type ImportReviewGroups = {
  /** ConVars the config writes. */
  willApply: ResolvedEntry[];
  /** ConVars the live file already sets to the config's value. */
  alreadySet: ResolvedEntry[];
  /** Camera and visibility settings: applied as the author set them unless turned off. */
  cameraVisibility: ResolvedEntry[];
  /** Flagged `gameinfo_cannot_override`: the game ignores them from gameinfo.gi. */
  blocked: ResolvedEntry[];
  /** Not a convar in this build (removed, or a console command). */
  removed: ResolvedEntry[];
  /** Refused, inexpressible as an edit, or turned off. */
  refused: ResolvedEntry[];
  /** Edits outside ConVars, only written when engine sections are included. */
  engineSections: ResolvedEntry[];
  /** Developer and debug tools, off unless enabled. */
  devtools: ResolvedEntry[];
  /** Sections and root keys that are never written. */
  excluded: ResolvedEntry[];
};

const writes = (entry: ResolvedEntry) =>
  entry.status === "applies" || entry.status === "unchanged";

const isCameraOrVisibility = (entry: ResolvedEntry) =>
  entry.gameplay === "camera" || entry.gameplay === "visibility";

/**
 * Sorts a resolved import into review groups. Toggle-dependent groups keep
 * their entries whichever way the toggle is set, so a group doesn't vanish
 * from the review when the user switches it.
 */
export const groupReviewEntries = (
  entries: ResolvedEntry[],
): ImportReviewGroups => {
  const groups: ImportReviewGroups = {
    willApply: [],
    alreadySet: [],
    cameraVisibility: [],
    blocked: [],
    removed: [],
    refused: [],
    engineSections: [],
    devtools: [],
    excluded: [],
  };

  for (const entry of entries) {
    if (
      isCameraOrVisibility(entry) &&
      (writes(entry) || entry.status === "omitted")
    ) {
      groups.cameraVisibility.push(entry);
    } else if (entry.gameplay === "devtools" && entry.status === "omitted") {
      groups.devtools.push(entry);
    } else if (entry.status === "excluded") {
      groups.excluded.push(entry);
    } else if (
      entry.status === "engineSection" ||
      (!isConvarPath(entry.path) && writes(entry))
    ) {
      groups.engineSections.push(entry);
    } else if (entry.status === "applies") {
      groups.willApply.push(entry);
    } else if (entry.status === "unchanged") {
      groups.alreadySet.push(entry);
    } else if (entry.status === "blocked") {
      groups.blocked.push(entry);
    } else if (entry.status === "removed" || entry.status === "notConvar") {
      groups.removed.push(entry);
    } else {
      groups.refused.push(entry);
    }
  }

  return groups;
};

/** `r_ssao`, `rate.max`, or `SceneSystem › CSMCascadeResolution`. */
export const entryDisplayName = (path: string[]) =>
  isConvarPath(path) ? path.slice(1).join(".") : path.join(" › ");

/** Engine sections by how many edits target them, most first. */
export const summarizeSections = (entries: ResolvedEntry[], shown = 3) => {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const section = entry.path[0];
    if (section) counts.set(section, (counts.get(section) ?? 0) + 1);
  }
  const sections = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([section]) => section);
  return {
    shown: sections.slice(0, shown),
    rest: Math.max(0, sections.length - shown),
  };
};

/** The build most of these entries were blocked or removed in, when known. */
export const commonSinceBuild = (entries: ResolvedEntry[]): number | null => {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const note = entry.notes.find(
      (candidate) => candidate.kind === "sinceBuild",
    );
    const build =
      note?.kind === "sinceBuild"
        ? note.build
        : (entry.meta?.statusSinceBuild ?? null);
    if (build !== null) counts.set(build, (counts.get(build) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [build, count] of counts) {
    if (count > bestCount) {
      best = build;
      bestCount = count;
    }
  }
  return best;
};

/** "Apr 28" for a stock build date; the year only when it isn't this year's. */
export const formatBuildDate = (
  date: string,
  locale: string,
  now = new Date(),
) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  if (parsed.getUTCFullYear() !== now.getUTCFullYear()) {
    options.year = "numeric";
  }
  return parsed.toLocaleDateString(locale, options);
};

/** Variants worth picking between: no translated copies, no video.txt files. */
export const pickableVariants = (variants: ImportVariant[]) =>
  variants.filter(
    (variant) => variant.duplicateOf === null && variant.format !== "videoTxt",
  );

export const describeArchiveExtras = (variants: ImportVariant[]) => ({
  duplicates: variants.filter((variant) => variant.duplicateOf !== null).length,
  hasVideoTxt: variants.some((variant) => variant.format === "videoTxt"),
});
