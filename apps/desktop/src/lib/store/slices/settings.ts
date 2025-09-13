import type { CustomSettingDto, NSFWSettings } from '@deadlock-mods/utils';
import { DEFAULT_NSFW_SETTINGS } from '@deadlock-mods/utils';
import { v4 as uuidv4 } from 'uuid';
import type { StateCreator } from 'zustand';
import type { CreateSettingSchema } from '@/lib/validation/create-setting';
import type { LocalSetting, SystemSetting } from '@/types/settings';
import type { State } from '..';

export type TelemetrySettings = {
  posthogEnabled: boolean;
};

const DEFAULT_TELEMETRY_SETTINGS: TelemetrySettings = {
  posthogEnabled: true,
};

export type SettingsState = {
  settings: Record<LocalSetting['id'], LocalSetting>;
  nsfwSettings: NSFWSettings;
  telemetrySettings: TelemetrySettings;
  perItemNSFWOverrides: Record<string, boolean>; // modId -> isVisible

  addSetting: (setting: LocalSetting) => void;
  removeSetting: (id: string) => void;
  createSetting: (setting: CreateSettingSchema) => void;
  toggleSetting: (
    id: string,
    setting: LocalSetting | SystemSetting | CustomSettingDto,
    newValue?: boolean
  ) => void;

  // NSFW settings management
  updateNSFWSettings: (updates: Partial<NSFWSettings>) => void;
  setPerItemNSFWOverride: (modId: string, isVisible: boolean) => void;
  removePerItemNSFWOverride: (modId: string) => void;
  getPerItemNSFWOverride: (modId: string) => boolean | undefined;

  // Telemetry settings management
  updateTelemetrySettings: (updates: Partial<TelemetrySettings>) => void;
};

export const createSettingsSlice: StateCreator<State, [], [], SettingsState> = (
  set,
  get
) => ({
  settings: {},
  nsfwSettings: DEFAULT_NSFW_SETTINGS,
  telemetrySettings: DEFAULT_TELEMETRY_SETTINGS,
  perItemNSFWOverrides: {},
  addSetting: (setting: LocalSetting) =>
    set((state) => ({
      settings: { ...state.settings, [setting.id]: setting },
    })),
  removeSetting: (id: string) =>
    set((state) => ({
      settings: Object.fromEntries(
        Object.entries(state.settings).filter(([k]) => k !== id)
      ),
    })),
  createSetting: (setting: CreateSettingSchema) => {
    const newSetting = {
      id: `local_setting_${uuidv4()}`,
      value: setting.value,
      type: setting.type,
      description: setting.description,
      enabled: false,
      key: setting.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({
      settings: { ...state.settings, [newSetting.id]: newSetting },
    }));
  },
  toggleSetting: (
    id: string,
    setting: LocalSetting | SystemSetting | CustomSettingDto,
    newValue?: boolean
  ) =>
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
          updatedAt: new Date(),
        };
        return { settings: { ...state.settings, [id]: newSetting } };
      }

      return {
        settings: {
          ...state.settings,
          [id]: {
            ...existingSetting,
            enabled: newValue ?? !existingSetting.enabled,
          },
        },
      };
    }),

  // NSFW settings management
  updateNSFWSettings: (updates: Partial<NSFWSettings>) =>
    set((state) => ({
      nsfwSettings: { ...state.nsfwSettings, ...updates },
    })),

  setPerItemNSFWOverride: (modId: string, isVisible: boolean) =>
    set((state) => ({
      perItemNSFWOverrides: {
        ...state.perItemNSFWOverrides,
        [modId]: isVisible,
      },
    })),

  removePerItemNSFWOverride: (modId: string) =>
    set((state) => {
      const newOverrides = { ...state.perItemNSFWOverrides };
      delete newOverrides[modId];
      return { perItemNSFWOverrides: newOverrides };
    }),

  getPerItemNSFWOverride: (modId: string) => {
    return get().perItemNSFWOverrides[modId];
  },

  // Telemetry settings management
  updateTelemetrySettings: (updates: Partial<TelemetrySettings>) =>
    set((state) => ({
      telemetrySettings: { ...state.telemetrySettings, ...updates },
    })),
});
