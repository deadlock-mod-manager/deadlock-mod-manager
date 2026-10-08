import type { AnalyticsOperations } from "@/lib/analytics/schema";
import type { UserPerfConfig } from "@/lib/store/slices/performance";
import type { CatalogSummary } from "@/types/generated/CatalogSummary";
import type { CommunityConfigSummary } from "@/types/generated/CommunityConfigSummary";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ImportSource } from "@/types/generated/ImportSource";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import type { PerfTier } from "@/types/generated/PerfTier";
import type { PresetSummary } from "@/types/generated/PresetSummary";
import type { ResolvedCounts } from "@/types/generated/ResolvedCounts";
import {
  presetApplyRequest,
  presetConfigId,
  presetIdFromConfigId,
  userConfigApplyRequest,
} from "./request";
import { tierForScore } from "./scale";

export type ConfigSourceFilter = "all" | "curated" | "gamebanana" | "yours";

export const CONFIG_SOURCE_FILTERS: readonly ConfigSourceFilter[] = [
  "all",
  "curated",
  "gamebanana",
  "yours",
];

export type ConfigSort = "downloads" | "name" | "looksToFrames";

export const CONFIG_SORTS: readonly ConfigSort[] = [
  "downloads",
  "name",
  "looksToFrames",
];

export type PresetListItem = {
  kind: "preset";
  configId: string;
  name: string;
  tier: PerfTier;
  cutScore: number;
  preset: PresetSummary;
};

export type CommunityListItem = {
  kind: "community";
  configId: string;
  name: string;
  tier: PerfTier;
  cutScore: number;
  community: CommunityConfigSummary;
  /** The user's own copy, when they already downloaded and imported it. */
  imported: UserPerfConfig | null;
};

export type UserListItem = {
  kind: "user";
  configId: string;
  name: string;
  /** Known when the config descends from a preset or a GameBanana config, or is the active one. */
  tier: PerfTier | null;
  cutScore: number | null;
  config: UserPerfConfig;
};

export type ConfigListItem = PresetListItem | CommunityListItem | UserListItem;

/** GameBanana configs have no entries until imported, so they get their own id namespace. */
const communityConfigId = (communityId: string) => `community:${communityId}`;

type ParsedConfigId =
  | { kind: "preset"; id: string }
  | { kind: "community"; id: string }
  | { kind: "user"; id: string };

export const parseConfigId = (configId: string): ParsedConfigId | null => {
  const presetId = presetIdFromConfigId(configId);
  if (presetId !== null) return { kind: "preset", id: presetId };
  if (configId.startsWith("community:")) {
    return { kind: "community", id: configId.slice("community:".length) };
  }
  if (configId.startsWith("user:")) return { kind: "user", id: configId };
  return null;
};

/** GameBanana configs reach the user through the import review, never directly. */
export const gameBananaImportSource = (
  community: CommunityConfigSummary,
): ImportSource => ({
  kind: "gameBanana",
  mod_id: community.gamebananaId,
  file_id: community.fileId,
});

/** Settings in a config that the current game build doesn't read. */
export const unusedCount = (counts: ResolvedCounts) =>
  counts.blocked + counts.removed + counts.notConvar;

/** The newest of the user's imports of a GameBanana submission. */
const findImportedCommunityConfig = (
  userConfigs: UserPerfConfig[],
  gamebananaId: number,
): UserPerfConfig | null =>
  userConfigs
    .filter(
      (config) =>
        config.origin.kind === "gamebanana" &&
        config.origin.gamebananaId === gamebananaId,
    )
    .reduce<UserPerfConfig | null>(
      (newest, config) =>
        newest === null || config.createdAt > newest.createdAt
          ? config
          : newest,
      null,
    );

type Placement = { tier: PerfTier; cutScore: number };

const placementOf = (
  config: UserPerfConfig,
  catalog: CatalogSummary | undefined,
  userConfigs: Record<string, UserPerfConfig>,
): Placement | null => {
  const { origin } = config;
  const presetPlacement = (presetId: string | null) => {
    const preset = catalog?.presets.find((item) => item.id === presetId);
    return preset ? { tier: preset.tier, cutScore: preset.cutScore } : null;
  };
  switch (origin.kind) {
    case "gamebanana": {
      const community = catalog?.community.find(
        (item) => item.gamebananaId === origin.gamebananaId,
      );
      return community
        ? { tier: community.tier, cutScore: community.cutScore }
        : null;
    }
    case "shareCode":
      return presetPlacement(origin.presetId);
    case "fork": {
      const presetId = presetIdFromConfigId(origin.fromConfigId);
      if (presetId !== null) return presetPlacement(presetId);
      const parent = userConfigs[origin.fromConfigId];
      return parent ? placementOf(parent, catalog, userConfigs) : null;
    }
    default:
      return null;
  }
};

type ActivePlacement = { configId: string; cutScore: number };

/**
 * Presets, GameBanana configs and the user's own configs as one list. User
 * configs inherit the tier of the preset or GameBanana config they came from;
 * the active config uses its resolved cut score when it has nothing better.
 */
