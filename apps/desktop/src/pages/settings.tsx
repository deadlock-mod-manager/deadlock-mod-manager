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
  FlagIcon,
  FolderOpen,
  GamepadIcon,
  InfoIcon,
  MonitorIcon,
  PlugIcon,
  PlusIcon,
  Settings,
  ShieldIcon,
  TrashIcon,
  WrenchIcon,
} from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { useLocation } from "react-router";
import { useConfirm } from "@/components/providers/alert-dialog";
import AddSettingDialog from "@/components/settings/add-setting";
import { AddonsBackupManagement } from "@/components/settings/addons-backup-management";
import { AutoUpdateToggle } from "@/components/settings/auto-update-toggle";
import { DeveloperModeToggle } from "@/components/settings/developer-mode-toggle";
import { FeatureFlagsSettings } from "@/components/settings/feature-flags-settings";
import { GamePathSettings } from "@/components/settings/game-path-settings";
import GameInfoManagement from "@/components/settings/gameinfo-management";
import { IngestToolToggle } from "@/components/settings/ingest-tool-toggle";
import { LanguageSettings } from "@/components/settings/language-settings";
import { PluginList } from "@/components/settings/plugin-list";
import PrivacySettings from "@/components/settings/privacy-settings";
import Section, { SectionSkeleton } from "@/components/settings/section";
import SettingCard, {
  SettingCardSkeleton,
} from "@/components/settings/setting-card";
import SystemSettings from "@/components/settings/system-settings";
import ThemeSwitcher from "@/components/settings/theme-switcher";
import VolumeControl from "@/components/settings/volume-control";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { getCustomSettings } from "@/lib/api";
import { SortType } from "@/lib/constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { LocalSetting } from "@/types/settings";

