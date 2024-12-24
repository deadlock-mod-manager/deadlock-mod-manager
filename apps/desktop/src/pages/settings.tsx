import AddSettingDialog from '@/components/add-setting';
import ErrorBoundary from '@/components/error-boundary';
import PageTitle from '@/components/page-title';
import Section, { SectionSkeleton } from '@/components/section';
import SettingCard, { SettingCardSkeleton } from '@/components/setting-card';
import SystemSettings from '@/components/system-settings';
import { Button } from '@/components/ui/button';
import { getCustomSettings } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { LocalSetting } from '@/types/settings';
import { CustomSettingDto, CustomSettingType, customSettingTypeHuman } from '@deadlock-mods/utils';
import { PlusIcon } from 'lucide-react';
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
      acc[setting.type as CustomSettingType] = [...(acc[setting.type as CustomSettingType] ?? []), setting];
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
    </div>
  );
};

export default CustomSettings;
