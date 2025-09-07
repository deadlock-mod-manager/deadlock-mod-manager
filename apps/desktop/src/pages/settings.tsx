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
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import AddSettingDialog from '@/components/add-setting';
import ErrorBoundary from '@/components/error-boundary';
import GameInfoManagement from '@/components/gameinfo-management';
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
  const { data, error } = useQuery('custom-settings', getCustomSettings, {
    suspense: true,
  });
  const { settings, toggleSetting } = usePersistedStore();

  useEffect(() => {
    if (error) {
      toast.error(
        (error as Error)?.message ?? 'Failed to fetch mods. Try again later.'
      );
    }
  }, [error]);

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
      {Object.values(CustomSettingType).map((type) => (
        <Section
          action={
            <AddSettingDialog>
              <Button variant="outline">
                <PlusIcon className="h-4 w-4" /> Create
              </Button>
            </AddSettingDialog>
          }
          description={customSettingTypeHuman[type].description}
          key={type}
          title={customSettingTypeHuman[type].title}
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
  const { clearMods, mods } = usePersistedStore();
  const confirm = useConfirm();

  // Hooks für Default Sort
  const defaultSort = usePersistedStore((s) => s.defaultSort);
  const setDefaultSort = usePersistedStore((s) => s.setDefaultSort);

  const clearAllMods = async () => {
    if (
      !(await confirm(
        'Are you sure you want to clear all mods? This action cannot be undone.'
      ))
    ) {
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
      toast.success('All mods have been cleared');
    } catch (error) {
      logger.error(error);
      toast.error('Failed to clear mods');
    }
  };

  return (
    <div className="flex h-[calc(100vh-160px)] w-full">
      <div className="flex w-full flex-col gap-4">
        <PageTitle className="px-4" title="Settings" />

        <Tabs className="flex h-full gap-6" defaultValue="launch-options">
          <TabsList className="h-fit w-48 flex-col gap-1 bg-background p-3">
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm"
              value="launch-options"
            >
              <Settings className="h-5 w-5" />
              Launch Options
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm"
              value="game"
            >
              <GamepadIcon className="h-5 w-5" />
              Game
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm"
              value="application"
            >
              <MonitorIcon className="h-5 w-5" />
              Application
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm"
              value="privacy"
            >
              <ShieldIcon className="h-5 w-5" />
              Privacy
            </TabsTrigger>
            <TabsTrigger
              className="h-12 w-full justify-start gap-3 px-4 py-3 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-secondary data-[state=active]:shadow-sm"
              value="about"
            >
              <InfoIcon className="h-5 w-5" />
              About
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
                description="Manage gameinfo.gi file backup, restoration, and validation for safe modding."
                title="Game Configuration Management"
              >
                <GameInfoManagement />
              </Section>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="application">
              <Section
                description="Mod Manager Settings. These do not affect the game."
                title="System Settings"
              >
                <div className="grid grid-cols-1 gap-4">
                  <SystemSettings />
                </div>
              </Section>

              <Section
                description="Customize the appearance of the application."
                title="Appearance"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="font-bold text-sm">Theme</Label>
                      <p className="text-sm text-muted-foreground">
                        Choose between light, dark, or system theme
                      </p>
                    </div>
                    <ThemeSwitcher />
                  </div>
                </div>
              </Section>

              <Section
                description="Choose the default sort order for the Mods page."
                title="Default Sort Value"
              >
                <div className="flex flex-col gap-2">
                  <Label className="font-bold text-sm">Default Sort</Label>
                  <Select
                    onValueChange={(v) => setDefaultSort(v as SortType)}
                    value={defaultSort}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Select default sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(SortType).map((type) => (
                          <SelectItem
                            className="capitalize"
                            key={type}
                            value={type}
                          >
                            {type}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </Section>

              <Section
                description="Utility functions for managing your mods"
                title="Tools"
              >
                <div className="flex flex-wrap gap-4">
                  <Button
                    className="w-fit"
                    onClick={() => invoke('open_game_folder')}
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Open Game Folder
                  </Button>
                  <Button
                    className="w-fit"
                    onClick={() => invoke('open_mods_folder')}
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Open Mods Folder
                  </Button>
                  <Button
                    className="w-fit"
                    onClick={() => invoke('open_mods_store')}
                    variant="outline"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Open Mods Store
                  </Button>
                  <Button
                    className="w-fit"
                    onClick={clearAllMods}
                    variant="destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Clear All Mods
                  </Button>
                </div>
              </Section>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="privacy">
              <Section
                description="Control how NSFW (Not Safe For Work) content is displayed and filtered."
                title="Privacy & Content"
              >
                <div className="grid grid-cols-1 gap-4">
                  <PrivacySettings />
                </div>
              </Section>
            </TabsContent>

            <TabsContent className="mt-0 space-y-2" value="about">
              <Section
                description="Special thanks to the platforms and communities that make this project possible"
                title="Acknowledgments"
              >
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">GameBanana</h3>
                      <p className="text-muted-foreground text-sm">
                        Our primary mod source and the backbone of this
                        application. GameBanana provides the comprehensive mod
                        database and API that makes browsing, discovering, and
                        downloading Deadlock mods possible.
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://gamebanana.com/')}
                        size="sm"
                        variant="outline"
                      >
                        Visit GameBanana
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">Tauri</h3>
                      <p className="text-muted-foreground text-sm">
                        The powerful framework that enables this cross-platform
                        desktop application. Tauri combines the best of web
                        technologies with native performance and security.
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://tauri.app/')}
                        size="sm"
                        variant="outline"
                      >
                        Visit Tauri
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">shadcn/ui</h3>
                      <p className="text-muted-foreground text-sm">
                        Beautiful and accessible React components that provide
                        the foundation for our modern user interface. Copy,
                        paste, and customize to perfection.
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://ui.shadcn.com/')}
                        size="sm"
                        variant="outline"
                      >
                        Visit shadcn/ui
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold text-primary">
                        Tailwind CSS
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        The utility-first CSS framework that powers our
                        responsive design and consistent styling throughout the
                        application.
                      </p>
                      <Button
                        className="mt-2 w-fit"
                        onClick={() => open('https://tailwindcss.com/')}
                        size="sm"
                        variant="outline"
                      >
                        Visit Tailwind CSS
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold">Open Source Community</h3>
                      <p className="text-muted-foreground text-sm">
                        Built with amazing open source technologies including
                        React, TypeScript, and many other libraries that make
                        modern applications possible. Thank you to all
                        contributors and maintainers.
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
