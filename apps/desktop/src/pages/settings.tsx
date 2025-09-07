import {
  type CustomSettingDto,
  CustomSettingType,
  customSettingTypeHuman,
} from '@deadlock-mods/utils';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import {
  FolderOpen,
  GamepadIcon,
  InfoIcon,
  MonitorIcon,
  PlusIcon,
  Settings,
  ShieldIcon,
  TrashIcon,
} from 'lucide-react';
import { Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import AddSettingDialog from '@/components/add-setting';
import ErrorBoundary from '@/components/error-boundary';
import { FlashbangToggle } from '@/components/flashbang-toggle';
import GameInfoManagement from '@/components/gameinfo-management';
import { LanguageSettings } from '@/components/language-settings';
import PageTitle from '@/components/page-title';
import PrivacySettings from '@/components/privacy-settings';
import { useConfirm } from '@/components/providers/alert-dialog';
import Section, { SectionSkeleton } from '@/components/section';
import SettingCard, { SettingCardSkeleton } from '@/components/setting-card';
import SystemSettings from '@/components/system-settings';
import ThemeSwitcher from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCustomSettings } from '@/lib/api';
import { SortType } from '@/lib/constants';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import type { LocalSetting } from '@/types/settings';

const CustomSettingsData = () => {
  const { t } = useTranslation();
  const { data, error } = useQuery('custom-settings', getCustomSettings, {
    suspense: true,
  });
  const { settings, toggleSetting } = usePersistedStore();

  useEffect(() => {
    if (error) {
      toast.error((error as Error)?.message ?? t('common.failedToFetchMods'));
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
    {} as Record<CustomSettingType, CustomSettingDto[]>
  );

  const customLocalSettings = Object.values(settings).filter((setting) =>
    setting.id.startsWith('local_setting_')
  );
  const customLocalSettingsByType = customLocalSettings.reduce(
    (acc, setting) => {
      acc[setting.type as CustomSettingType] = [
        ...(acc[setting.type as CustomSettingType] ?? []),
        setting as LocalSetting,
      ];
      return acc;
    },
    {} as Record<CustomSettingType, LocalSetting[]>
  );

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled])
    );
  }, [settings]);

  return (
    <>
      {Object.values(CustomSettingType).map((type: CustomSettingType) => (
        <Section
          action={
            <AddSettingDialog>
              <Button variant="outline">
                <PlusIcon className="h-4 w-4" /> {t('common.create')}
              </Button>
            </AddSettingDialog>
          }
          description={
            type === CustomSettingType.LAUNCH_OPTION
              ? t('settings.launchOptionsDescription')
              : customSettingTypeHuman[type]?.description || ''
          }
          key={type}
          title={
            type === CustomSettingType.LAUNCH_OPTION
              ? t('settings.launchOptions')
              : customSettingTypeHuman[type]?.title || ''
          }
        >
          <div className="grid grid-cols-1 gap-4">
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
  const { clearMods, mods } = usePersistedStore();
  const confirm = useConfirm();

  // Hooks für Default Sort
  const defaultSort = usePersistedStore((s) => s.defaultSort);
  const setDefaultSort = usePersistedStore((s) => s.setDefaultSort);

  const clearAllMods = async () => {
    if (!(await confirm(t('settings.confirmClearAllMods')))) {
      return;
    }
    try {
      await Promise.all(
        mods.map((mod) =>
          invoke('purge_mod', {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
          })
        )
      );
      clearMods();
      toast.success(t('settings.allModsCleared'));
    } catch (error) {
      logger.error(error);
      toast.error(t('settings.failedToClearMods'));
    }
  };

  return (
    <div className="flex h-[calc(100vh-160px)] w-full">
      <div className="flex w-full flex-col gap-4">
        <PageTitle className="px-4" title={t('navigation.settings')} />

        <Tabs className="flex h-full gap-6" defaultValue="launch-options">
          <TabsList className="h-fit w-48 flex-col gap-1 bg-background p-3">
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
              value="launch-options"
            >
              <Settings className="h-5 w-5" />
              {t('settings.launchOptions')}
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
              value="game"
            >
              <GamepadIcon className="h-5 w-5" />
              {t('settings.game')}
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
              value="application"
            >
              <MonitorIcon className="h-5 w-5" />
              {t('settings.application')}
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
              value="privacy"
            >
              <ShieldIcon className="h-5 w-5" />
              {t('settings.privacy')}
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
              value="about"
            >
              <InfoIcon className="h-5 w-5" />
              {t('settings.information')}
            </TabsTrigger>
          </TabsList>

          <div className="scrollbar-thin scrollbar-thumb-primary scrollbar-track-secondary flex-1 overflow-y-auto pr-4">
            <TabsContent className="mt-0 space-y-2" value="launch-options">
              <Suspense
                fallback={
                  <div className="grid grid-cols-1 gap-4">
                    <SectionSkeleton>
                      {Array.from({ length: 2 }, () => (
                        <SettingCardSkeleton key={crypto.randomUUID()} />
                      ))}
                    </SectionSkeleton>
                  </div>
                }
              >
                <ErrorBoundary>
                  <CustomSettingsData />
                </ErrorBoundary>
              </Suspense>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="game">
              <Section
                description={t('settings.gameConfigDescription')}
                title={t('settings.gameConfigManagement')}
              >
                <GameInfoManagement />
              </Section>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="application">
              <Section
                description={t('settings.systemSettingsDescription')}
                title={t('settings.systemSettings')}
              >
                <div className="grid grid-cols-1 gap-4">
                  <SystemSettings />
                </div>
              </Section>

              <Section
                description={t('settings.appearanceDescription')}
                title={t('settings.appearance')}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="font-bold text-sm">
                        {t('settings.theme')}
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        {t('settings.themeDescription')}
                      </p>
                    </div>
                    <ThemeSwitcher />
                  </div>

                  <FlashbangToggle />
                </div>
              </Section>

              <Section
                description={t('settings.languageSettingsDescription')}
                title={t('settings.languageSettings')}
              >
                <LanguageSettings />
              </Section>

              <Section
                description={t('settings.defaultSortDescription')}
                title={t('settings.defaultSortValue')}
              >
                <div className="flex flex-col gap-2">
                  <Label className="font-bold text-sm" id="default-sort-label">
                    {t('settings.defaultSort')}
                  </Label>
                  <Select
                    onValueChange={(v) => setDefaultSort(v as SortType)}
                    value={defaultSort}
                  >
                    <SelectTrigger
                      aria-labelledby="default-sort-label"
                      className="w-36"
                    >
                      <SelectValue
                        placeholder={t('settings.selectDefaultSort')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(SortType).map((type) => (
                          <SelectItem
                            className="capitalize"
                            key={type}
                            value={type}
                          >
                            {t(
                              `sorting.${type.replace(/\s+/g, '').toLowerCase()}`
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </Section>

              <Section
                description={t('settings.toolsDescription')}
                title={t('settings.tools')}
              >
                <div className="flex flex-wrap gap-4">
                  <Button
                    className="w-fit"
                    onClick={() => invoke('open_game_folder')}
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t('settings.openGameFolder')}
                  </Button>
                  <Button
                    className="w-fit"
                    onClick={() => invoke('open_mods_folder')}
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t('settings.openModsFolder')}
                  </Button>
                  <Button
                    className="w-fit"
                    onClick={() => invoke('open_mods_store')}
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t('settings.openModsStore')}
                  </Button>
                  <Button
                    className="w-fit"
                    onClick={clearAllMods}
                    variant="destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                    {t('settings.clearAllMods')}
                  </Button>
                </div>
              </Section>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="privacy">
              <Section
                description={t('privacy.description')}
                title={t('privacy.title')}
              >
                <div className="grid grid-cols-1 gap-4">
                  <PrivacySettings />
                </div>
              </Section>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="about">
              <Section
                description={t('about.description')}
                title={t('about.title')}
              >
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">GameBanana</h3>
                      <p className="text-muted-foreground text-sm">
                        {t('about.gamebananaDescription')}
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://gamebanana.com/')}
                        size="sm"
                        variant="outline"
                      >
                        {t('about.visitGamebanana')}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">Tauri</h3>
                      <p className="text-muted-foreground text-sm">
                        {t('about.tauriDescription')}
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://tauri.app/')}
                        size="sm"
                        variant="outline"
                      >
                        {t('about.visitTauri')}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">shadcn/ui</h3>
                      <p className="text-muted-foreground text-sm">
                        {t('about.shadcnDescription')}
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://ui.shadcn.com/')}
                        size="sm"
                        variant="outline"
                      >
                        {t('about.visitShadcn')}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">
                        Tailwind CSS
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('about.tailwindDescription')}
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://tailwindcss.com/')}
                        size="sm"
                        variant="outline"
                      >
                        {t('about.visitTailwind')}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold">
                        {t('about.openSourceCommunity')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('about.openSourceDescription')}
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
