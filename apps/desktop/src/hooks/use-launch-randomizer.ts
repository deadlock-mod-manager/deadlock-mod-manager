import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { readModFileTree } from "@/lib/mods/read-mod-file-tree";
import { createLogger } from "@/lib/logger";
import type { ModEntryPoint } from "@/lib/analytics/schema";
import type { LaunchStep } from "@/lib/launch-progress";
import {
  groupRandomizerPools,
  randomizedGroupModIds,
} from "@/lib/mods/group-randomizer";
import { groupModsByHero } from "@/lib/mods/hero-mods";
import { applyHeroSelection } from "@/lib/mods/hero-selection";
import {
  applyDownloadTimeSelection,
  previousInstallSelection,
  requiresFileSelection,
} from "@/lib/mods/mod-variants";
import {
  currentOutcome,
  isRandomizedPool,
  pickRandomOutcome,
  type RandomizerOutcome,
  randomizerPool,
} from "@/lib/mods/skin-randomizer";
import { type State, usePersistedStore } from "@/lib/store";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import { type LocalMod, type ModFileTree, ModStatus } from "@/types/mods";
import type { ProfileId, VpkManifest } from "@/types/profiles";

const logger = createLogger("launch-randomizer");

const randomizedGroups = (state: State) =>
  (state.getActiveProfile()?.modGroups ?? EMPTY_MOD_GROUPS).filter(
    (group) => group.randomize,
  );

/** The checklist step for what the next launch rolls, or null when nothing. */
export const launchRandomizerStep = (state: State): LaunchStep | null => {
  if (randomizedGroups(state).length > 0) {
    return "randomizingMods";
  }
  return state.skinRandomizerEnabled ? "randomizingSkins" : null;
};

/** The profile a launch started on; a roll never touches another one. */
type RollProfile = {
  id: ProfileId;
  folder: string | null;
  manifest?: VpkManifest;
};

/**
 * The file tree to install a mod with, or null when installing it would need
 * the user to pick files. It reuses the earlier choices a normal install does.
 * Old downloads have no stored tree, so theirs is read from disk.
 */
const silentFileTree = async (
  mod: LocalMod,
  manifest?: VpkManifest,
): Promise<ModFileTree | null> => {
  if (mod.installedFileTree) {
    if (!requiresFileSelection(mod.installedFileTree)) {
      return mod.installedFileTree;
    }
    return (
      previousInstallSelection(mod, manifest) ??
      applyDownloadTimeSelection(mod, mod.installedFileTree)
    );
  }
  const tree = await readModFileTree(mod);
  return tree.has_multiple_files ? applyDownloadTimeSelection(mod, tree) : tree;
};

/** Installed mods outside `active` that need one of its members to work. */
const dependentsOf = (
  active: readonly LocalMod[],
  mods: readonly LocalMod[],
): LocalMod[] => {
  const ids = new Set(active.map((mod) => mod.remoteId));
  return mods.filter(
    (mod) =>
      mod.status === ModStatus.Installed &&
      !ids.has(mod.remoteId) &&
      (mod.dependencies ?? []).some(
        (dependency) =>
          dependency.level !== "recommended" &&
          !dependency.mustBeDisabled &&
          !!dependency.remoteId &&
          ids.has(dependency.remoteId),
      ),
  );
};

/**
 * Rolls one mod for every randomized library group, then a skin for every hero
 * with a randomizer pool, and puts them on before the game starts. It is silent
 * on purpose: the pick is meant to be found in game, so nothing here names a
 * mod, and a failed swap only says that one happened.
 */
