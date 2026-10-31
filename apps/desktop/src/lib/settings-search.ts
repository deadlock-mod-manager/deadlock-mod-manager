import type { Platform } from "@tauri-apps/plugin-os";
import { EXPERIMENTAL_FEATURES } from "@/lib/constants";

export const SETTINGS_TAB_LABEL_KEYS = {
  "launch-options": "settings.launchOptions",
  autoexec: "settings.autoexec",
  game: "settings.game",
  mods: "settings.mods",
  application: "settings.application",
  themes: "settings.themes",
  network: "settings.network",
  integrations: "settings.integrations",
  plugin: "settings.plugin",
  discord: "settings.discord",
  tools: "settings.tools",
  backups: "settings.backups",
  logging: "settings.logging",
  experimental: "settings.experimental",
  "match-data": "matchSync.title",
  privacy: "settings.privacy",
  about: "settings.information",
} as const;

type SettingsTab = keyof typeof SETTINGS_TAB_LABEL_KEYS;

/** Former settings tabs that now have their own page; their results open it. */
const SETTINGS_TAB_ROUTES = new Map<SettingsTab, string>([
  ["plugin", "/plugins/manage"],
]);

type SearchableText = {
  titleKey: string;
  descriptionKey?: string;
  /** Platforms that render this setting. Omitted when every platform does. */
  platforms?: Platform[];
};

export type SettingsSearchSection = SearchableText & {
  /** Anchor rendered by `<Section searchId>`; omitted when the tab is the target. */
  id?: string;
  tab: SettingsTab;
  settings?: SearchableText[];
};

export type SettingsSearchResult = {
  tab: SettingsTab;
  /** Set when the result lives on another page instead of a settings tab. */
  route?: string;
  sectionId?: string;
  titleKey: string;
  title: string;
  breadcrumb: string;
};

