import {
  type CustomSettingDto,
  CustomSettingType,
  customSettingTypeHuman,
} from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  Archive,
  FileCog,
  FlagIcon,
  FolderOpen,
  GamepadIcon,
  Globe,
  InfoIcon,
  MonitorIcon,
  PlugIcon,
  PlusIcon,
  ScrollTextIcon,
  Settings,
  ShieldIcon,
  TrashIcon,
  WrenchIcon,
} from "@deadlock-mods/ui/icons";
import { DiscordLogoIcon } from "@phosphor-icons/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Suspense, useEffect, useMemo, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { useConfirm } from "@/components/providers/alert-dialog";
import AddSettingDialog from "@/components/settings/add-setting";
import { AddonsBackupManagement } from "@/components/settings/addons-backup-management";
import { AutoUpdateToggle } from "@/components/settings/auto-update-toggle";
import { AutoexecSettings } from "@/components/settings/autoexec-settings";
import { DeveloperModeToggle } from "@/components/settings/developer-mode-toggle";
import { FeatureFlagsSettings } from "@/components/settings/feature-flags-settings";
import { FileserverSettings } from "@/components/settings/fileserver-settings";
import { GamePathSettings } from "@/components/settings/game-path-settings";
import { GamePresenceSettings } from "@/components/settings/game-presence-settings";
import GameInfoManagement from "@/components/settings/gameinfo-management";
import { HeroParserSettings } from "@/components/settings/hero-parser-settings";
import { IngestToolToggle } from "@/components/settings/ingest-tool-toggle";
import { LanguageSettings } from "@/components/settings/language-settings";
import { LinuxGpuToggle } from "@/components/settings/linux-gpu-toggle";
import { LoggingSettings } from "@/components/settings/logging-settings";
import OccultGeometrySettings from "@/components/settings/occult-geometry-settings";
import { PluginList } from "@/components/settings/plugin-list";
import PrivacySettings from "@/components/settings/privacy-settings";
import { ProxySettings } from "@/components/settings/proxy-settings";
import Section, { SectionSkeleton } from "@/components/settings/section";
import SettingCard, {
  SettingCardSkeleton,
} from "@/components/settings/setting-card";
import SystemSettings from "@/components/settings/system-settings";
import ThemeSwitcher from "@/components/settings/theme-switcher";
import { UpdateChannelSelect } from "@/components/settings/update-channel-select";
import VolumeControl from "@/components/settings/volume-control";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { getCustomSettings } from "@/lib/api";
import { SortType } from "@/lib/constants";
import logger from "@/lib/logger";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { LocalSetting } from "@/types/settings";

const getAutoexecConfig = async () => {
  try {
    return await invoke<{
      full_content: string;
      editable_content: string;
      readonly_sections: Array<{
        start_line: number;
        end_line: number;
        content: string;
      }>;
    }>("get_autoexec_config");
  } catch {
    return null;
  }
};

const AUTOEXEC_LAUNCH_OPTION_ID = "autoexec-launch-option";
const CONDEBUG_LAUNCH_OPTION_ID = "condebug-launch-option";

type SettingsNavItemProps = {
  value: string;
  icon: React.ElementType<{ className?: string }>;
  label: string;
};

const SettingsNavItem = ({
  value,
  icon: Icon,
  label,
}: SettingsNavItemProps) => (
  <TabsTrigger
    className={cn(
      "relative h-10 w-full justify-start gap-3 rounded-md px-3 py-2 font-medium text-sm",
      "text-muted-foreground transition-colors",
      "data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground",
      "data-[state=active]:bg-primary/10 data-[state=active]:text-foreground",
      "data-[state=active]:before:absolute data-[state=active]:before:left-0 data-[state=active]:before:top-1/2 data-[state=active]:before:h-5 data-[state=active]:before:w-[2px] data-[state=active]:before:-translate-y-1/2 data-[state=active]:before:rounded-r-full data-[state=active]:before:bg-primary",
    )}
    value={value}>
    <Icon className='h-4 w-4 shrink-0' />
    {label}
  </TabsTrigger>
);

const SettingsNavGroup = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className='flex flex-col gap-0.5'>
    <p className='px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70'>
      {label}
    </p>
    {children}
  </div>
);

