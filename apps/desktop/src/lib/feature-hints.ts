const DAY_MS = 24 * 60 * 60 * 1000;

/** No hints until the user has had the app for this long. */
const HINTS_QUIET_PERIOD_MS = 3 * DAY_MS;
/** Minimum gap between two hints. */
const HINTS_COOLDOWN_MS = 3 * DAY_MS;
/** A hint closed without "Got it" this many times stops showing. */
export const HINT_MAX_IGNORES = 2;
/** How long the page has to sit without input before a hint appears. */
export const HINT_IDLE_MS = 2000;

// Ordered by priority: when several hints could show on the same page, the
// first one in this list wins.
const FEATURE_HINTS = [
  { id: "import-from-manager", i18nKey: "importFromManager", minAgeDays: 0 },
  { id: "my-mods-menu", i18nKey: "myModsMenu", minAgeDays: 7 },
  { id: "mod-context-menu", i18nKey: "modContextMenu", minAgeDays: 7 },
  { id: "load-order", i18nKey: "loadOrder", minAgeDays: 0 },
  { id: "mod-repairs", i18nKey: "modRepairs", minAgeDays: 7 },
  {
    id: "mods-folder-shortcut",
    i18nKey: "modsFolderShortcut",
    minAgeDays: 0,
    shortcut: ["Ctrl", "M"],
  },
  { id: "profiles", i18nKey: "profiles", minAgeDays: 7 },
  {
    id: "settings-search",
    i18nKey: "settingsSearch",
    minAgeDays: 0,
    shortcut: ["Ctrl", "F"],
  },
  { id: "skin-randomizer", i18nKey: "skinRandomizer", minAgeDays: 3 },
  { id: "stats-customize", i18nKey: "statsCustomize", minAgeDays: 0 },
  {
    id: "nightly-channel",
    i18nKey: "nightlyChannel",
    minAgeDays: 14,
    emote: "/emotes/wicked.webp",
  },
] as const satisfies readonly {
  id: string;
  i18nKey: string;
  minAgeDays: number;
  shortcut?: readonly string[];
  /** Decorative image shown next to the title. */
  emote?: string;
}[];

export type FeatureHint = (typeof FEATURE_HINTS)[number];
export type FeatureHintId = FeatureHint["id"];

/** Visits or clicks that make a count-based hint relevant. */
export type FeatureHintCounter =
  | "settingsVisits"
  | "statsVisits"
  | "modsFolderOpens";

export type FeatureHintsProgress = {
  enabled: boolean;
  /** When the user first finished onboarding with hints available. */
  startedAt: number | null;
  lastShownAt: number | null;
  /** First time each hint's control was on screen. */
  firstSeenAt: Partial<Record<FeatureHintId, number>>;
  used: Partial<Record<FeatureHintId, true>>;
  retired: Partial<Record<FeatureHintId, true>>;
  ignoredCount: Partial<Record<FeatureHintId, number>>;
  counters: Partial<Record<FeatureHintCounter, number>>;
};

export const DEFAULT_FEATURE_HINTS_PROGRESS: FeatureHintsProgress = {
  enabled: true,
  startedAt: null,
  lastShownAt: null,
  firstSeenAt: {},
  used: {},
  retired: {},
  ignoredCount: {},
  counters: {},
};

export const getFeatureHint = (id: FeatureHintId): FeatureHint => {
  const hint = FEATURE_HINTS.find((entry) => entry.id === id);
  if (!hint) {
    throw new Error(`Unknown feature hint: ${id}`);
  }
  return hint;
};

export const hintPriority = (id: FeatureHintId): number =>
  FEATURE_HINTS.findIndex((entry) => entry.id === id);

/**
 * Whether the persisted progress and timing rules allow `id` to show. Page
 * conditions such as "has 8 mods" are checked by the caller.
 */
export const canShowHint = (
  id: FeatureHintId,
  progress: FeatureHintsProgress,
  now: number,
): boolean => {
  if (!progress.enabled || progress.used[id] || progress.retired[id]) {
    return false;
  }
  if (
    progress.startedAt === null ||
    now - progress.startedAt < HINTS_QUIET_PERIOD_MS
  ) {
    return false;
  }
  if (
    progress.lastShownAt !== null &&
    now - progress.lastShownAt < HINTS_COOLDOWN_MS
  ) {
    return false;
  }
  const firstSeenAt = progress.firstSeenAt[id];
  return (
    firstSeenAt !== undefined &&
    now - firstSeenAt >= getFeatureHint(id).minAgeDays * DAY_MS
  );
};
