import { useMemo } from 'react';
import { NOOP } from '@/lib/constants';
import { usePersistedStore } from '@/lib/store';
import type { SystemSetting } from '@/types/settings';
import SettingCard from './setting-card';

const SYSTEM_SETTINGS: SystemSetting[] = [
  {
    id: 'auto-reapply-mods',
    description: 'Automatically reapply mods when the mod manager is launched.',
    enabled: false,
    onChange: NOOP,
  },
  {
    id: 'launch-vanilla-no-args',
    description:
      'Launch the game in vanilla mode without additional arguments.',
    enabled: false,
    onChange: NOOP,
  },
].map((setting) => ({
  ...setting,
  key: '',
  value: '',
  type: 'boolean',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const SystemSettings = () => {
  const { settings, toggleSetting } = usePersistedStore();

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled])
    );
  }, [settings]);

  const systemSettings = useMemo(() => {
    return SYSTEM_SETTINGS.map((setting) => ({
      ...setting,
      enabled: settingStatusById[setting.id] ?? false,
      onChange: (newValue: boolean) => {
        toggleSetting(setting.id, setting, newValue);
      },
    }));
  }, [settingStatusById, toggleSetting]);

  return (
    <>
      {systemSettings.map((setting) => (
        <SettingCard
          key={setting.id}
          onChange={setting.onChange}
          setting={setting}
        />
      ))}
    </>
  );
};

export default SystemSettings;