export const useLaunchRandomizer = () => {
  const { t } = useTranslation();
  const { install } = useInstallWithCollection();

  const uninstallMod = useCallback(
    async (mod: LocalMod, profile: RollProfile) => {
      const state = usePersistedStore.getState();
      try {
        await invoke("uninstall_mod", {
          modId: mod.remoteId,
          vpks: mod.installedVpks ?? [],
          profileFolder: profile.folder,
        });
        state.setModStatus(mod.remoteId, ModStatus.Downloaded);
        state.setModEnabledInProfile(profile.id, mod.remoteId, false);
        return true;
      } catch (error) {
        logger
          .withMetadata({ modId: mod.remoteId })
          .withError(error)
          .error("Failed to take off a randomized mod");
        return false;
      }
    },
    [],
  );

  const installMod = useCallback(
    async (
      mod: LocalMod,
      fileTree: ModFileTree,
      analyticsEntryPoint: ModEntryPoint,
      profile: RollProfile,
    ) => {
      const state = usePersistedStore.getState();
      // A retry can put back a mod the roll just took off, so its pool entry
      // still reads as installed; install the store's current copy.
      const current =
        state.localMods.find((local) => local.remoteId === mod.remoteId) ?? mod;
      const result = await install(
        current,
        {
          analyticsEntryPoint,
          analyticsOperationKind: "randomize",
          unattended: true,
          onStart: (m) => state.setModStatus(m.remoteId, ModStatus.Installing),
          onComplete: (m, installed) => {
            state.setModStatus(m.remoteId, ModStatus.Installed);
            state.setInstalledVpks(
              m.remoteId,
              installed.installed_vpks,
              installed.file_tree,
            );
            state.setModEnabledInProfile(profile.id, m.remoteId, true);
          },
          onCancel: (m) => state.setModStatus(m.remoteId, ModStatus.Downloaded),
          onError: (m, error) => {
            state.setModStatus(m.remoteId, ModStatus.Downloaded);
            logger
              .withMetadata({ modId: m.remoteId })
              .withError(error)
              .error("Failed to put on a randomized mod");
          },
        },
        fileTree,
      );
      return result !== null;
    },
    [install],
  );

  /**
   * Swaps `active` for one roll from `pool`. Every candidate is checked before
   * anything is taken off, so a mod that turns out to need a file pick is never
   * rolled. A pick that would need a prompt to install (a model conflict with a
   * mod outside the pool, or a missing requirement) is cancelled, and the roll
   * moves on to the rest, what was on before included. Nothing is taken off
   * while another installed mod needs it. Returns false when nothing could be
   * put on, or when the user switched profiles mid-roll.
   */
  const roll = useCallback(
    async (
      pool: RandomizerOutcome<LocalMod>[],
      active: LocalMod[],
      analyticsEntryPoint: ModEntryPoint,
      profile: RollProfile,
    ) => {
      const onProfile = () =>
        usePersistedStore.getState().activeProfileId === profile.id;
      const dependents = dependentsOf(
        active,
        usePersistedStore.getState().localMods,
      );
      if (dependents.length > 0) {
        logger
          .withMetadata({ dependents: dependents.map((mod) => mod.remoteId) })
          .warn("Skipping a roll that would take off a required mod");
        return false;
      }
      const fileTrees = new Map<string, ModFileTree>();
      const installable: typeof pool = [];
      for (const outcome of pool) {
        if (outcome === null) {
          installable.push(outcome);
          continue;
        }
        const fileTree = await silentFileTree(outcome, profile.manifest).catch(
          () => null,
        );
        if (fileTree) {
          fileTrees.set(outcome.remoteId, fileTree);
          installable.push(outcome);
        } else {
          logger
            .withMetadata({ modId: outcome.remoteId })
            .warn("Skipping a randomized mod that needs a file selection");
        }
      }
      if (installable.length === 0) {
        return false;
      }
      let current = active;
      let candidates = installable;
      while (candidates.length > 0) {
        const pick = pickRandomOutcome(candidates, currentOutcome(current));
        const result = await applyHeroSelection(current, pick ? [pick] : [], {
          uninstall: (mod) =>
            onProfile() ? uninstallMod(mod, profile) : Promise.resolve(false),
          install: (mod) => {
            const fileTree = fileTrees.get(mod.remoteId);
            return fileTree && onProfile()
              ? installMod(mod, fileTree, analyticsEntryPoint, profile)
              : Promise.resolve(false);
          },
        });
        if (result !== "aborted") {
          return true;
        }
        const installed = new Set(
          usePersistedStore
            .getState()
            .localMods.filter((mod) => mod.status === ModStatus.Installed)
            .map((mod) => mod.remoteId),
        );
        current = current.filter((mod) => installed.has(mod.remoteId));
        // A failed uninstall leaves things as they are rather than stacking.
        if (current.length > 0 || !onProfile()) {
          return false;
        }
        candidates = candidates.filter((outcome) => outcome !== pick);
      }
      return false;
    },
    [installMod, uninstallMod],
  );

  const randomize = useCallback(async () => {
    let failed = false;

    const start = usePersistedStore.getState();
    const folder = start.getActiveProfile()?.folderName ?? null;
    const profile: RollProfile = {
      id: start.activeProfileId,
      folder,
      // It only lets more variant mods roll, so a failed read leaves them out.
      manifest: await getProfileVpkSnapshot(folder)
        .then((snapshot) => snapshot.manifest)
        .catch((error) => {
          logger
            .withMetadata({ profileFolder: folder })
            .withError(error)
            .warn("Rolling without the profile manifest");
          return undefined;
        }),
    };
    const pools = groupRandomizerPools(
      randomizedGroups(start),
      usePersistedStore.getState().localMods,
      profile.manifest,
    );
    for (const { group, pool, active } of pools) {
      try {
        failed = !(await roll(pool, active, "library", profile)) || failed;
      } catch (error) {
        logger
          .withMetadata({ groupId: group.id })
          .withError(error)
          .error("Randomizing a mod group failed");
        failed = true;
      }
    }

    const state = usePersistedStore.getState();
    if (state.skinRandomizerEnabled) {
      // A hero with a skin in a randomized group already got its roll there,
      // and a second roll would take that skin straight back off. Hidden skins
      // count too: the hero list leaves them out but they still get installed.
      const rolled = randomizedGroupModIds(pools.map(({ group }) => group));
      const rolledHeroes = groupModsByHero(
        state.localMods.filter((mod) => rolled.has(mod.remoteId)),
        { includeExtras: false, hidden: new Set() },
      );
      const heroes = groupModsByHero(state.localMods, {
        includeExtras: false,
        hidden: new Set(Object.keys(state.hiddenHeroMods)),
      });
      const selection = {
        skins: state.randomizerSkins,
        defaultHeroes: state.randomizerDefaultHeroes,
      };
      for (const [hero, group] of heroes) {
        const pool = randomizerPool(hero, group, selection);
        if (!isRandomizedPool(pool) || rolledHeroes.has(hero)) {
          continue;
        }
        try {
          failed =
            !(await roll(pool, group.activeSkins, "skins", profile)) || failed;
        } catch (error) {
          logger
            .withMetadata({ hero })
            .withError(error)
            .error("Randomizing a hero failed");
          failed = true;
        }
      }
    }

    if (failed) {
      toast.warning(t("launch.randomizerFailed"));
    }
  }, [roll, t]);

  return { randomize };
};
