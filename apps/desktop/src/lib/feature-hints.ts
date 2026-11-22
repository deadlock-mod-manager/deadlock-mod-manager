const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const HINTS_QUIET_PERIOD_MS = 3 * HOUR_MS;
export const HINT_MAX_IGNORES = 2;
export const HINT_IDLE_MS = 2000;

const FEATURE_HINTS = [
  { id: "import-from-manager", i18nKey: "importFromManager", minAgeDays: 0 },
  { id: "my-mods-menu", i18nKey: "myModsMenu", minAgeDays: 1 },
  { id: "mod-context-menu", i18nKey: "modContextMenu", minAgeDays: 1 },
  { id: "load-order", i18nKey: "loadOrder", minAgeDays: 0 },
  { id: "mod-repairs", i18nKey: "modRepairs", minAgeDays: 1 },
  { id: "find-broken-mod", i18nKey: "findBrokenMod", minAgeDays: 1 },
  {
    id: "mods-folder-shortcut",
    i18nKey: "modsFolderShortcut",
    minAgeDays: 0,
    shortcut: ["Ctrl", "M"],
  },
  { id: "profiles", i18nKey: "profiles", minAgeDays: 1 },
  {
    id: "remote-install",
    i18nKey: "remoteInstall",
    minAgeDays: 0,
    emote: "/brand/gamebanana.png",
  },
  {
    id: "settings-search",
    i18nKey: "settingsSearch",
    minAgeDays: 0,
    shortcut: ["Ctrl", "F"],
  },
  { id: "minimal-mode", i18nKey: "minimalMode", minAgeDays: 1 },
  { id: "custom-mod-sources", i18nKey: "customModSources", minAgeDays: 0 },
  { id: "randomized-groups", i18nKey: "randomizedGroups", minAgeDays: 1 },
  { id: "party-planner", i18nKey: "partyPlanner", minAgeDays: 0 },
  { id: "analyze-local-mods", i18nKey: "analyzeLocalMods", minAgeDays: 1 },
  { id: "performance-configs", i18nKey: "performanceConfigs", minAgeDays: 0 },
  { id: "server-picker", i18nKey: "serverPicker", minAgeDays: 0 },
  { id: "foundry", i18nKey: "foundry", minAgeDays: 0 },
  { id: "server-browser", i18nKey: "serverBrowser", minAgeDays: 0 },
  { id: "skin-randomizer", i18nKey: "skinRandomizer", minAgeDays: 1 },
  { id: "stats-customize", i18nKey: "statsCustomize", minAgeDays: 0 },
  {
    id: "nightly-channel",
    i18nKey: "nightlyChannel",
    minAgeDays: 2,
    emote: "/emotes/wicked.webp",
  },
] as const satisfies readonly {
  id: string;
  i18nKey: string;
  minAgeDays: number;
  shortcut?: readonly string[];
  emote?: string;
}[];

export type FeatureHint = (typeof FEATURE_HINTS)[number];
export type FeatureHintId = FeatureHint["id"];

export type FeatureHintCounter =
  | "settingsVisits"
  | "statsVisits"
  | "modsFolderOpens";

export type FeatureHintsProgress = {
  enabled: boolean;
  startedAt: number | null;
  firstSeenAt: Partial<Record<FeatureHintId, number>>;
  used: Partial<Record<FeatureHintId, true>>;
  retired: Partial<Record<FeatureHintId, true>>;
  ignoredCount: Partial<Record<FeatureHintId, number>>;
  counters: Partial<Record<FeatureHintCounter, number>>;
};

export const DEFAULT_FEATURE_HINTS_PROGRESS: FeatureHintsProgress = {
  enabled: true,
  startedAt: null,
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
  const firstSeenAt = progress.firstSeenAt[id];
  return (
    firstSeenAt !== undefined &&
    now - firstSeenAt >= getFeatureHint(id).minAgeDays * DAY_MS
  );
};
