import type { CustomSettingDto, NSFWSettings } from "@deadlock-mods/shared";
import type {
  PresenceTextTemplatePair,
  PresenceTextTemplates,
} from "@deadlock-mods/deadlock-discord-presence";
import { DEFAULT_NSFW_SETTINGS } from "@deadlock-mods/shared";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand";
import { getPlugins } from "@/lib/plugins";
import type { CreateSettingSchema } from "@/lib/validation/create-setting";
import type { LocalSetting, SystemSetting } from "@/types/settings";
import type { State } from "..";

export type TelemetrySettings = {
  analyticsEnabled: boolean;
};

export type GamePresenceHeroOverrides = Record<string, PresenceTextTemplates>;

const DEFAULT_TELEMETRY_SETTINGS: TelemetrySettings = {
  analyticsEnabled: false,
};

const createEmptyPresenceTextTemplatePair = (): PresenceTextTemplatePair => ({
  details: "",
  state: "",
});

export const createDefaultGamePresenceTextTemplates =
  (): PresenceTextTemplates => ({
    mainMenu: createEmptyPresenceTextTemplatePair(),
    soloHideout: createEmptyPresenceTextTemplatePair(),
    partyHideout: createEmptyPresenceTextTemplatePair(),
    inQueue: createEmptyPresenceTextTemplatePair(),
    soloMatch: createEmptyPresenceTextTemplatePair(),
    partyMatch: createEmptyPresenceTextTemplatePair(),
    postMatch: createEmptyPresenceTextTemplatePair(),
    spectating: createEmptyPresenceTextTemplatePair(),
  });

export type SettingsState = {
  settings: Record<LocalSetting["id"], LocalSetting>;
  nsfwSettings: NSFWSettings;
  telemetrySettings: TelemetrySettings;
  perItemNSFWOverrides: Record<string, boolean>; // modId -> isVisible
  developerMode: boolean;
  ingestToolEnabled: boolean;
  autoUpdateEnabled: boolean;
  crosshairsEnabled: boolean;
  linuxGpuOptimization: "auto" | "on" | "off";
  enabledPlugins: Record<string, boolean>; // pluginId -> isEnabled
  gamePresenceEnabled: boolean;
  gamePresenceTextTemplates: PresenceTextTemplates;
  gamePresenceHeroOverrides: GamePresenceHeroOverrides;
  backupEnabled: boolean;
  maxBackupCount: number; // 0 means unlimited

  addSetting: (setting: LocalSetting) => void;
  removeSetting: (id: string) => void;
  createSetting: (setting: CreateSettingSchema) => void;
  toggleSetting: (
    id: string,
    setting: LocalSetting | SystemSetting | CustomSettingDto,
    newValue?: boolean,
  ) => void;

  // NSFW settings management
  updateNSFWSettings: (updates: Partial<NSFWSettings>) => void;
  setPerItemNSFWOverride: (modId: string, isVisible: boolean) => void;
  removePerItemNSFWOverride: (modId: string) => void;
  getPerItemNSFWOverride: (modId: string) => boolean | undefined;

  // Telemetry settings management
  updateTelemetrySettings: (updates: Partial<TelemetrySettings>) => void;

  // Developer mode management
  setDeveloperMode: (enabled: boolean) => void;

  // Ingest tool management
  setIngestToolEnabled: (enabled: boolean) => void;

  // Auto-update management
  setAutoUpdateEnabled: (enabled: boolean) => void;

  // Crosshairs management
  setCrosshairsEnabled: (enabled: boolean) => void;

  // Linux GPU optimization management
  setLinuxGpuOptimization: (value: "auto" | "on" | "off") => void;

  setGamePresenceEnabled: (enabled: boolean) => void;
  setGamePresenceTextTemplates: (templates: PresenceTextTemplates) => void;
  setGamePresenceHeroOverrides: (
    heroOverrides: GamePresenceHeroOverrides,
  ) => void;
  setGamePresenceHeroOverride: (
    heroCodename: string,
    templates: PresenceTextTemplates,
  ) => void;
  removeGamePresenceHeroOverride: (heroCodename: string) => void;
  updateGamePresenceTextTemplate: (
    key: keyof PresenceTextTemplates,
    template: PresenceTextTemplatePair,
  ) => void;
  resetGamePresenceTextTemplates: () => void;

  // Backup settings management
  setBackupEnabled: (enabled: boolean) => void;
  setMaxBackupCount: (count: number) => void;

  // Plugin management
  togglePlugin: (pluginId: string) => void;
  isPluginEnabled: (pluginId: string) => boolean;
};

export const settingsDeepMergeKeys = [
  "nsfwSettings",
  "telemetrySettings",
  "gamePresenceTextTemplates",
  "gamePresenceHeroOverrides",
] as const satisfies readonly (keyof SettingsState)[];

