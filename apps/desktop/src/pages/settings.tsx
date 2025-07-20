import AddSettingDialog from '@/components/add-setting';
import ErrorBoundary from '@/components/error-boundary';
import PageTitle from '@/components/page-title';
import { useConfirm } from '@/components/providers/alert-dialog';
import Section, { SectionSkeleton } from '@/components/section';
import SettingCard, { SettingCardSkeleton } from '@/components/setting-card';
import SystemSettings from '@/components/system-settings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCustomSettings } from '@/lib/api';
import { SortType } from '@/lib/constants';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { LocalSetting } from '@/types/settings';
import { CustomSettingDto, CustomSettingType, customSettingTypeHuman } from '@deadlock-mods/utils';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, PlusIcon, TrashIcon } from 'lucide-react';
import { Suspense, useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { toast } from 'sonner';

const CustomSettingsData = () => {
  const { data, error } = useQuery('custom-settings', getCustomSettings, { suspense: true });
  const { settings, toggleSetting } = usePersistedStore();

  useEffect(() => {
    if (error) toast.error((error as Error)?.message ?? 'Failed to fetch mods. Try again later.');
  }, [error]);

  const settingByType = data?.reduce(
    (acc, setting) => {
      acc[setting.type as CustomSettingType] = [...(acc[setting.type as CustomSettingType] ?? []), setting];
      return acc;
    },
    {} as Record<CustomSettingType, CustomSettingDto[]>
  );

  const customLocalSettings = Object.values(settings).filter((setting) => setting.id.startsWith('local_setting_'));
  const customLocalSettingsByType = customLocalSettings.reduce(
    (acc, setting) => {
      acc[setting.type as CustomSettingType] = [
        ...(acc[setting.type as CustomSettingType] ?? []),
        setting as LocalSetting
      ];
      return acc;
    },
    {} as Record<CustomSettingType, LocalSetting[]>
  );

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(Object.entries(settings).map(([id, setting]) => [id, setting.enabled]));
  }, [settings]);

  return (
    <>
      {Object.values(CustomSettingType).map((type) => (
        <Section
          key={type}
          title={customSettingTypeHuman[type].title}
          description={customSettingTypeHuman[type].description}
        >
          <div className="grid grid-cols-1 gap-4">
            {(settingByType?.[type] ?? []).map((setting) => (
              <SettingCard
                key={setting.id}
                setting={{
                  ...setting,
                  enabled: settingStatusById?.[setting.id] ?? false
                }}
                onChange={() => toggleSetting(setting.id, setting)}
              />
            ))}
            {(customLocalSettingsByType?.[type] ?? []).map((setting) => (
              <SettingCard key={setting.id} setting={setting} onChange={() => {}} />
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
    if (!(await confirm('Are you sure you want to clear all mods? This action cannot be undone.'))) {
      return;
    }
    try {
      await Promise.all(
        mods.map((mod) =>
          invoke('purge_mod', {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? []
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
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <PageTitle
        className="mb-8"
        title="Settings"
        action={
          <AddSettingDialog>
            <Button size="icon" variant="outline">
              <PlusIcon className="w-4 h-4" />
            </Button>
          </AddSettingDialog>
        }
      />
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4">
            <SectionSkeleton>
              {Array.from({ length: 2 }).map((_, index) => (
                <SettingCardSkeleton key={index} />
              ))}
            </SectionSkeleton>
          </div>
        }
      >
        <ErrorBoundary>
          <CustomSettingsData />
        </ErrorBoundary>
      </Suspense>
      <Section title="System Settings" description="Mod Manager Settings. These do not affect the game.">
        <div className="grid grid-cols-1 gap-4">
          <SystemSettings />
        </div>
      </Section>

      <Section title="Default Sort Value" description="Choose the default sort order for the Mods page.">
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-bold">Default Sort</Label>
          <Select value={defaultSort} onValueChange={(v) => setDefaultSort(v as SortType)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Select default sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(SortType).map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Tools" description="Utility functions for managing your mods">
        <div className="flex gap-4">
          <Button className="w-fit" variant="outline" onClick={() => invoke('open_game_folder')}>
            <FolderOpen className="w-4 h-4" />
            Open Game Folder
          </Button>
          <Button className="w-fit" variant="outline" onClick={() => invoke('open_mods_folder')}>
            <FolderOpen className="w-4 h-4" />
            Open Mods Folder
          </Button>
          <Button className="w-fit" variant="outline" onClick={() => invoke('open_mods_store')}>
            <FolderOpen className="w-4 h-4" />
            Open Mods Store
          </Button>
          <Button className="w-fit" variant="destructive" onClick={clearAllMods}>
            <TrashIcon className="w-4 h-4" />
            Clear All Mods
          </Button>
        </div>
      </Section>
    </div>
  );
};

export default CustomSettings;