const CustomSettingsData = () => {
  const { t } = useTranslation();
  const { data, error } = useQuery("custom-settings", getCustomSettings, {
    suspense: true,
    useErrorBoundary: false,
  });
  const { settings, toggleSetting } = usePersistedStore();

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

  return (
    <>
      {Object.values(CustomSettingType).map((type: CustomSettingType) => (
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
            {(settingByType?.[type] ?? []).map((setting) => (
              <SettingCard
                key={setting.id}
                onChange={() => toggleSetting(setting.id, setting)}
                setting={{
                  ...setting,
                  enabled: settingStatusById?.[setting.id] ?? false,
                }}
              />
            ))}
            {(customLocalSettingsByType?.[type] ?? []).map((setting) => (
              <SettingCard
                key={setting.id}
                onChange={() => toggleSetting(setting.id, setting)}
                setting={setting}
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
};

const CustomSettings = () => {
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
    (location.state as { activeTab?: string } | null)?.activeTab ??
    "launch-options";
  const [activeTab, setActiveTab] = useState(initialTab);
  const { isEnabled: showPlugins } = useFeatureFlag("show-plugins", true);
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
      logger.error(error);
      toast.error(t("settings.failedToClearMods"));
    }
  };

  return (
    <div className='flex w-full'>
      <div className='flex w-full flex-col gap-4'>
        <PageTitle className='px-4' title={t("navigation.settings")} />

        <Tabs
          className='flex h-full gap-6'
          defaultValue='launch-options'
          onValueChange={setActiveTab}
          value={activeTab}>
          <TabsList className='h-fit w-48 flex-col gap-1 bg-background p-3'>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='launch-options'>
              <Settings className='h-5 w-5' />
              {t("settings.launchOptions")}
            </TabsTrigger>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='game'>
              <GamepadIcon className='h-5 w-5' />
              {t("settings.game")}
            </TabsTrigger>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='application'>
              <MonitorIcon className='h-5 w-5' />
              {t("settings.application")}
            </TabsTrigger>
            {showPlugins && (
              <TabsTrigger
                className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
                value='plugin'>
                <PlugIcon className='h-5 w-5' />
                {t("settings.plugin")}
              </TabsTrigger>
            )}
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='tools'>
              <WrenchIcon className='h-5 w-5' />
              {t("settings.tools")}
            </TabsTrigger>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='experimental'>
              <FlagIcon className='h-5 w-5' />
              {t("settings.experimental")}
            </TabsTrigger>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='privacy'>
              <ShieldIcon className='h-5 w-5' />
              {t("settings.privacy")}
            </TabsTrigger>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='about'>
              <InfoIcon className='h-5 w-5' />
              {t("settings.information")}
            </TabsTrigger>
          </TabsList>

          <div className='scrollbar-thin scrollbar-thumb-primary scrollbar-track-secondary flex-1 overflow-y-auto pr-4'>
            <TabsContent className='mt-0 space-y-2' value='launch-options'>
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
                  <CustomSettingsData />
                </ErrorBoundary>
              </Suspense>
            </TabsContent>

            {showPlugins && (
              <TabsContent className='mt-0 space-y-2' value='plugin'>
                <Section
                  description={t("settings.pluginDescription")}
                  title={t("settings.plugin")}>
                  <PluginList />
                </Section>
              </TabsContent>
            )}

            <TabsContent className='mt-0 space-y-2' value='game'>
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
            </TabsContent>

            <TabsContent className='mt-0 space-y-2' value='application'>
              <Section
                description={t("settings.systemSettingsDescription")}
                title={t("settings.systemSettings")}>
                <div className='grid grid-cols-1 gap-4'>
                  <SystemSettings />
                  <AutoUpdateToggle />
                  <DeveloperModeToggle />
                  <IngestToolToggle />
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

                  {null}
                  <VolumeControl />
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

            <TabsContent className='mt-0 space-y-2' value='tools'>
              <Section
                description={t("settings.toolsDescription")}
                title={t("settings.tools")}>
                <div className='flex flex-wrap gap-4'>
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
                  <Button onClick={clearModsState} variant='destructive'>
                    <TrashIcon className='h-4 w-4 mr-2' />
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
              </Section>
              <Section
                description={t("settings.addonsBackupDescription")}
                title={t("settings.addonsBackup")}>
                <AddonsBackupManagement />
              </Section>
            </TabsContent>

            <TabsContent className='mt-0 space-y-2' value='experimental'>
              <Section
                description={t("featureFlags.description")}
                title={t("featureFlags.title")}>
                <FeatureFlagsSettings />
              </Section>
            </TabsContent>

            <TabsContent className='mt-0 space-y-2' value='privacy'>
              <Section
                description={t("privacy.description")}
                title={t("privacy.title")}>
                <div className='grid grid-cols-1 gap-4'>
                  <PrivacySettings />
                </div>
              </Section>
            </TabsContent>

            <TabsContent className='mt-0 space-y-2' value='about'>
              <Section
                description={t("about.description")}
                title={t("about.title")}>
                <div className='space-y-4'>
                  <div className='rounded-lg border bg-card p-4'>
                    <div className='flex flex-col gap-2'>
                      <h3 className='font-semibold text-primary'>GameBanana</h3>
                      <p className='text-muted-foreground text-sm'>
                        {t("about.gamebananaDescription")}
                      </p>
                      <Button
                        className='mt-2 w-fit'
                        onClick={() => open("https://gamebanana.com/")}
                        size='sm'
                        variant='outline'>
                        {t("about.visitGamebanana")}
                      </Button>
                    </div>
                  </div>

                  <div className='rounded-lg border bg-card p-4'>
                    <div className='flex flex-col gap-2'>
                      <h3 className='font-semibold text-primary'>Tauri</h3>
                      <p className='text-muted-foreground text-sm'>
                        {t("about.tauriDescription")}
                      </p>
                      <Button
                        className='mt-2 w-fit'
                        onClick={() => open("https://tauri.app/")}
                        size='sm'
                        variant='outline'>
                        {t("about.visitTauri")}
                      </Button>
                    </div>
                  </div>

                  <div className='rounded-lg border bg-card p-4'>
                    <div className='flex flex-col gap-2'>
                      <h3 className='font-semibold text-primary'>shadcn/ui</h3>
                      <p className='text-muted-foreground text-sm'>
                        {t("about.shadcnDescription")}
                      </p>
                      <Button
                        className='mt-2 w-fit'
                        onClick={() => open("https://ui.shadcn.com/")}
                        size='sm'
                        variant='outline'>
                        {t("about.visitShadcn")}
                      </Button>
                    </div>
                  </div>

                  <div className='rounded-lg border bg-card p-4'>
                    <div className='flex flex-col gap-2'>
                      <h3 className='font-semibold text-primary'>
                        Tailwind CSS
                      </h3>
                      <p className='text-muted-foreground text-sm'>
                        {t("about.tailwindDescription")}
                      </p>
                      <Button
                        className='mt-2 w-fit'
                        onClick={() => open("https://tailwindcss.com/")}
                        size='sm'
                        variant='outline'>
                        {t("about.visitTailwind")}
                      </Button>
                    </div>
                  </div>

                  <div className='rounded-lg border bg-card p-4'>
                    <div className='flex flex-col gap-2'>
                      <h3 className='font-semibold'>
                        {t("about.openSourceCommunity")}
                      </h3>
                      <p className='text-muted-foreground text-sm'>
                        {t("about.openSourceDescription")}
                      </p>
                    </div>
                  </div>
                </div>
              </Section>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default CustomSettings;