export const createSettingsSlice: StateCreator<State, [], [], SettingsState> = (
  set,
  get,
) => ({
  settings: {},
  nsfwSettings: DEFAULT_NSFW_SETTINGS,
  telemetrySettings: DEFAULT_TELEMETRY_SETTINGS,
  perItemNSFWOverrides: {},
  developerMode: false,
  ingestToolEnabled: true,
  autoUpdateEnabled: true,
  crosshairsEnabled: true,
  linuxGpuOptimization: "auto",
  enabledPlugins: {},
  gamePresenceEnabled: true,
  gamePresenceTextTemplates: createDefaultGamePresenceTextTemplates(),
  gamePresenceHeroOverrides: {},
  backupEnabled: true,
  maxBackupCount: 5,
  addSetting: (setting: LocalSetting) =>
    set((state) => ({
      settings: { ...state.settings, [setting.id]: setting },
    })),
  removeSetting: (id: string) =>
    set((state) => ({
      settings: Object.fromEntries(
        Object.entries(state.settings).filter(([k]) => k !== id),
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
    newValue?: boolean,
  ) =>
    set((state) => {
      const existingSetting = state.settings[id];

      if (!existingSetting) {
        const newSetting: LocalSetting = {
          id,
          value: setting.value,
          type: setting.type,
          description: setting.description,
          enabled: newValue ?? true,
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

  // Developer mode management
  setDeveloperMode: (enabled: boolean) =>
    set(() => ({
      developerMode: enabled,
    })),

  // Ingest tool management
  setIngestToolEnabled: (enabled: boolean) =>
    set(() => ({
      ingestToolEnabled: enabled,
    })),

  // Auto-update management
  setAutoUpdateEnabled: (enabled: boolean) =>
    set(() => ({
      autoUpdateEnabled: enabled,
    })),

  // Crosshairs management
  setCrosshairsEnabled: (enabled: boolean) =>
    set(() => ({
      crosshairsEnabled: enabled,
    })),

  // Linux GPU optimization management
  setLinuxGpuOptimization: (value: "auto" | "on" | "off") =>
    set(() => ({
      linuxGpuOptimization: value,
    })),

  setGamePresenceEnabled: (enabled: boolean) =>
    set((state) => ({
      gamePresenceEnabled: enabled,
      ...(enabled
        ? { enabledPlugins: { ...state.enabledPlugins, discord: false } }
        : {}),
    })),

  setGamePresenceTextTemplates: (templates: PresenceTextTemplates) =>
    set(() => ({
      gamePresenceTextTemplates: templates,
    })),

  setGamePresenceHeroOverrides: (heroOverrides: GamePresenceHeroOverrides) =>
    set(() => ({
      gamePresenceHeroOverrides: heroOverrides,
    })),

  setGamePresenceHeroOverride: (
    heroCodename: string,
    templates: PresenceTextTemplates,
  ) =>
    set((state) => ({
      gamePresenceHeroOverrides: {
        ...state.gamePresenceHeroOverrides,
        [heroCodename]: templates,
      },
    })),

  removeGamePresenceHeroOverride: (heroCodename: string) =>
    set((state) => {
      const next = { ...state.gamePresenceHeroOverrides };
      delete next[heroCodename];
      return { gamePresenceHeroOverrides: next };
    }),

  updateGamePresenceTextTemplate: (
    key: keyof PresenceTextTemplates,
    template: PresenceTextTemplatePair,
  ) =>
    set((state) => ({
      gamePresenceTextTemplates: {
        ...state.gamePresenceTextTemplates,
        [key]: template,
      },
    })),

  resetGamePresenceTextTemplates: () =>
    set(() => ({
      gamePresenceTextTemplates: createDefaultGamePresenceTextTemplates(),
    })),

  setBackupEnabled: (enabled: boolean) =>
    set(() => ({
      backupEnabled: enabled,
    })),

  setMaxBackupCount: (count: number) =>
    set(() => ({
      maxBackupCount: count,
    })),

  // Plugin management
  togglePlugin: (pluginId: string) =>
    set((state) => {
      const current = state.enabledPlugins[pluginId] ?? false;
      const willEnable = !current;

      if (!willEnable) {
        return {
          enabledPlugins: { ...state.enabledPlugins, [pluginId]: false },
        };
      }

      const all = getPlugins().map((p) => p.manifest);
      const manifest = all.find((m) => m.id === pluginId);
      const forwardDisable = Array.isArray(manifest?.disabledPlugins)
        ? manifest!.disabledPlugins!
        : [];
      const reverseDisable = all
        .filter(
          (m) =>
            Array.isArray(m.disabledPlugins) &&
            m.disabledPlugins!.includes(pluginId),
        )
        .map((m) => m.id);

      const next = { ...state.enabledPlugins, [pluginId]: true } as Record<
        string,
        boolean
      >;
      for (const id of forwardDisable) next[id] = false;
      for (const id of reverseDisable) next[id] = false;

      return {
        enabledPlugins: next,
        ...(pluginId === "discord" ? { gamePresenceEnabled: false } : {}),
      };
    }),

  isPluginEnabled: (pluginId: string) => {
    return get().enabledPlugins[pluginId] ?? false;
  },
});