export const SETTINGS_SEARCH_INDEX: SettingsSearchSection[] = [
  {
    tab: "launch-options",
    titleKey: "settings.launchOptions",
    descriptionKey: "settings.launchOptionsDescription",
    settings: [{ titleKey: "gamePresence.condebugOption" }],
  },
  {
    tab: "autoexec",
    titleKey: "settings.autoexec",
    descriptionKey: "settings.autoexecDescription",
  },
  {
    id: "game-path",
    tab: "game",
    titleKey: "settings.gamePath",
    descriptionKey: "settings.gamePathDescription",
  },
  {
    id: "steam-path",
    tab: "game",
    titleKey: "settings.steamPath",
    descriptionKey: "settings.steamPathSectionDescription",
  },
  {
    id: "game-config",
    tab: "game",
    titleKey: "settings.gameConfigManagement",
    descriptionKey: "settings.gameConfigDescription",
    settings: [
      { titleKey: "game.createBackup" },
      { titleKey: "game.restoreBackup" },
      { titleKey: "game.resetToVanilla" },
      {
        titleKey: "settings.autoResetGameinfo",
        descriptionKey: "settings.autoResetGameinfoDescription",
      },
      { titleKey: "game.validateConfiguration" },
    ],
  },
  {
    id: "game-guard",
    tab: "game",
    titleKey: "settings.gameGuardSectionTitle",
    descriptionKey: "settings.gameGuardSectionDescription",
    settings: [
      {
        titleKey: "settings.gameGuard",
        descriptionKey: "settings.gameGuardDescription",
      },
      {
        titleKey: "launchHealth.settings.title",
        descriptionKey: "launchHealth.settings.description",
      },
    ],
  },
  {
    id: "hero-parser",
    tab: "game",
    titleKey: "heroParser.settingsTitle",
    descriptionKey: "heroParser.settingsDescription",
  },
  {
    id: "mod-installing",
    tab: "mods",
    titleKey: "settings.modInstallingSectionTitle",
    descriptionKey: "settings.modInstallingSectionDescription",
    settings: [
      {
        titleKey: "settings.autoReapplyMods",
        descriptionKey: "settings.autoReapplyModsDescription",
      },
      {
        titleKey: "settings.heroConflictWarning",
        descriptionKey: "settings.heroConflictWarningDescription",
      },
    ],
  },
  {
    id: "mod-repair",
    tab: "mods",
    titleKey: "settings.modRepairSectionTitle",
    descriptionKey: "settings.modRepairSectionDescription",
    settings: [
      {
        titleKey: "settings.autoFixMods",
        descriptionKey: "settings.autoFixModsDescription",
      },
    ],
  },
  {
    id: "hero-skins",
    tab: "mods",
    titleKey: "settings.heroSkins",
    descriptionKey: "settings.heroSkinsDescription",
    settings: [
      {
        titleKey: "settings.multipleSkins",
        descriptionKey: "settings.multipleSkinsDescription",
      },
      {
        titleKey: "settings.heroExtras",
        descriptionKey: "settings.heroExtrasDescription",
      },
    ],
  },
  {
    id: "mod-browsing",
    tab: "mods",
    titleKey: "settings.modBrowsingSectionTitle",
    descriptionKey: "settings.modBrowsingSectionDescription",
    settings: [
      {
        titleKey: "settings.defaultSort",
        descriptionKey: "settings.defaultSortDescription",
      },
      {
        titleKey: "settings.modsStorePagination",
        descriptionKey: "settings.modsStorePaginationDescription",
      },
      {
        titleKey: "settings.showModUpdateBadges",
        descriptionKey: "settings.showModUpdateBadgesDescription",
      },
    ],
  },
  {
    id: "download-cache-location",
    tab: "mods",
    titleKey: "settings.downloadCacheLocation",
    descriptionKey: "settings.downloadCacheLocationDescription",
  },
  {
    id: "system",
    tab: "application",
    titleKey: "settings.systemSettings",
    descriptionKey: "settings.systemSettingsDescription",
    settings: [
      {
        titleKey: "settings.launchVanillaNoArgs",
        descriptionKey: "settings.launchVanillaNoArgsDescription",
      },
      {
        titleKey: "settings.minimizeToTray",
        descriptionKey: "settings.minimizeToTrayDescription",
        platforms: ["windows", "macos"],
      },
      {
        titleKey: "settings.closeToTray",
        descriptionKey: "settings.closeToTrayDescription",
        platforms: ["windows", "macos"],
      },
      {
        titleKey: "settings.autoUpdate",
        descriptionKey: "settings.autoUpdateDescription",
      },
      {
        titleKey: "settings.updateChannel",
        descriptionKey: "settings.updateChannelDescription",
      },
      { titleKey: "settings.developerMode" },
      {
        titleKey: "settings.forgeInstall",
        descriptionKey: "settings.forgeInstallDescription",
      },
      {
        titleKey: "settings.linuxGpuCompat",
        descriptionKey: "settings.linuxGpuCompatDescription",
        platforms: ["linux"],
      },
    ],
  },
  {
    id: "appearance",
    tab: "application",
    titleKey: "settings.appearance",
    descriptionKey: "settings.appearanceDescription",
    settings: [
      {
        titleKey: "settings.theme",
        descriptionKey: "settings.themeDescription",
      },
      {
        titleKey: "settings.audioVolume",
        descriptionKey: "settings.audioVolumeDescription",
      },
      {
        titleKey: "settings.featureTips",
        descriptionKey: "settings.featureTipsDescription",
      },
      {
        titleKey: "settings.modelPreview",
        descriptionKey: "settings.modelPreviewDescription",
      },
      {
        titleKey: "settings.occultGeometry",
        descriptionKey: "settings.occultGeometryDescription",
      },
      {
        titleKey: "settings.animateOccultGeometry",
        descriptionKey: "settings.animateOccultGeometryDescription",
      },
    ],
  },
  {
    id: "language",
    tab: "application",
    titleKey: "settings.languageSettings",
    descriptionKey: "settings.languageSettingsDescription",
    settings: [
      {
        titleKey: "settings.language",
        descriptionKey: "settings.languageDescription",
      },
    ],
  },
  {
    tab: "themes",
    titleKey: "settings.themes",
  },
  {
    id: "fileserver",
    tab: "network",
    titleKey: "settings.fileserverSectionTitle",
    descriptionKey: "settings.networkDescription",
    settings: [
      {
        titleKey: "settings.segmentedDownloads",
        descriptionKey: "settings.segmentedDownloadsDescription",
      },
    ],
  },
  {
    id: "gamebanana",
    tab: "integrations",
    titleKey: "settings.gamebanana",
    descriptionKey: "settings.gamebananaDescription",
    settings: [
      {
        titleKey: "settings.remoteInstall",
        descriptionKey: "settings.remoteInstallDescription",
      },
    ],
  },
  {
    id: "proxy",
    tab: "network",
    titleKey: "settings.proxy",
    descriptionKey: "settings.proxyDescription",
    settings: [
      {
        titleKey: "settings.proxyEnable",
        descriptionKey: "settings.proxyEnableDescription",
      },
      {
        titleKey: "settings.proxyAuth",
        descriptionKey: "settings.proxyAuthDescription",
      },
      {
        titleKey: "settings.proxyBypass",
        descriptionKey: "settings.proxyBypassDescription",
      },
    ],
  },
  {
    tab: "plugin",
    titleKey: "settings.plugin",
    descriptionKey: "settings.pluginDescription",
    settings: [
      { titleKey: "plugins.manage.installFromFile" },
      {
        titleKey: "plugins.manage.findMore.title",
        descriptionKey: "plugins.manage.findMore.body",
      },
    ],
  },
  {
    tab: "discord",
    titleKey: "settings.discord",
    descriptionKey: "gamePresence.settingsDescription",
    settings: [
      {
        titleKey: "gamePresence.title",
        descriptionKey: "gamePresence.description",
      },
      {
        titleKey: "gamePresence.templatesTitle",
        descriptionKey: "gamePresence.templatesDescription",
      },
      {
        titleKey: "gamePresence.heroOverrides.title",
        descriptionKey: "gamePresence.heroOverrides.description",
      },
    ],
  },
  {
    tab: "tools",
    titleKey: "settings.tools",
    descriptionKey: "settings.toolsDescription",
    settings: [
      { titleKey: "repairModFolder.action" },
      { titleKey: "settings.openGameFolder" },
      { titleKey: "settings.openModsFolder" },
      { titleKey: "settings.openModsDataFolder" },
      {
        titleKey: "settings.troubleshooting",
        descriptionKey: "settings.troubleshootingDescription",
      },
      {
        titleKey: "settings.clearCatalog",
        descriptionKey: "settings.clearCatalogDescription",
      },
      {
        titleKey: "debug.wipeCatalog",
        descriptionKey: "debug.wipeCatalogDescription",
      },
      {
        titleKey: "settings.clearDownloadCache",
        descriptionKey: "settings.clearDownloadCacheDescription",
      },
      {
        titleKey: "settings.clearAllModsData",
        descriptionKey: "settings.clearAllModsDataDescription",
      },
      {
        titleKey: "debug.clearModsState",
        descriptionKey: "debug.clearModsStateDescription",
      },
      {
        titleKey: "settings.clearAllMods",
        descriptionKey: "settings.clearAllModsDescription",
      },
      {
        titleKey: "settings.dangerZone",
        descriptionKey: "settings.dangerZoneDescription",
      },
    ],
  },
  {
    tab: "backups",
    titleKey: "settings.addonsBackup",
    descriptionKey: "settings.addonsBackupDescription",
    settings: [
      {
        titleKey: "settings.backupMode",
        descriptionKey: "settings.backupModeDescription",
      },
      {
        titleKey: "settings.maxBackupCount",
        descriptionKey: "settings.maxBackupCountDescription",
      },
    ],
  },
  {
    tab: "logging",
    titleKey: "settings.logging",
    descriptionKey: "settings.loggingDescription",
    settings: [
      {
        titleKey: "settings.modManagerLogs",
        descriptionKey: "settings.modManagerLogsDescription",
      },
      {
        titleKey: "settings.crashDumps",
        descriptionKey: "settings.crashDumpsDescription",
      },
      {
        titleKey: "settings.askAi",
        descriptionKey: "settings.askAiDescription",
      },
    ],
  },
  {
    tab: "experimental",
    titleKey: "featureFlags.title",
    descriptionKey: "featureFlags.description",
    settings: EXPERIMENTAL_FEATURES.map((feature) => ({
      titleKey: `featureFlags.features.${feature}.title`,
      descriptionKey: `featureFlags.features.${feature}.description`,
    })),
  },
  {
    id: "privacy",
    tab: "privacy",
    titleKey: "privacy.title",
    descriptionKey: "privacy.description",
    settings: [
      {
        titleKey: "privacy.hideNSFWContent",
        descriptionKey: "privacy.hideNSFWDescription",
      },
      {
        titleKey: "privacy.disableNSFWBlur",
        descriptionKey: "privacy.disableNSFWBlurDescription",
      },
      {
        titleKey: "privacy.blurStrength",
        descriptionKey: "privacy.blurStrengthDescription",
      },
      {
        titleKey: "privacy.lightweightNSFWBlur",
        descriptionKey: "privacy.lightweightNSFWBlurDescription",
        platforms: ["linux"],
      },
      {
        titleKey: "privacy.showLikelyNSFW",
        descriptionKey: "privacy.showLikelyNSFWDescription",
      },
      {
        titleKey: "privacy.rememberPerItemChoices",
        descriptionKey: "privacy.rememberPerItemChoicesDescription",
      },
      { titleKey: "privacy.savedPerItemChoices" },
      { titleKey: "privacy.clearPerItemChoices" },
      {
        titleKey: "privacy.analyticsEnabled",
        descriptionKey: "privacy.analyticsEnabledDescription",
      },
      {
        titleKey: "privacy.networkActivity",
        descriptionKey: "privacy.networkActivityDescription",
      },
    ],
  },
  {
    tab: "match-data",
    titleKey: "matchSync.title",
    descriptionKey: "matchSync.overview.description",
  },
  {
    id: "ingest-tool",
    tab: "match-data",
    titleKey: "settings.ingestTool.sectionTitle",
    descriptionKey: "settings.ingestTool.sectionDescription",
    settings: [
      {
        titleKey: "settings.ingestTool.title",
        descriptionKey: "settings.ingestTool.description",
      },
    ],
  },
  {
    id: "match-sync",
    tab: "match-data",
    titleKey: "matchSync.account.title",
    descriptionKey: "matchSync.account.description",
    settings: [
      {
        titleKey: "matchSync.enable.title",
        descriptionKey: "matchSync.enable.description",
      },
      {
        titleKey: "matchSync.fullSync.title",
        descriptionKey: "matchSync.fullSync.description",
      },
    ],
  },
  {
    tab: "about",
    titleKey: "about.title",
    descriptionKey: "about.description",
    settings: [
      {
        titleKey: "about.resetOnboarding",
        descriptionKey: "about.resetOnboardingDescription",
      },
      {
        titleKey: "about.resetFeatureTips",
        descriptionKey: "about.resetFeatureTipsDescription",
      },
      { titleKey: "about.thirdPartyNotices" },
    ],
  },
];

