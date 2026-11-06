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
  currentOutcome,
  isRandomizedPool,
  pickRandomOutcome,
  type RandomizerOutcome,
  randomizerPool,
} from "@/lib/mods/skin-randomizer";
import { type State, usePersistedStore } from "@/lib/store";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
import { type LocalMod, type ModFileTree, ModStatus } from "@/types/mods";

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

/**
 * The file tree to install a skin with, or null when installing it would need
 * the user to pick files. Old downloads have no stored tree, so theirs is read
 * from disk the way a normal install would.
 */
const silentFileTree = async (mod: LocalMod): Promise<ModFileTree | null> => {
  if (mod.installedFileTree) {
    return mod.installedFileTree;
  }
  const tree = await readModFileTree(mod);
  return tree.has_multiple_files ? null : tree;
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

  const uninstallMod = useCallback(async (mod: LocalMod) => {
    const state = usePersistedStore.getState();
    try {
      await invoke("uninstall_mod", {
        modId: mod.remoteId,
        vpks: mod.installedVpks ?? [],
        profileFolder: state.getActiveProfile()?.folderName ?? null,
      });
      state.setModStatus(mod.remoteId, ModStatus.Downloaded);
      state.setModEnabledInCurrentProfile(mod.remoteId, false);
      return true;
    } catch (error) {
      logger
        .withMetadata({ modId: mod.remoteId })
        .withError(error)
        .error("Failed to take off a randomized mod");
      return false;
    }
  }, []);

  const installMod = useCallback(
    async (
      mod: LocalMod,
      fileTree: ModFileTree,
      analyticsEntryPoint: ModEntryPoint,
    ) => {
      const state = usePersistedStore.getState();
      const result = await install(
        mod,
        {
          analyticsEntryPoint,
          analyticsOperationKind: "randomize",
          onStart: (m) => state.setModStatus(m.remoteId, ModStatus.Installing),
          onComplete: (m, installed) => {
            state.setModStatus(m.remoteId, ModStatus.Installed);
            state.setInstalledVpks(
              m.remoteId,
              installed.installed_vpks,
              installed.file_tree,
            );
            state.setModEnabledInCurrentProfile(m.remoteId, true);
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
   * rolled and what was on stays on. Returns false when the swap failed.
   */
  const roll = useCallback(
    async (
      pool: RandomizerOutcome<LocalMod>[],
      active: LocalMod[],
      analyticsEntryPoint: ModEntryPoint,
    ) => {
      const fileTrees = new Map<string, ModFileTree>();
      const installable: typeof pool = [];
      for (const outcome of pool) {
        if (outcome === null) {
          installable.push(outcome);
          continue;
        }
        const fileTree = await silentFileTree(outcome).catch(() => null);
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
        return true;
      }
      const pick = pickRandomOutcome(installable, currentOutcome(active));
      const result = await applyHeroSelection(active, pick ? [pick] : [], {
        uninstall: uninstallMod,
        install: (mod) => {
          const fileTree = fileTrees.get(mod.remoteId);
          return fileTree
            ? installMod(mod, fileTree, analyticsEntryPoint)
            : Promise.resolve(false);
        },
      });
      return result !== "aborted";
    },
    [installMod, uninstallMod],
  );

  const randomize = useCallback(async () => {
    let failed = false;

    const pools = groupRandomizerPools(
      randomizedGroups(usePersistedStore.getState()),
      usePersistedStore.getState().localMods,
    );
    for (const { group, pool, active } of pools) {
      try {
        failed = !(await roll(pool, active, "library")) || failed;
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
          failed = !(await roll(pool, group.activeSkins, "skins")) || failed;
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