export const buildConfigList = (
  catalog: CatalogSummary | undefined,
  userConfigs: Record<string, UserPerfConfig>,
  active: ActivePlacement | null,
): ConfigListItem[] => {
  const userList = Object.values(userConfigs);
  const presets: ConfigListItem[] = (catalog?.presets ?? []).map((preset) => ({
    kind: "preset",
    configId: presetConfigId(preset.id),
    name: preset.name,
    tier: preset.tier,
    cutScore: preset.cutScore,
    preset,
  }));
  const community: ConfigListItem[] = (catalog?.community ?? []).map(
    (item) => ({
      kind: "community",
      configId: communityConfigId(item.id),
      name: item.name,
      tier: item.tier,
      cutScore: item.cutScore,
      community: item,
      imported: findImportedCommunityConfig(userList, item.gamebananaId),
    }),
  );
  const yours: ConfigListItem[] = userList.map((config) => {
    const placement =
      placementOf(config, catalog, userConfigs) ??
      (active?.configId === config.id
        ? {
            tier: tierForScore(active.cutScore).id,
            cutScore: active.cutScore,
          }
        : null);
    return {
      kind: "user",
      configId: config.id,
      name: config.name,
      tier: placement?.tier ?? null,
      cutScore: placement?.cutScore ?? null,
      config,
    };
  });
  return [...presets, ...community, ...yours];
};

const representedByCommunityCard = (items: ConfigListItem[]) =>
  new Set(
    items.flatMap((item) =>
      item.kind === "community" && item.imported ? [item.imported.id] : [],
    ),
  );

const matchesSource = (
  item: ConfigListItem,
  source: ConfigSourceFilter,
  hiddenInAll: Set<string>,
) => {
  switch (source) {
    case "all":
      return !hiddenInAll.has(item.configId);
    case "curated":
      return item.kind === "preset";
    case "gamebanana":
      return item.kind === "community";
    case "yours":
      return item.kind === "user";
  }
};

/**
 * "All" leaves out the user's copy of a GameBanana config, because that
 * config's card already offers to apply it.
 */
export const filterConfigs = (
  items: ConfigListItem[],
  { source, tier }: { source: ConfigSourceFilter; tier: PerfTier | null },
): ConfigListItem[] => {
  const hiddenInAll = representedByCommunityCard(items);
  return items.filter(
    (item) =>
      matchesSource(item, source, hiddenInAll) &&
      (tier === null || item.tier === tier),
  );
};

export const sourceCounts = (items: ConfigListItem[], tier: PerfTier | null) =>
  ({
    all: filterConfigs(items, { source: "all", tier }).length,
    curated: filterConfigs(items, { source: "curated", tier }).length,
    gamebanana: filterConfigs(items, { source: "gamebanana", tier }).length,
    yours: filterConfigs(items, { source: "yours", tier }).length,
  }) satisfies Record<ConfigSourceFilter, number>;

const KIND_ORDER = {
  preset: 0,
  community: 1,
  user: 2,
} satisfies Record<ConfigListItem["kind"], number>;

const byName = (a: ConfigListItem, b: ConfigListItem) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * Presets have no download counts: they keep their catalog order (recommended
 * first) ahead of GameBanana configs, and the user's own configs come last,
 * newest first.
 */
const byDownloads = (a: ConfigListItem, b: ConfigListItem) => {
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.kind === "preset" && b.kind === "preset") {
    return Number(b.preset.recommended) - Number(a.preset.recommended);
  }
  if (a.kind === "community" && b.kind === "community") {
    return b.community.downloads - a.community.downloads;
  }
  if (a.kind === "user" && b.kind === "user") {
    return b.config.createdAt.localeCompare(a.config.createdAt);
  }
  return 0;
};

const byCutScore = (a: ConfigListItem, b: ConfigListItem) => {
  if (a.cutScore === null && b.cutScore === null) return byName(a, b);
  if (a.cutScore === null) return 1;
  if (b.cutScore === null) return -1;
  return a.cutScore - b.cutScore || byName(a, b);
};

const COMPARATORS = {
  downloads: byDownloads,
  name: byName,
  looksToFrames: byCutScore,
} satisfies Record<
  ConfigSort,
  (a: ConfigListItem, b: ConfigListItem) => number
>;

export const sortConfigs = (
  items: ConfigListItem[],
  sort: ConfigSort,
): ConfigListItem[] => [...items].sort(COMPARATORS[sort]);

/** A config with entries we can apply: a preset or one of the user's own. */
export type ApplicableConfig =
  | { kind: "preset"; preset: PresetSummary }
  | { kind: "user"; config: UserPerfConfig };

export const applicableConfigId = (config: ApplicableConfig) =>
  config.kind === "preset"
    ? presetConfigId(config.preset.id)
    : config.config.id;

export const applyRequestFor = (
  config: ApplicableConfig,
  options: { overrides: EntryOverride[]; includeEngineSections: boolean },
): PerfApplyRequest =>
  config.kind === "preset"
    ? presetApplyRequest(config.preset, options)
    : userConfigApplyRequest(config.config, options);

type ApplySource =
  AnalyticsOperations["performance_config_apply"]["start"]["source"];

/**
 * How analytics labels a config being applied. A user config that no longer
 * exists counts as "custom", like a fork, since its origin is unknown.
 */
export const applySourceFor = (
  configId: string,
  userConfigs: Record<string, UserPerfConfig>,
): ApplySource => {
  if (presetIdFromConfigId(configId) !== null) return "preset";
  const origin = userConfigs[configId]?.origin;
  if (!origin || origin.kind === "fork") return "custom";
  return origin.kind === "gamebanana" ? "community" : "imported";
};