const MAX_RESULTS = 20;
const WHITESPACE_REGEX = /\s+/;
const DIACRITICS_REGEX = /\p{Diacritic}/gu;

const normalize = (text: string) =>
  text.normalize("NFD").replace(DIACRITICS_REGEX, "").toLowerCase();

type Candidate = { result: SettingsSearchResult; haystack: string };

const rendersOn = (item: SearchableText, platform?: Platform) =>
  !platform || !item.platforms || item.platforms.includes(platform);

const toCandidates = (
  sections: SettingsSearchSection[],
  translate: (key: string) => string,
  platform?: Platform,
): Candidate[] =>
  sections.flatMap((section) => {
    if (!rendersOn(section, platform)) return [];
    const tabLabel = translate(SETTINGS_TAB_LABEL_KEYS[section.tab]);
    const sectionTitle = translate(section.titleKey);
    const sectionBreadcrumb =
      sectionTitle === tabLabel ? tabLabel : `${tabLabel} › ${sectionTitle}`;

    const toCandidate = (
      item: SearchableText,
      breadcrumb: string,
      context: string,
    ): Candidate => {
      const title = translate(item.titleKey);
      const description = item.descriptionKey
        ? translate(item.descriptionKey)
        : undefined;
      return {
        result: {
          tab: section.tab,
          route: SETTINGS_TAB_ROUTES.get(section.tab),
          sectionId: section.id,
          titleKey: item.titleKey,
          title,
          breadcrumb,
        },
        haystack: normalize(`${context} ${title} ${description ?? ""}`),
      };
    };

    return [toCandidate(section, tabLabel, tabLabel)].concat(
      (section.settings ?? [])
        .filter((setting) => rendersOn(setting, platform))
        .map((setting) =>
          toCandidate(
            setting,
            sectionBreadcrumb,
            `${tabLabel} ${sectionTitle}`,
          ),
        ),
    );
  });

const rank = (title: string, query: string) => {
  const normalizedTitle = normalize(title);
  if (normalizedTitle.startsWith(query)) return 0;
  if (normalizedTitle.includes(query)) return 1;
  return 2;
};

/**
 * Matches every query word against a setting's title, description, and the
 * tab/section it lives in. Title matches rank above description-only matches.
 * With `platform`, settings the settings page hides there are skipped.
 */
export const searchSettings = (
  query: string,
  translate: (key: string) => string,
  sections: SettingsSearchSection[] = SETTINGS_SEARCH_INDEX,
  platform?: Platform,
): SettingsSearchResult[] => {
  const normalizedQuery = normalize(query.trim());
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(WHITESPACE_REGEX);

  return toCandidates(sections, translate, platform)
    .filter((candidate) =>
      terms.every((term) => candidate.haystack.includes(term)),
    )
    .map(({ result }) => ({
      result,
      score: rank(result.title, normalizedQuery),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
};
