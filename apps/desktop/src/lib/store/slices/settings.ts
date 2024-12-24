import { CreateSettingSchema } from '@/lib/validation/create-setting';
import { LocalSetting, SystemSetting } from '@/types/settings';
import { CustomSettingDto } from '@deadlock-mods/utils';
import { v4 as uuidv4 } from 'uuid';
import { StateCreator } from 'zustand';
import { State } from '..';

export interface SettingsState {
  settings: Record<LocalSetting['id'], LocalSetting>;

  addSetting: (setting: LocalSetting) => void;
  removeSetting: (id: string) => void;
  createSetting: (setting: CreateSettingSchema) => void;
  toggleSetting: (id: string, setting: LocalSetting | SystemSetting | CustomSettingDto, newValue?: boolean) => void;
}

export const createSettingsSlice: StateCreator<State, [], [], SettingsState> = (set) => ({
  settings: {},
  addSetting: (setting: LocalSetting) => set((state) => ({ settings: { ...state.settings, [setting.id]: setting } })),
  removeSetting: (id: string) =>
    set((state) => ({ settings: Object.fromEntries(Object.entries(state.settings).filter(([k]) => k !== id)) })),
  createSetting: (setting: CreateSettingSchema) => {
    const newSetting = {
      id: 'local_setting_' + uuidv4(),
      value: setting.value,
      type: setting.type,
      description: setting.description,
      enabled: false,
      key: setting.key,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    set((state) => ({ settings: { ...state.settings, [newSetting.id]: newSetting } }));
  },
  toggleSetting: (id: string, setting: LocalSetting | SystemSetting | CustomSettingDto, newValue?: boolean) =>
    set((state) => {
      const existingSetting = state.settings[id];

      if (!existingSetting) {
        const newSetting: LocalSetting = {
          id,
          value: setting.value,
          type: setting.type,
          description: setting.description,
          enabled: true,
          key: setting.key,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return { settings: { ...state.settings, [id]: newSetting } };
      }

      return {
        settings: { ...state.settings, [id]: { ...existingSetting, enabled: newValue ?? !existingSetting.enabled } }
      };
    })
});
