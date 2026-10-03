export const SETTINGS_TAB_LABEL_KEYS = {
  "launch-options": "settings.launchOptions",
  autoexec: "settings.autoexec",
  game: "settings.game",
  application: "settings.application",
  themes: "settings.themes",
  network: "settings.network",
  plugin: "settings.plugin",
  discord: "settings.discord",
  tools: "settings.tools",
  backups: "settings.backups",
  logging: "settings.logging",
  experimental: "settings.experimental",
  privacy: "settings.privacy",
  about: "settings.information",
} as const;

type SettingsTab = keyof typeof SETTINGS_TAB_LABEL_KEYS;

type SearchableText = {
  titleKey: string;
  descriptionKey?: string;
};

export type SettingsSearchSection = SearchableText & {
  /** Anchor rendered by `<Section searchId>`; omitted when the tab is the target. */
  id?: string;
  tab: SettingsTab;
  settings?: SearchableText[];
};

export type SettingsSearchResult = {
  tab: SettingsTab;
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
    settings: [
      { titleKey: "gamePresence.condebugOption" },
      { titleKey: "settings.autoexecLaunchOption" },
    ],
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
      { titleKey: "game.validateConfiguration" },
    ],
  },
  {
    id: "hero-parser",
    tab: "game",
    titleKey: "heroParser.settingsTitle",
    descriptionKey: "heroParser.settingsDescription",
  },
  {
    id: "system",
    tab: "application",
    titleKey: "settings.systemSettings",
    descriptionKey: "settings.systemSettingsDescription",
    settings: [
      {
        titleKey: "settings.autoReapplyMods",
        descriptionKey: "settings.autoReapplyModsDescription",
      },
      {
        titleKey: "settings.heroConflictWarning",
        descriptionKey: "settings.heroConflictWarningDescription",
      },
      {
        titleKey: "settings.launchVanillaNoArgs",
        descriptionKey: "settings.launchVanillaNoArgsDescription",
      },
      {
        titleKey: "settings.modsStorePagination",
        descriptionKey: "settings.modsStorePaginationDescription",
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
        titleKey: "settings.ingestTool.title",
        descriptionKey: "settings.ingestTool.description",
      },
      {
        titleKey: "settings.forgeInstall",
        descriptionKey: "settings.forgeInstallDescription",
      },
      {
        titleKey: "settings.linuxGpuCompat",
        descriptionKey: "settings.linuxGpuCompatDescription",
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
    id: "default-sort",
    tab: "application",
    titleKey: "settings.defaultSortValue",
    descriptionKey: "settings.defaultSortDescription",
    settings: [{ titleKey: "settings.defaultSort" }],
  },
  {
    id: "hero-skins",
    tab: "application",
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
    tab: "themes",
    titleKey: "settings.themes",
  },
  {
    id: "fileserver",
    tab: "network",
    titleKey: "settings.fileserverSectionTitle",
    descriptionKey: "settings.networkDescription",
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
      { titleKey: "settings.openGameFolder" },
      { titleKey: "settings.openModsFolder" },
      { titleKey: "settings.openModsDataFolder" },
      {
        titleKey: "settings.clearCatalog",
        descriptionKey: "settings.clearCatalogDescription",
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
        titleKey: "nuke.title",
        descriptionKey: "nuke.description",
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
        titleKey: "settings.autoBackupEnabled",
        descriptionKey: "settings.autoBackupEnabledDescription",
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
        titleKey: "privacy.showLikelyNSFW",
        descriptionKey: "privacy.showLikelyNSFWDescription",
      },
      {
        titleKey: "privacy.rememberPerItemChoices",
        descriptionKey: "privacy.rememberPerItemChoicesDescription",
      },
      {
        titleKey: "privacy.analyticsEnabled",
        descriptionKey: "privacy.analyticsEnabledDescription",
      },
    ],
  },
  {
    id: "match-sync",
    tab: "privacy",
    titleKey: "matchSync.title",
    descriptionKey: "matchSync.description",
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

const toCandidates = (
  sections: SettingsSearchSection[],
  translate: (key: string) => string,
): Candidate[] =>
  sections.flatMap((section) => {
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
          sectionId: section.id,
          titleKey: item.titleKey,
          title,
          breadcrumb,
        },
        haystack: normalize(`${context} ${title} ${description ?? ""}`),
      };
    };

    return [toCandidate(section, tabLabel, tabLabel)].concat(
      (section.settings ?? []).map((setting) =>
        toCandidate(setting, sectionBreadcrumb, `${tabLabel} ${sectionTitle}`),
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
 */
export const searchSettings = (
  query: string,
  translate: (key: string) => string,
  sections: SettingsSearchSection[] = SETTINGS_SEARCH_INDEX,
): SettingsSearchResult[] => {
  const normalizedQuery = normalize(query.trim());
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(WHITESPACE_REGEX);

  return toCandidates(sections, translate)
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
