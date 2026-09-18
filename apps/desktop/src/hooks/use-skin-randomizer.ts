import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { createLogger } from "@/lib/logger";
import { groupModsByHero } from "@/lib/mods/hero-mods";
import { applyHeroSelection } from "@/lib/mods/hero-selection";
import {
  currentOutcome,
  isRandomizedPool,
  pickRandomOutcome,
  randomizerPool,
} from "@/lib/mods/skin-randomizer";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, type ModFileTree, ModStatus } from "@/types/mods";

const logger = createLogger("skin-randomizer");

/**
 * The file tree to install a skin with, or null when installing it would need
 * the user to pick files. Old downloads have no stored tree, so theirs is read
 * from disk the way a normal install would.
 */
const silentFileTree = async (mod: LocalMod): Promise<ModFileTree | null> => {
  if (mod.installedFileTree) {
    return mod.installedFileTree;
  }
  const modDir = await join(await appLocalDataDir(), "mods", mod.remoteId);
  const tree = await invoke<ModFileTree>("get_mod_file_tree", {
    modPath: modDir,
  });
  return tree.has_multiple_files ? null : tree;
};

/**
 * Rolls a skin for every hero with a randomizer pool and puts it on, before the
 * game starts. It is silent on purpose: the pick is meant to be found in game,
 * so nothing here names a skin, and a failed swap only says that one happened.
 */
export const useSkinRandomizer = () => {
  const { t } = useTranslation();
  const { install } = useInstallWithCollection();

  const uninstallSkin = useCallback(async (mod: LocalMod) => {
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
        .error("Failed to take off a randomized skin");
      return false;
    }
  }, []);

  const installSkin = useCallback(
    async (mod: LocalMod, fileTree: ModFileTree) => {
      const state = usePersistedStore.getState();
      const result = await install(
        mod,
        {
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
          onError: (m, error) => {
            state.setModStatus(m.remoteId, ModStatus.Downloaded);
            logger
              .withMetadata({ modId: m.remoteId })
              .withError(error)
              .error("Failed to put on a randomized skin");
          },
        },
        fileTree,
      );
      return result !== null;
    },
    [install],
  );

  const randomizeSkins = useCallback(async () => {
    const state = usePersistedStore.getState();
    if (!state.skinRandomizerEnabled) {
      return;
    }

    const groups = groupModsByHero(state.localMods, {
      includeExtras: false,
      hidden: new Set(Object.keys(state.hiddenHeroMods)),
    });
    const selection = {
      skins: state.randomizerSkins,
      defaultHeroes: state.randomizerDefaultHeroes,
    };

    let failed = false;
    for (const [hero, group] of groups) {
      const pool = randomizerPool(hero, group, selection);
      if (!isRandomizedPool(pool)) {
        continue;
      }
      // Check every skin before anything is taken off, so a skin that turns
      // out to need a file pick is never rolled and the hero keeps its look.
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
            .warn("Skipping a randomized skin that needs a file selection");
        }
      }
      if (installable.length === 0) {
        continue;
      }
      const pick = pickRandomOutcome(installable, currentOutcome(group));
      try {
        const result = await applyHeroSelection(
          group.activeSkins,
          pick ? [pick] : [],
          {
            uninstall: uninstallSkin,
            install: (mod) => {
              const fileTree = fileTrees.get(mod.remoteId);
              return fileTree
                ? installSkin(mod, fileTree)
                : Promise.resolve(false);
            },
          },
        );
        failed ||= result === "aborted";
      } catch (error) {
        logger
          .withMetadata({ hero })
          .withError(error)
          .error("Randomizing a hero failed");
        failed = true;
      }
    }

    if (failed) {
      toast.warning(t("skins.randomizer.launchFailed"));
    }
  }, [installSkin, uninstallSkin, t]);

  return { randomizeSkins };
};
