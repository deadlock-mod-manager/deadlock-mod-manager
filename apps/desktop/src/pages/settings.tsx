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
// Flashbang is now a plugin; legacy toggle removed
import { GamePathSettings } from "@/components/settings/game-path-settings";
import GameInfoManagement from "@/components/settings/gameinfo-management";
import { LanguageSettings } from "@/components/settings/language-settings";
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
import { getCustomSettings } from "@/lib/api";
import { SortType } from "@/lib/constants";
import logger from "@/lib/logger";
import { getPlugins } from "@/lib/plugins";
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
  const { clearMods, localMods: mods } = usePersistedStore();
  const confirm = useConfirm();
  const { analytics } = useAnalyticsContext();
  const location = useLocation();
  const initialTab =
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

  const clearAllMods = async () => {
    if (!(await confirm(t("settings.confirmClearAllMods")))) {
      return;
    }
    try {
      await Promise.all(
        mods.map((mod) =>
          invoke("purge_mod", {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
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
    <div className='flex h-[calc(100vh-160px)] w-full'>
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
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='plugin'>
              <PlugIcon className='h-5 w-5' />
              {t("settings.plugin")}
            </TabsTrigger>
            <TabsTrigger
              className='h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground'
              value='tools'>
              <WrenchIcon className='h-5 w-5' />
              {t("settings.tools")}
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

            <TabsContent className='mt-0 space-y-2' value='plugin'>
              <Section
                description={t("settings.pluginDescription")}
                title={t("settings.plugin")}>
                <PluginList />
              </Section>
            </TabsContent>

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
                    onClick={() => invoke("open_mods_folder")}
                    variant='outline'>
                    <FolderOpen className='h-4 w-4' />
                    {t("settings.openModsFolder")}
                  </Button>
                  <Button
                    className='w-fit'
                    onClick={() => invoke("open_mods_store")}
                    variant='outline'>
                    <FolderOpen className='h-4 w-4' />
                    {t("settings.openModsStore")}
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

import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  TagIcon,
  UserIcon,
} from "@deadlock-mods/ui/icons";
import { useNavigate } from "react-router";
import type { LoadedPlugin } from "@/types/plugins";

const PluginList = () => {
  const { t } = useTranslation();
  const plugins = getPlugins();
  const navigate = useNavigate();
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(
    new Set(),
  );

  if (plugins.length === 0) {
    return (
      <div className='text-muted-foreground text-sm'>
        {t("common.none") ?? ""}
      </div>
    );
  }

  const toggleExpanded = (pluginId: string) => {
    setExpandedPlugins((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pluginId)) {
        newSet.delete(pluginId);
      } else {
        newSet.add(pluginId);
      }
      return newSet;
    });
  };

  return (
    <div className='max-h-[50vh] overflow-y-auto rounded-md border'>
      <ul className='divide-y'>
        {plugins.map((p: LoadedPlugin) => {
          const isExpanded = expandedPlugins.has(p.manifest.id);
          return (
            <li key={p.manifest.id}>
              <div
                className='flex items-center gap-4 p-3 cursor-pointer hover:bg-accent/50 transition-colors'
                onClick={() => toggleExpanded(p.manifest.id)}>
                <div className='flex items-center gap-2'>
                  {isExpanded ? (
                    <ChevronDownIcon className='h-4 w-4 text-muted-foreground' />
                  ) : (
                    <ChevronRightIcon className='h-4 w-4 text-muted-foreground' />
                  )}
                  {p.iconUrl ? (
                    <img
                      alt={p.manifest.id}
                      className='h-12 w-12'
                      src={p.iconUrl}
                    />
                  ) : (
                    <PlugIcon className='h-12 w-12 text-muted-foreground' />
                  )}
                </div>
                <div className='flex min-w-0 flex-1 flex-col'>
                  <div className='flex items-center gap-2'>
                    <span className='truncate font-medium'>
                      {t(p.manifest.nameKey)}
                    </span>
                    {p.manifest.tags?.includes("official") && (
                      <span className='rounded bg-primary/10 px-2 py-0.5 text-primary text-xs'>
                        official
                      </span>
                    )}
                  </div>
                  <span className='text-muted-foreground truncate text-sm mt-0.5'>
                    {t(p.manifest.descriptionKey)}
                  </span>
                </div>
                <div className='ml-4 flex items-center gap-2 flex-shrink-0'>
                  <button
                    className='inline-flex items-center gap-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50'
                    disabled={!p.entryImporter}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        p.manifest.id === "sudo" ||
                        p.manifest.id === "themes"
                      ) {
                        toast.info("This plugin is still in development.");
                      }
                      navigate(`/plugins/${p.manifest.id}`);
                    }}
                    type='button'>
                    {t("common.open")}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className='px-3 pb-3 border-t bg-muted/20'>
                  <div className='flex flex-col gap-3 mt-3 ml-6'>
                    {/* Detailed Description */}
                    <div className='text-sm text-muted-foreground leading-relaxed'>
                      {t(`plugins.${p.manifest.id}.detailedDescription`)}
                    </div>

                    {/* Usage Instructions */}
                    <div className='text-sm text-muted-foreground leading-relaxed'>
                      <strong className='text-foreground'>
                        {t("plugins.usageInstructions", "Usage Instructions")}:
                      </strong>
                      <br />
                      {t(`plugins.${p.manifest.id}.usageInstructions`)}
                    </div>

                    {/* Plugin Details */}
                    <div className='flex flex-col gap-2 pt-2 border-t border-border/50'>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <TagIcon className='h-4 w-4' />
                        <span>v{p.manifest.version}</span>
                      </div>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <UserIcon className='h-4 w-4' />
                        <span>{p.manifest.author}</span>
                      </div>
                      {p.manifest.homepageUrl && (
                        <div className='flex items-center gap-2 text-sm'>
                          <ExternalLinkIcon className='h-4 w-4 text-muted-foreground' />
                          <a
                            className='text-primary hover:underline'
                            href={p.manifest.homepageUrl}
                            target='_blank'
                            rel='noreferrer'
                            onClick={(e) => e.stopPropagation()}>
                            Homepage
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