type CreditCardProps = {
  title: string;
  description: string;
  url?: string;
  buttonLabel?: string;
};

const CreditCard = ({
  title,
  description,
  url,
  buttonLabel,
}: CreditCardProps) => (
  <div className='rounded-lg border border-border/50 bg-card/50 p-4'>
    <div className='flex flex-col gap-2'>
      <h3 className='font-semibold text-primary'>{title}</h3>
      <p className='text-muted-foreground text-sm'>{description}</p>
      {url && buttonLabel && (
        <Button
          className='mt-2 w-fit'
          onClick={() => openUrl(url)}
          size='sm'
          variant='outline'>
          {buttonLabel}
        </Button>
      )}
    </div>
  </div>
);

const CustomSettingsData = ({
  onNavigateToDiscord,
}: {
  onNavigateToDiscord: () => void;
}) => {
  const { t } = useTranslation();
  const { data, error } = useSuspenseQuery({
    queryKey: ["custom-settings"],
    queryFn: getCustomSettings,
  });
  const { data: autoexecConfig } = useQuery({
    queryKey: ["autoexec-config"],
    queryFn: getAutoexecConfig,
    staleTime: STALE_TIME_LOCAL,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { settings, toggleSetting, gamePresenceEnabled, setGamePresenceEnabled } = usePersistedStore();
  const [showCondebugWarning, setShowCondebugWarning] = useState(false);

  useEffect(() => {
    if (!gamePresenceEnabled) {
      setShowCondebugWarning(false);
    }
  }, [gamePresenceEnabled]);

  useEffect(() => {
    if (error) {
      toast.error((error as Error)?.message ?? t("common.failedToFetchMods"));
    }
  }, [error, t]);

  const settingByType = data?.reduce(
    (acc, setting) => {
      acc[setting.type as CustomSettingType] = [
        ...(acc[setting.type as CustomSettingType] ?? []),
        setting,
      ];
      return acc;
    },
    {} as Record<CustomSettingType, CustomSettingDto[]>,
  );

  const customLocalSettings = Object.values(settings).filter((setting) =>
    setting.id.startsWith("local_setting_"),
  );
  const customLocalSettingsByType = customLocalSettings.reduce(
    (acc, setting) => {
      acc[setting.type as CustomSettingType] = [
        ...(acc[setting.type as CustomSettingType] ?? []),
        setting as LocalSetting,
      ];
      return acc;
    },
    {} as Record<CustomSettingType, LocalSetting[]>,
  );

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled]),
    );
  }, [settings]);

  const hasAutoexecConfig = useMemo(() => {
    return (
      autoexecConfig?.full_content &&
      autoexecConfig.full_content.trim().length > 0
    );
  }, [autoexecConfig]);

  const autoexecLaunchOption: LocalSetting | null = useMemo(() => {
    if (!autoexecConfig) return null;

    const persistedEnabled =
      settingStatusById[AUTOEXEC_LAUNCH_OPTION_ID] ?? false;
    const enabled = hasAutoexecConfig ? persistedEnabled : false;

    return {
      id: AUTOEXEC_LAUNCH_OPTION_ID,
      key: "-exec",
      value: "deadlock-mod-manager",
      type: CustomSettingType.LAUNCH_OPTION,
      description: t("settings.autoexecLaunchOption"),
      enabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }, [autoexecConfig, hasAutoexecConfig, settingStatusById, t]);

  const condebugLaunchOption: LocalSetting = useMemo(() => {
    return {
      id: CONDEBUG_LAUNCH_OPTION_ID,
      key: "-condebug",
      value: "",
      type: CustomSettingType.LAUNCH_OPTION,
      description: t("gamePresence.condebugOption"),
      enabled: gamePresenceEnabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }, [gamePresenceEnabled, t]);

  return (
    <>
      {Object.values(CustomSettingType).map((type: CustomSettingType) => {
        const isLaunchOption = type === CustomSettingType.LAUNCH_OPTION;
        const settingsForType = [
          ...(isLaunchOption ? [condebugLaunchOption] : []),
          ...(settingByType?.[type] ?? []),
          ...(customLocalSettingsByType?.[type] ?? []),
          ...(isLaunchOption && autoexecLaunchOption
            ? [autoexecLaunchOption]
            : []),
        ];

        return (
          <Section
            action={
              <AddSettingDialog>
                <Button variant='outline'>
                  <PlusIcon className='h-4 w-4' /> {t("common.create")}
                </Button>
              </AddSettingDialog>
            }
            description={
              type === CustomSettingType.LAUNCH_OPTION
                ? t("settings.launchOptionsDescription")
                : customSettingTypeHuman[
                    type as keyof typeof customSettingTypeHuman
                  ]?.description || ""
            }
            key={type}
            title={
              type === CustomSettingType.LAUNCH_OPTION
                ? t("settings.launchOptions")
                : customSettingTypeHuman[
                    type as keyof typeof customSettingTypeHuman
                  ]?.title || ""
            }>
            <div className='grid grid-cols-1 gap-4'>
              {isLaunchOption && showCondebugWarning && (
                <div className='flex items-center gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3'>
                  <WarningCircle className='size-5 shrink-0 text-yellow-400' />
                  <p className='text-sm'>{t("gamePresence.condebugDisableWarning")}</p>
                  <Button
                    className='ml-auto shrink-0'
                    onClick={() => {
                      setShowCondebugWarning(false);
                      onNavigateToDiscord();
                    }}
                    size='sm'
                    variant='outline'>
                    {t("gamePresence.goToDiscordSettings")}
                  </Button>
                </div>
              )}
              {settingsForType.map((setting) => {
                const isAutoexecOption =
                  setting.id === AUTOEXEC_LAUNCH_OPTION_ID;
                const isCondebugOption =
                  setting.id === CONDEBUG_LAUNCH_OPTION_ID;
                const isDisabled = isAutoexecOption && !hasAutoexecConfig;

                return (
                  <SettingCard
                    disabled={isDisabled}
                    key={setting.id}
                    onChange={() => {
                      if (isCondebugOption) {
                        if (gamePresenceEnabled) {
                          setShowCondebugWarning(true);
                        } else {
                          setGamePresenceEnabled(true);
                        }
                        return;
                      }
                      if (!isDisabled) {
                        toggleSetting(setting.id, setting);
                      }
                    }}
                    setting={{
                      ...setting,
                      enabled: isCondebugOption
                        ? gamePresenceEnabled
                        : (settingStatusById?.[setting.id] ??
                          (setting as LocalSetting).enabled ??
                          false),
                    }}
                  />
                );
              })}
            </div>
          </Section>
        );
      })}
    </>
  );
};

const CustomSettings = ({ value }: { value?: string }) => {
  const { t } = useTranslation();
  const { clearMods, localMods: mods, getActiveProfile } = usePersistedStore();

  const clearModsState = async () => {
    if (
      !(await confirm({
        title: t("settings.confirmClearModsState"),
        body: t("settings.confirmClearModsStateBody"),
        actionButton: t("settings.confirmClearModsStateAction"),
        cancelButton: t("common.cancel"),
      }))
    ) {
      return;
    }
    clearMods();
    toast.success(t("settings.modsStateCleared"));
  };
  const confirm = useConfirm();
  const { analytics } = useAnalyticsContext();
  const location = useLocation();
  const initialTab =
    value ??
    (location.state as { activeTab?: string } | null)?.activeTab ??
    "launch-options";
  const [activeTab, setActiveTab] = useState(initialTab);
  // Hooks für Default Sort
  const defaultSort = usePersistedStore((s) => s.defaultSort);
  const setDefaultSort = usePersistedStore((s) => s.setDefaultSort);

  // Track settings tab changes
  useEffect(() => {
    analytics.trackPageViewed(`settings-${activeTab}`, {
      path: "/settings",
      tab: activeTab,
    });
  }, [activeTab, analytics]);

  const clearDownloadCache = async () => {
    if (!(await confirm(t("settings.confirmClearDownloadCache")))) {
      return;
    }
    try {
      const freedBytes = await invoke<number>("clear_download_cache");
      const freedMB = (freedBytes / 1024 / 1024).toFixed(1);
      toast.success(`${t("settings.clearDownloadCache")}: ${freedMB} MB freed`);
    } catch (error) {
      logger.errorOnly(error);
      toast.error(t("common.error"));
    }
  };

  const clearAllModsData = async () => {
    if (!(await confirm(t("settings.confirmClearAllModsData")))) {
      return;
    }
    try {
      const freedBytes = await invoke<number>("clear_all_mods_data");
      const freedMB = (freedBytes / 1024 / 1024).toFixed(1);
      toast.success(`${t("settings.clearAllModsData")}: ${freedMB} MB freed`);
    } catch (error) {
      logger.errorOnly(error);
      toast.error(t("common.error"));
    }
  };

  const clearAllMods = async () => {
    if (!(await confirm(t("settings.confirmClearAllMods")))) {
      return;
    }
    try {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      await Promise.all(
        mods.map((mod) =>
          invoke("purge_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
            profileFolder,
          }),
        ),
      );
      clearMods();
      toast.success(t("settings.allModsCleared"));
    } catch (error) {
      logger.errorOnly(error);
      toast.error(t("settings.failedToClearMods"));
    }
  };

  return (
    <div className='flex h-full w-full min-h-0 flex-col gap-4 overflow-hidden'>
      <PageTitle className='shrink-0 px-4' title={t("navigation.settings")} />
      <Tabs
        className='flex min-h-0 flex-1 gap-6 overflow-hidden'
        defaultValue='launch-options'
        onValueChange={setActiveTab}
        value={activeTab}>
        <div className='w-52 shrink-0 min-h-0 overflow-y-auto pr-1'>
          <TabsList className='h-fit w-full flex-col items-stretch gap-1 bg-transparent p-2'>
            <SettingsNavGroup label='Game'>
              <SettingsNavItem
                icon={Settings}
                label={t("settings.launchOptions")}
                value='launch-options'
              />
              <SettingsNavItem
                icon={FileCog}
                label={t("settings.autoexec")}
                value='autoexec'
              />
              <SettingsNavItem
                icon={GamepadIcon}
                label={t("settings.game")}
                value='game'
              />
            </SettingsNavGroup>

            <SettingsNavGroup label='Application'>
              <SettingsNavItem
                icon={MonitorIcon}
                label={t("settings.application")}
                value='application'
              />
              <SettingsNavItem
                icon={Globe}
                label={t("settings.network")}
                value='network'
              />
              <SettingsNavItem
                icon={PlugIcon}
                label={t("settings.plugin")}
                value='plugin'
              />
              <SettingsNavItem
                icon={DiscordLogoIcon}
                label={t("settings.discord")}
                value='discord'
              />
            </SettingsNavGroup>

            <SettingsNavGroup label='Advanced'>
              <SettingsNavItem
                icon={WrenchIcon}
                label={t("settings.tools")}
                value='tools'
              />
              <SettingsNavItem
                icon={Archive}
                label={t("settings.backups")}
                value='backups'
              />
              <SettingsNavItem
                icon={ScrollTextIcon}
                label={t("settings.logging")}
                value='logging'
              />
              <SettingsNavItem
                icon={FlagIcon}
                label={t("settings.experimental")}
                value='experimental'
              />
              <SettingsNavItem
                icon={ShieldIcon}
                label={t("settings.privacy")}
                value='privacy'
              />
              <SettingsNavItem
                icon={InfoIcon}
                label={t("settings.information")}
                value='about'
              />
            </SettingsNavGroup>
          </TabsList>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-1 pr-4'>
          <TabsContent className='mt-0 space-y-4' value='launch-options'>
            <Suspense
              fallback={
                <div className='grid grid-cols-1 gap-4'>
                  <SectionSkeleton>
                    {Array.from({ length: 2 }, () => (
                      <SettingCardSkeleton key={crypto.randomUUID()} />
                    ))}
                  </SectionSkeleton>
                </div>
              }>
              <ErrorBoundary>
                <CustomSettingsData onNavigateToDiscord={() => setActiveTab("discord")} />
              </ErrorBoundary>
            </Suspense>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='plugin'>
            <Section
              description={t("settings.pluginDescription")}
              title={t("settings.plugin")}>
              <PluginList />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='game'>
            <Section
              description={t("settings.gamePathDescription")}
              title={t("settings.gamePath")}>
              <GamePathSettings />
            </Section>

            <Section
              description={t("settings.gameConfigDescription")}
              title={t("settings.gameConfigManagement")}>
              <GameInfoManagement />
            </Section>

            <Section
              description={t("heroParser.settingsDescription")}
              title={t("heroParser.settingsTitle")}>
              <HeroParserSettings />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='discord'>
            <Section
              description={t("gamePresence.settingsDescription")}
              title={t("settings.discord")}>
              <GamePresenceSettings />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='application'>
            <Section
              description={t("settings.systemSettingsDescription")}
              title={t("settings.systemSettings")}>
              <div className='grid grid-cols-1 gap-4'>
                <SystemSettings />
                <AutoUpdateToggle />
                <UpdateChannelSelect />
                <DeveloperModeToggle />
                <IngestToolToggle />
                <LinuxGpuToggle />
              </div>
            </Section>

            <Section
              description={t("settings.appearanceDescription")}
              title={t("settings.appearance")}>
              <div className='flex flex-col gap-4'>
                <div className='flex items-center justify-between'>
                  <div className='space-y-1'>
                    <Label className='font-bold text-sm'>
                      {t("settings.theme")}
                    </Label>
                    <p className='text-muted-foreground text-sm'>
                      {t("settings.themeDescription")}
                    </p>
                  </div>
                  <ThemeSwitcher />
                </div>

                <VolumeControl />

                <OccultGeometrySettings />
              </div>
            </Section>

            <Section
              description={t("settings.languageSettingsDescription")}
              title={t("settings.languageSettings")}>
              <LanguageSettings />
            </Section>

            <Section
              description={t("settings.defaultSortDescription")}
              title={t("settings.defaultSortValue")}>
              <div className='flex flex-col gap-2'>
                <Label className='font-bold text-sm' id='default-sort-label'>
                  {t("settings.defaultSort")}
                </Label>
                <Select
                  onValueChange={(v) => setDefaultSort(v as SortType)}
                  value={defaultSort}>
                  <SelectTrigger
                    aria-labelledby='default-sort-label'
                    className='w-36'>
                    <SelectValue
                      placeholder={t("settings.selectDefaultSort")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(SortType).map((type) => (
                        <SelectItem
                          className='capitalize'
                          key={type}
                          value={type}>
                          {t(
                            `sorting.${type.replace(/\s+/g, "").toLowerCase()}`,
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='network'>
            <Section
              description={t("settings.networkDescription")}
              title={t("settings.fileserverSectionTitle")}>
              <FileserverSettings />
            </Section>

            <Section
              description={t("settings.proxyDescription")}
              title={t("settings.proxy")}>
              <ProxySettings />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='tools'>
            <Section
              description={t("settings.toolsDescription")}
              title={t("settings.tools")}>
              <div className='flex flex-col gap-5'>
                <div className='flex flex-col gap-2'>
                  <p className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70'>
                    Quick Access
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      className='w-fit'
                      onClick={() => invoke("open_game_folder")}
                      variant='outline'>
                      <FolderOpen className='h-4 w-4' />
                      {t("settings.openGameFolder")}
                    </Button>
                    <Button
                      className='w-fit'
                      onClick={async () => {
                        const activeProfile = getActiveProfile();
                        const profileFolder = activeProfile?.folderName ?? null;
                        await invoke("open_mods_folder", { profileFolder });
                      }}
                      variant='outline'>
                      <FolderOpen className='h-4 w-4' />
                      {t("settings.openModsFolder")}
                    </Button>
                    <Button
                      className='w-fit'
                      onClick={() => invoke("open_mods_data_folder")}
                      variant='outline'>
                      <FolderOpen className='h-4 w-4' />
                      {t("settings.openModsDataFolder")}
                    </Button>
                  </div>
                </div>

                <div className='flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-4'>
                  <div className='flex items-center gap-2'>
                    <WarningCircle className='h-4 w-4 text-destructive' />
                    <p className='text-[11px] font-semibold uppercase tracking-wider text-destructive'>
                      Danger Zone
                    </p>
                  </div>
                  <p className='text-muted-foreground text-xs'>
                    These actions are permanent and cannot be undone.
                  </p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <Button
                      className='w-fit'
                      onClick={clearDownloadCache}
                      variant='destructive'>
                      <TrashIcon className='h-4 w-4' />
                      {t("settings.clearDownloadCache")}
                    </Button>
                    <Button
                      className='w-fit'
                      onClick={clearAllModsData}
                      variant='destructive'>
                      <TrashIcon className='h-4 w-4' />
                      {t("settings.clearAllModsData")}
                    </Button>
                    <Button
                      className='w-fit'
                      onClick={clearModsState}
                      variant='destructive'>
                      <TrashIcon className='h-4 w-4' />
                      {t("debug.clearModsState")}
                    </Button>
                    <Button
                      className='w-fit'
                      onClick={clearAllMods}
                      variant='destructive'>
                      <TrashIcon className='h-4 w-4' />
                      {t("settings.clearAllMods")}
                    </Button>
                  </div>
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='backups'>
            <Section
              description={t("settings.addonsBackupDescription")}
              title={t("settings.addonsBackup")}>
              <AddonsBackupManagement />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='logging'>
            <Section
              description={t("settings.loggingDescription")}
              title={t("settings.logging")}>
              <LoggingSettings />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='experimental'>
            <Section
              description={t("featureFlags.description")}
              title={t("featureFlags.title")}>
              <FeatureFlagsSettings />
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='privacy'>
            <Section
              description={t("privacy.description")}
              title={t("privacy.title")}>
              <div className='grid grid-cols-1 gap-4'>
                <PrivacySettings />
              </div>
            </Section>
          </TabsContent>

          <TabsContent className='mt-0 space-y-4' value='about'>
            <div className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4'>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <WarningCircle className='h-4 w-4 text-amber-500' />
                  <h3 className='font-semibold text-primary'>
                    {t("about.thirdPartyDisclaimerTitle")}
                  </h3>
                </div>
                <p className='text-muted-foreground text-sm'>
                  {t("about.thirdPartyDisclaimerDescription")}
                </p>
              </div>
            </div>
            <Section
              description={t("about.description")}
              title={t("about.title")}>
              <div className='grid gap-3 sm:grid-cols-2'>
                <CreditCard
                  buttonLabel={t("about.visitGamebanana")}
                  description={t("about.gamebananaDescription")}
                  title='GameBanana'
                  url='https://gamebanana.com/'
                />
                <CreditCard
                  buttonLabel={t("about.visitDeadlockRichPresence")}
                  description={t("about.deadlockRichPresenceDescription")}
                  title='Deadlock Rich Presence'
                  url='https://github.com/Jelloge/Deadlock-Rich-Presence'
                />
                <CreditCard
                  buttonLabel={t("about.visitTauri")}
                  description={t("about.tauriDescription")}
                  title='Tauri'
                  url='https://tauri.app/'
                />
                <CreditCard
                  buttonLabel={t("about.visitShadcn")}
                  description={t("about.shadcnDescription")}
                  title='shadcn/ui'
                  url='https://ui.shadcn.com/'
                />
                <CreditCard
                  buttonLabel={t("about.visitTailwind")}
                  description={t("about.tailwindDescription")}
                  title='Tailwind CSS'
                  url='https://tailwindcss.com/'
                />
                <div className='rounded-lg border border-border/50 bg-card/50 p-4 sm:col-span-2'>
                  <div className='flex flex-col gap-2'>
                    <h3 className='font-semibold'>
                      {t("about.openSourceCommunity")}
                    </h3>
                    <p className='text-muted-foreground text-sm'>
                      {t("about.openSourceDescription")}
                    </p>
                  </div>
                </div>

                <div className='rounded-lg border border-border/50 bg-card/50 p-4 sm:col-span-2'>
                  <div className='flex flex-col gap-2'>
                    <h3 className='font-semibold text-primary'>
                      {t("about.resetOnboarding")}
                    </h3>
                    <p className='text-muted-foreground text-sm'>
                      {t("about.resetOnboardingDescription")}
                    </p>
                    <Button
                      className='mt-2 w-fit'
                      onClick={() => {
                        usePersistedStore
                          .getState()
                          .setHasCompletedOnboarding(false);
                        toast.success(t("about.resetOnboardingSuccess"));
                      }}
                      size='sm'
                      variant='outline'>
                      {t("about.resetOnboarding")}
                    </Button>
                  </div>
                </div>
              </div>
            </Section>
          </TabsContent>
          <TabsContent className='mt-0 space-y-4' value='autoexec'>
            <ErrorBoundary>
              <AutoexecSettings />
            </ErrorBoundary>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default CustomSettings;
