import logger from "@/lib/logger";
import { isPlainObject } from "./merge";

type MutableState = Record<string, unknown>;

export type MigrationStep = {
  to: number;
  label: string;
  apply: (state: MutableState) => void;
};

// Each step represents one version bump. Steps must be idempotent: re-running a
// step against state that already satisfies its post-condition must be a no-op
// (use ??= or shape guards rather than unconditional assignment) so that
// bumping the store version to re-run prior steps for already-migrated users
// is safe.
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  {
    to: 2,
    label: "add-profiles-system",
    apply: (state) => {
      if (isPlainObject(state.profiles)) {
        return;
      }
      const now = new Date();
      const enabledMods: Record<
        string,
        { remoteId: string; enabled: boolean; lastModified: Date }
      > = {};
      if (Array.isArray(state.localMods)) {
        for (const mod of state.localMods) {
          if (!isPlainObject(mod)) continue;
          if (mod.status === "installed" && typeof mod.remoteId === "string") {
            enabledMods[mod.remoteId] = {
              remoteId: mod.remoteId,
              enabled: true,
              lastModified: now,
            };
          }
        }
      }
      state.profiles = {
        default: {
          id: "default",
          name: "Default Profile",
          description: "The default mod profile",
          createdAt: now,
          lastUsed: now,
          enabledMods,
          isDefault: true,
        },
      };
      state.activeProfileId ??= "default";
      state.isSwitching ??= false;
    },
  },
  {
    to: 3,
    label: "add-foldername-to-profiles",
    apply: (state) => {
      if (!isPlainObject(state.profiles)) return;
      for (const [profileId, profile] of Object.entries(state.profiles)) {
        if (!isPlainObject(profile)) continue;
        if (profile.folderName !== undefined) continue;
        if (profileId === "default" || profile.isDefault === true) {
          profile.folderName = null;
          continue;
        }
        const profileName =
          typeof profile.name === "string" ? profile.name : "profile";
        const sanitizedName = profileName
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "-")
          .replace(/^-+|-+$/g, "");
        profile.folderName = `${profileId}_${sanitizedName}`;
      }
    },
  },
  {
    to: 4,
    label: "add-mods-array-to-profiles",
    apply: (state) => {
      if (!isPlainObject(state.profiles)) return;
      const activeProfileId =
        typeof state.activeProfileId === "string"
          ? state.activeProfileId
          : null;
      const localMods = Array.isArray(state.localMods) ? state.localMods : [];
      for (const [profileId, profile] of Object.entries(state.profiles)) {
        if (!isPlainObject(profile)) continue;
        if (Array.isArray(profile.mods)) continue;
        profile.mods = profileId === activeProfileId ? [...localMods] : [];
      }
    },
  },
  {
    to: 5,
    label: "add-crosshair-history",
    apply: (state) => {
      state.activeCrosshairHistory ??= [];
    },
  },
  {
    to: 6,
    label: "add-active-crosshair-field",
    apply: (state) => {
      if ("activeCrosshair" in state) return;
      const history = state.activeCrosshairHistory;
      state.activeCrosshair =
        Array.isArray(history) && history.length > 0 ? history[0] : null;
    },
  },
  {
    to: 7,
    label: "add-crosshair-filters-field",
    apply: (state) => {
      if (isPlainObject(state.crosshairFilters)) return;
      state.crosshairFilters = {
        selectedHeroes: [],
        selectedTags: [],
        currentSort: "last updated",
        filterMode: "include",
        searchQuery: "",
      };
    },
  },
  {
    to: 8,
    label: "add-linux-gpu-optimization-field",
    apply: (state) => {
      state.linuxGpuOptimization ??= "auto";
    },
  },
  {
    to: 9,
    label: "rename-filter-fields-add-hide-outdated",
    apply: (state) => {
      const modsFilters = state.modsFilters;
      if (!isPlainObject(modsFilters)) return;
      if ("showAudioOnly" in modsFilters) {
        modsFilters.hideAudio ??= false;
        delete modsFilters.showAudioOnly;
      }
      if ("showNSFW" in modsFilters) {
        modsFilters.hideNSFW ??= false;
        delete modsFilters.showNSFW;
      }
      modsFilters.hideOutdated ??= false;
    },
  },
  {
    to: 10,
    label: "reset-stuck-installing-mods",
    apply: (state) => {
      const resetInstalling = (mod: unknown) => {
        if (!isPlainObject(mod)) return;
        if (mod.status === "installing") {
          mod.status = "downloaded";
        }
      };
      if (Array.isArray(state.localMods)) {
        for (const mod of state.localMods) resetInstalling(mod);
      }
      if (isPlainObject(state.profiles)) {
        for (const profile of Object.values(state.profiles)) {
          if (!isPlainObject(profile)) continue;
          if (!Array.isArray(profile.mods)) continue;
          for (const mod of profile.mods) resetInstalling(mod);
        }
      }
    },
  },
  {
    to: 11,
    label: "selectedDownload-to-selectedDownloads",
    apply: (state) => {
      const migrate = (mod: unknown) => {
        if (!isPlainObject(mod)) return;
        const selectedDownload = mod.selectedDownload;
        if (selectedDownload && !mod.selectedDownloads) {
          mod.selectedDownloads = [selectedDownload];
          delete mod.selectedDownload;
        }
      };
      if (Array.isArray(state.localMods)) {
        for (const mod of state.localMods) migrate(mod);
      }
      if (isPlainObject(state.profiles)) {
        for (const profile of Object.values(state.profiles)) {
          if (!isPlainObject(profile)) continue;
          if (!Array.isArray(profile.mods)) continue;
          for (const mod of profile.mods) migrate(mod);
        }
      }
    },
  },
  {
    to: 12,
    label: "linux-gpu-optimization-tristate",
    apply: (state) => {
      const current = state.linuxGpuOptimization;
      if (current === true) {
        state.linuxGpuOptimization = "auto";
      } else if (current === false) {
        state.linuxGpuOptimization = "off";
      } else if (current !== "auto" && current !== "on" && current !== "off") {
        state.linuxGpuOptimization = "auto";
      }
    },
  },
  {
    to: 13,
    label: "add-backup-settings",
    apply: (state) => {
      state.backupEnabled ??= true;
      state.maxBackupCount ??= 5;
    },
  },
  {
    to: 14,
    label: "add-fileserver-settings",
    apply: (state) => {
      state.fileserverPreference ??= "default";
      if (!isPlainObject(state.fileserverLatencyMs)) {
        state.fileserverLatencyMs = {};
      }
    },
  },
  {
    to: 15,
    label: "mods-filters-audio-map-quick-filter",
    apply: (state) => {
      const modsFilters = state.modsFilters;
      if (!isPlainObject(modsFilters)) return;
      if ("hideAudio" in modsFilters) {
        const hideAudio = modsFilters.hideAudio;
        modsFilters.audioQuickFilter ??= hideAudio === true ? "exclude" : "off";
        delete modsFilters.hideAudio;
      } else {
        modsFilters.audioQuickFilter ??= "off";
      }
      if ("hideMap" in modsFilters) {
        const hideMap = modsFilters.hideMap;
        modsFilters.mapQuickFilter ??= hideMap === true ? "exclude" : "off";
        delete modsFilters.hideMap;
      } else {
        modsFilters.mapQuickFilter ??= "off";
      }
    },
  },
  {
    to: 16,
    label: "add-proxy-config",
    apply: (state) => {
      if (isPlainObject(state.proxyConfig)) return;
      state.proxyConfig = {
        enabled: false,
        protocol: "http",
        host: "",
        port: 8080,
        authEnabled: false,
        username: "",
        password: "",
        noProxy: "",
      };
    },
  },
  {
    to: 17,
    label: "add-occult-geometry-toggles",
    apply: (state) => {
      state.showOccultGeometry ??= true;
      state.animateOccultGeometry ??= true;
    },
  },
  {
    to: 18,
    label: "reset-detected-hero",
    apply: (state) => {
      // One-shot reset, keeping the original v17->v18 semantics: clear
      // detectedHero across mods and profile mods so the parser re-runs.
      // This is not idempotent across re-runs of the same step, but the
      // step only fires when fromVersion < 18, and bumping to 19 will not
      // re-trigger it (steps run only once per persisted version).
      const stripDetected = (mod: unknown) => {
        if (!isPlainObject(mod)) return;
        delete mod.detectedHero;
      };
      if (Array.isArray(state.localMods)) {
        for (const mod of state.localMods) stripDetected(mod);
      }
      if (isPlainObject(state.profiles)) {
        for (const profile of Object.values(state.profiles)) {
          if (!isPlainObject(profile)) continue;
          if (!Array.isArray(profile.mods)) continue;
          for (const mod of profile.mods) stripDetected(mod);
        }
      }
    },
  },
  {
    to: 19,
    label: "add-hero-parser-interval",
    apply: (state) => {
      // Fixes the duplicate `if (version <= 15)` block at the bottom of the
      // pre-refactor migrate(): it was assigning unconditionally and re-firing
      // on every hydrate from <v15, silently overwriting any user-set value.
      // Bumped to v19 so it runs exactly once for users currently at v18.
      state.heroParserIntervalSeconds ??= 30;
    },
  },
];

