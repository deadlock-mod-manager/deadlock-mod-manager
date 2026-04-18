import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import logger from "@/lib/logger";
import { type CrosshairState, createCrosshairSlice } from "./slices/crosshair";
import { createGameSlice, type GameState } from "./slices/game";
import { createModsSlice, type ModsState } from "./slices/mods";
import { createNetworkSlice, type NetworkState } from "./slices/network";
import { createProfilesSlice, type ProfilesState } from "./slices/profiles";
import { createScrollSlice, type ScrollState } from "./slices/scroll";
import { createSettingsSlice, type SettingsState } from "./slices/settings";
import { createUISlice, type UIState } from "./slices/ui";
import storage from "./storage";

const PersistedModSchema = z.object({ status: z.string() }).passthrough();

const PersistedProfileSchema = z
  .object({ mods: z.array(PersistedModSchema).default([]) })
  .passthrough();

const MigrationV10StateSchema = z.object({
  localMods: z.array(PersistedModSchema).default([]),
  profiles: z.record(z.string(), PersistedProfileSchema).default({}),
});

export type State = ModsState &
  ProfilesState &
  GameState &
  SettingsState &
  NetworkState &
  UIState &
  ScrollState &
  CrosshairState;

export const usePersistedStore = create<State>()(
  persist(
    (...a) => ({
      ...createModsSlice(...a),
      ...createProfilesSlice(...a),
      ...createGameSlice(...a),
      ...createSettingsSlice(...a),
      ...createNetworkSlice(...a),
      ...createUISlice(...a),
      ...createScrollSlice(...a),
      ...createCrosshairSlice(...a),
    }),
    {
      name: "local-config",
      version: 18,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;

        // Migration from version 1 to 2: Add profiles system
        if (version === 1) {
          logger
            .withMetadata({
              migrationFrom: 1,
              migrationTo: 2,
              action: "add-profiles-system",
            })
            .info("Migrating from version 1 to 2");
          const now = new Date();

          // Build enabledMods from currently installed mods
          const enabledMods: Record<
            string,
            { remoteId: string; enabled: boolean; lastModified: Date }
          > = {};
          if (Array.isArray(state.localMods)) {
            state.localMods.forEach((mod: unknown) => {
              const modObj = mod as Record<string, unknown>;
              if (
                modObj.status === "installed" &&
                typeof modObj.remoteId === "string"
              ) {
                enabledMods[modObj.remoteId] = {
                  remoteId: modObj.remoteId,
                  enabled: true,
                  lastModified: now,
                };
              }
            });
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
          state.activeProfileId = "default";
          state.isSwitching = false;
        }

        // Migration from version 2 to 3: Add folderName to profiles
        if (version <= 2) {
          logger
            .withMetadata({
              migrationFrom: 2,
              migrationTo: 3,
              action: "add-foldername-to-profiles",
            })
            .info(
              "Migrating from version 2 to 3: Adding folderName to profiles",
            );
          const profiles = state.profiles as Record<string, unknown>;

          if (profiles && typeof profiles === "object") {
            for (const [profileId, profile] of Object.entries(profiles)) {
              const profileObj = profile as Record<string, unknown>;

              // Default profile gets null folderName (uses root addons)
              if (profileId === "default" || profileObj.isDefault === true) {
                profileObj.folderName = null;
              } else {
                // Non-default profiles: generate folder name from profile ID and name
                // Use existing profile ID as-is (it should already be formatted correctly)
                const profileName =
                  typeof profileObj.name === "string"
                    ? profileObj.name
                    : "profile";

                // Sanitize name for folder
                const sanitizedName = profileName
                  .toLowerCase()
                  .replace(/[^a-z0-9-_]/g, "-")
                  .replace(/^-+|-+$/g, "");

                profileObj.folderName = `${profileId}_${sanitizedName}`;
              }
            }
          }
        }

        // Migration from version 3 to 4: Add mods array to each profile
        if (version <= 3) {
          logger
            .withMetadata({
              migrationFrom: 3,
              migrationTo: 4,
              action: "add-mods-array-to-profiles",
            })
            .info(
              "Migrating from version 3 to 4: Adding mods array to profiles",
            );
          const profiles = state.profiles as Record<string, unknown>;
          const activeProfileId = state.activeProfileId as string;
          const localMods = state.localMods as unknown[];

          if (profiles && typeof profiles === "object") {
            for (const [profileId, profile] of Object.entries(profiles)) {
              const profileObj = profile as Record<string, unknown>;

              // Active profile gets the current localMods
              if (profileId === activeProfileId) {
                profileObj.mods = Array.isArray(localMods)
                  ? [...localMods]
                  : [];
              } else {
                // Non-active profiles start with empty mods array
                profileObj.mods = [];
              }
            }
          }
        }

        // Migration from version 4 to 5: Add crosshair history
        if (version <= 4) {
          logger
            .withMetadata({
              migrationFrom: 4,
              migrationTo: 5,
              action: "add-crosshair-history",
            })
            .info("Migrating from version 4 to 5: Adding crosshair history");
          state.activeCrosshairHistory = [];
        }

        // Migration from version 5 to 6: Add activeCrosshair field
        if (version <= 5) {
          logger
            .withMetadata({
              migrationFrom: 5,
              migrationTo: 6,
              action: "add-active-crosshair-field",
            })
            .info(
              "Migrating from version 5 to 6: Adding activeCrosshair field",
            );
          const history = state.activeCrosshairHistory as unknown[];
          state.activeCrosshair =
            Array.isArray(history) && history.length > 0 ? history[0] : null;
        }

        // Migration from version 6 to 7: Add crosshairFilters field
        if (version <= 6) {
          logger
            .withMetadata({
              migrationFrom: 6,
              migrationTo: 7,
              action: "add-crosshair-filters-field",
            })
            .info(
              "Migrating from version 6 to 7: Adding crosshairFilters field",
            );
          state.crosshairFilters = {
            selectedHeroes: [],
            selectedTags: [],
            currentSort: "last updated",
            filterMode: "include",
            searchQuery: "",
          };
        }

        // Migration from version 7 to 8: Add linuxGpuOptimization field
        if (version <= 7) {
          logger
            .withMetadata({
              migrationFrom: 7,
              migrationTo: 8,
              action: "add-linux-gpu-optimization-field",
            })
            .info(
              "Migrating from version 7 to 8: Adding linuxGpuOptimization field",
            );
          state.linuxGpuOptimization = "auto";
        }

        // Migration from version 8 to 9: Rename showAudioOnly/showNSFW to hideAudio/hideNSFW, add hideOutdated
        if (version <= 8) {
          logger
            .withMetadata({
              migrationFrom: 8,
              migrationTo: 9,
              action: "rename-filter-fields-add-hide-outdated",
            })
            .info(
              "Migrating from version 8 to 9: Renaming filter fields and adding hideOutdated",
            );
          const modsFilters = state.modsFilters as
            | Record<string, unknown>
            | undefined;
          if (modsFilters) {
            if ("showAudioOnly" in modsFilters) {
              modsFilters.hideAudio = false;
              delete modsFilters.showAudioOnly;
            }
            if ("showNSFW" in modsFilters) {
              modsFilters.hideNSFW = false;
              delete modsFilters.showNSFW;
            }
            modsFilters.hideOutdated = false;
          }
        }

        // Migration from version 9 to 10: Reset stuck installing mods to downloaded
        if (version <= 9) {
          logger
            .withMetadata({
              migrationFrom: 9,
              migrationTo: 10,
              action: "reset-stuck-installing-mods",
            })
            .info(
              "Migrating from version 9 to 10: Resetting stuck installing mods",
            );

          const parsed = MigrationV10StateSchema.safeParse(state);
          if (parsed.success) {
            const resetInstallingStatus = (
              mod: z.infer<typeof PersistedModSchema>,
            ) => {
              if (mod.status === "installing") {
                mod.status = "downloaded";
              }
            };

            for (const mod of parsed.data.localMods) {
              resetInstallingStatus(mod);
            }
            state.localMods = parsed.data.localMods;

            for (const profile of Object.values(parsed.data.profiles)) {
              for (const mod of profile.mods) {
                resetInstallingStatus(mod);
              }
            }
            state.profiles = parsed.data.profiles;
          } else {
            logger
              .withMetadata({ errors: parsed.error.flatten() })
              .warn(
                "Skipping v9→v10 migration: persisted state did not match expected shape",
              );
          }
        }

        // Migration from version 10 to 11: selectedDownload -> selectedDownloads
        if (version <= 10) {
          logger
            .withMetadata({
              migrationFrom: 10,
              migrationTo: 11,
              action: "selectedDownload-to-selectedDownloads",
            })
            .info(
              "Migrating from version 10 to 11: Converting selectedDownload to selectedDownloads",
            );

          const migrateModDownload = (mod: Record<string, unknown>) => {
            const selectedDownload = mod.selectedDownload;
            if (selectedDownload && !mod.selectedDownloads) {
              return {
                ...mod,
                selectedDownloads: [selectedDownload],
                selectedDownload: undefined,
              };
            }
            return mod;
          };

          if (Array.isArray(state.localMods)) {
            state.localMods = state.localMods.map(migrateModDownload);
          }

          if (
            state.profiles &&
            typeof state.profiles === "object" &&
            !Array.isArray(state.profiles)
          ) {
            for (const profile of Object.values(
              state.profiles as Record<string, Record<string, unknown>>,
            )) {
              if (Array.isArray(profile.mods)) {
                profile.mods = profile.mods.map(migrateModDownload);
              }
            }
          }
        }

        // Migration from version 11 to 12: Convert linuxGpuOptimization from boolean to tri-state
        if (version <= 11) {
          logger
            .withMetadata({
              migrationFrom: 11,
              migrationTo: 12,
              action: "linux-gpu-optimization-tristate",
            })
            .info(
              "Migrating from version 11 to 12: Converting linuxGpuOptimization to tri-state",
            );
          const current = state.linuxGpuOptimization;
          if (current === true) {
            state.linuxGpuOptimization = "auto";
          } else if (current === false) {
            state.linuxGpuOptimization = "off";
          } else if (
            current !== "auto" &&
            current !== "on" &&
            current !== "off"
          ) {
            state.linuxGpuOptimization = "auto";
          }
        }

        // Migration from version 12 to 13: Add backup settings
        if (version <= 12) {
          logger
            .withMetadata({
              migrationFrom: 12,
              migrationTo: 13,
              action: "add-backup-settings",
            })
            .info("Migrating from version 12 to 13: Adding backup settings");
          state.backupEnabled = true;
          state.maxBackupCount = 5;
        }

        // Migration from version 13 to 14: Add fileserver / network settings
        if (version <= 13) {
          logger
            .withMetadata({
              migrationFrom: 13,
              migrationTo: 14,
              action: "add-fileserver-settings",
            })
            .info(
              "Migrating from version 13 to 14: Adding fileserver preferences",
            );
          state.fileserverPreference = "default";
          state.fileserverLatencyMs = {};
        }

        // Migration from version 14 to 15: hideAudio/hideMap booleans -> audioQuickFilter/mapQuickFilter
        if (version <= 14) {
          logger
            .withMetadata({
              migrationFrom: 14,
              migrationTo: 15,
              action: "mods-filters-audio-map-quick-filter",
            })
            .info(
              "Migrating from version 14 to 15: Converting map/audio quick filters to tri-state",
            );
          const modsFilters = state.modsFilters as
            | Record<string, unknown>
            | undefined;
          if (modsFilters) {
            if ("hideAudio" in modsFilters) {
              const hideAudio = modsFilters.hideAudio;
              modsFilters.audioQuickFilter =
                hideAudio === true ? "exclude" : "off";
              delete modsFilters.hideAudio;
            } else if (!("audioQuickFilter" in modsFilters)) {
              modsFilters.audioQuickFilter = "off";
            }
            if ("hideMap" in modsFilters) {
              const hideMap = modsFilters.hideMap;
              modsFilters.mapQuickFilter = hideMap === true ? "exclude" : "off";
              delete modsFilters.hideMap;
            } else if (!("mapQuickFilter" in modsFilters)) {
              modsFilters.mapQuickFilter = "off";
            }
          }
        }

        // Migration from version 15 to 16: Add proxy configuration
        if (version <= 15) {
          logger
            .withMetadata({
              migrationFrom: 15,
              migrationTo: 16,
              action: "add-proxy-config",
            })
            .info(
              "Migrating from version 15 to 16: Adding proxy configuration",
            );
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
        }

        // Migration from version 16 to 17: Add occult geometry appearance toggles
        if (version <= 16) {
          logger
            .withMetadata({
              migrationFrom: 16,
              migrationTo: 17,
              action: "add-occult-geometry-toggles",
            })
            .info(
              "Migrating from version 16 to 17: Adding occult geometry toggles",
            );
          state.showOccultGeometry = true;
          state.animateOccultGeometry = true;
        }

        // Migration from version 17 to 18: Reset detectedHero to re-trigger hero detection with fixed VPK lookup
        if (version <= 17) {
          logger
            .withMetadata({
              migrationFrom: version,
              migrationTo: 18,
              action: "reset-detected-hero",
            })
            .info(
              "Migrating from version 17 to 18: Resetting detectedHero for re-scan",
            );
          if (Array.isArray(state.localMods)) {
            for (const mod of state.localMods as Record<string, unknown>[]) {
              delete mod.detectedHero;
            }
          }
          if (
            state.profiles &&
            typeof state.profiles === "object" &&
            !Array.isArray(state.profiles)
          ) {
            for (const profile of Object.values(
              state.profiles as Record<string, Record<string, unknown>>,
            )) {
              if (Array.isArray(profile.mods)) {
                for (const mod of profile.mods as Record<string, unknown>[]) {
                  delete mod.detectedHero;
                }
              }
            }
          }
        }

        // Migration from version 15 to 16: Add hero parser interval setting
        if (version <= 15) {
          logger
            .withMetadata({
              migrationFrom: version,
              migrationTo: 16,
              action: "add-hero-parser-interval",
            })
            .info("Migrating to version 16: Adding heroParserIntervalSeconds");
          state.heroParserIntervalSeconds = 30;
        }

        return state;
      },
      partialize: (state) => {
        // Only include stable state that should be persisted
        // Exclude ephemeral state from persistence
        const {
          modProgress: _modProgress,
          isSwitching: _isSwitching,
          showWhatsNew: _showWhatsNew,
          lastSeenVersion: _lastSeenVersion,
          forceShowWhatsNew: _forceShowWhatsNew,
          markVersionAsSeen: _markVersionAsSeen,
          setShowWhatsNew: _setShowWhatsNew,
          // Exclude analysis dialog state (ephemeral)
          analysisResult: _analysisResult,
          analysisDialogOpen: _analysisDialogOpen,
          heroDetection: _heroDetection,
          ...rest
        } = state;
        return rest;
      },
    },
  ),
);