const STEP_TARGET_VERSIONS: readonly number[] = MIGRATION_STEPS.map(
  (step) => step.to,
);

export const LATEST_VERSION: number =
  STEP_TARGET_VERSIONS.length > 0 ? Math.max(...STEP_TARGET_VERSIONS) : 1;

const restoreSnapshot = (target: MutableState, snapshot: MutableState) => {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, snapshot);
};

// Wrapping migrate keeps a single bug from nuking the entire persisted store.
// Each step runs against a structuredClone snapshot so partial mutations from a
// throwing step are reverted, then the chain continues with the next step.
// If the top-level state isn't a plain object, return it unchanged so zustand's
// own merge step takes the slow path instead of triggering a full reset.
export const safeMigrate = (
  persistedState: unknown,
  fromVersion: number,
): unknown => {
  if (!isPlainObject(persistedState)) {
    logger
      .withMetadata({ fromVersion, type: typeof persistedState })
      .warn(
        "Persist migrate: persistedState is not a plain object, returning as-is",
      );
    return persistedState;
  }

  const state = persistedState;
  for (const step of MIGRATION_STEPS) {
    if (fromVersion >= step.to) continue;

    let snapshot: MutableState | null = null;
    try {
      snapshot = structuredClone(state);
    } catch (cloneError) {
      logger
        .withMetadata({
          migrationFrom: fromVersion,
          migrationTo: step.to,
          action: step.label,
        })
        .withError(cloneError)
        .warn(
          "Persist migration step: structuredClone failed; running step without snapshot guard",
        );
    }

    try {
      step.apply(state);
    } catch (error) {
      if (snapshot) {
        restoreSnapshot(state, snapshot);
      }
      logger
        .withMetadata({
          migrationFrom: fromVersion,
          migrationTo: step.to,
          action: step.label,
          reverted: snapshot !== null,
        })
        .withError(error)
        .error(
          "Persist migration step threw; reverted to pre-step snapshot and continuing",
        );
    }
  }

  return state;
};
